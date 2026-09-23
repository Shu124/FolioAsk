-- Apply once after 007, before deploying conversation management.
-- Compatible with the previous app: the existing answer RPC gains metadata.
begin;
create table public.folio_deleted_answer_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null,
  primary key(owner_id,request_key)
);
alter table public.folio_deleted_answer_requests enable row level security;
revoke all on public.folio_deleted_answer_requests from public,anon,authenticated;
grant all on public.folio_deleted_answer_requests to service_role;
create table public.folio_conversations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.folio_workspaces(id) on delete cascade,
  updated_at bigint not null,
  deleted_at bigint,
  data jsonb not null
);
alter table public.folio_conversations enable row level security;
revoke all on public.folio_conversations from public,anon,authenticated;
grant all on public.folio_conversations to service_role;
create index folio_conversations_owner_project on public.folio_conversations(owner_id,workspace_id,updated_at desc);
insert into public.folio_conversations(id,owner_id,workspace_id,updated_at,data)
select (coalesce(data->>'threadId',id::text))::uuid,owner_id,workspace_id,max(created_at),
  jsonb_build_object('id',coalesce(data->>'threadId',id::text),'ownerId',owner_id,'workspaceId',workspace_id,
    'title',left((array_agg(data->>'question' order by created_at,id))[1],100),'archived',false,
    'createdAt',min(created_at),'updatedAt',max(created_at))
from public.folio_answers group by coalesce(data->>'threadId',id::text),owner_id,workspace_id;

-- Retain the existing upload/trash/quota/idempotency rules without duplicating them.
alter function public.folio_commit_answer(jsonb) rename to folio_commit_answer_before_conversations;
create function public.folio_commit_answer(p_answer jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_owner uuid:=(p_answer->>'ownerId')::uuid;
  v_workspace uuid:=(p_answer->>'workspaceId')::uuid;
  v_id uuid:=coalesce(p_answer->>'threadId',p_answer->>'id')::uuid;
  v_chat jsonb;v_result jsonb;v_time bigint:=(p_answer->>'createdAt')::bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  if exists(select 1 from public.folio_deleted_answer_requests where owner_id=v_owner and request_key=p_answer->>'requestKey') then return jsonb_build_object('status',410,'error','This question belonged to a deleted conversation. Start a new chat.');end if;
  select data into v_chat from public.folio_conversations where id=v_id for update;
  if v_chat is not null then
    if v_chat->>'ownerId'<>v_owner::text or v_chat->>'workspaceId'<>v_workspace::text then return jsonb_build_object('status',404,'error','Conversation not found.');end if;
    if v_chat ? 'deletedAt' then return jsonb_build_object('status',410,'error','This conversation was deleted. Start a new chat.');end if;
    if (v_chat->>'archived')::boolean then return jsonb_build_object('status',409,'error','Restore this conversation before asking another question.');end if;
  end if;
  v_result:=public.folio_commit_answer_before_conversations(p_answer);
  if v_result ? 'error' then return v_result;end if;
  -- Retried commits must use the stored answer identity, not the retry's new UUID.
  v_id:=coalesce(v_result->'answer'->>'threadId',v_result->'answer'->>'id')::uuid;
  select data into v_chat from public.folio_conversations where id=v_id;
  if v_chat is null then
    v_chat:=jsonb_build_object('id',v_id,'ownerId',v_owner,'workspaceId',v_workspace,
      'title',left(v_result->'answer'->>'question',100),'archived',false,
      'createdAt',(v_result->'answer'->>'createdAt')::bigint,'updatedAt',(v_result->'answer'->>'createdAt')::bigint);
  end if;
  v_time:=greatest((v_chat->>'updatedAt')::bigint,(v_result->'answer'->>'createdAt')::bigint);
  v_chat:=jsonb_set(v_chat,'{updatedAt}',to_jsonb(v_time));
  insert into public.folio_conversations(id,owner_id,workspace_id,updated_at,data) values(v_id,v_owner,v_workspace,v_time,v_chat)
  on conflict(id) do update set updated_at=excluded.updated_at,data=excluded.data;
  return v_result;
end $$;

create function public.folio_manage_conversation(p_owner uuid,p_workspace uuid,p_id uuid,p_change jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_chat jsonb;v_deleted bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select data into v_chat from public.folio_conversations where id=p_id and owner_id=p_owner and workspace_id=p_workspace and deleted_at is null for update;
  if v_chat is null then return jsonb_build_object('status',404,'error','Conversation not found.');end if;
  if p_change ? 'deletedAt' then
    v_deleted:=(p_change->>'deletedAt')::bigint;
    if v_deleted is null then return jsonb_build_object('status',400,'error','Invalid deletion time.');end if;
    -- Keep only a tombstone and ownership; no question/answer text remains.
    v_chat:=jsonb_set(v_chat||jsonb_build_object('deletedAt',v_deleted),'{title}','""'::jsonb);
    insert into public.folio_deleted_answer_requests select owner_id,request_key from public.folio_answers where owner_id=p_owner and workspace_id=p_workspace and coalesce(data->>'threadId',id::text)=p_id::text on conflict do nothing;
    delete from public.folio_answers where owner_id=p_owner and workspace_id=p_workspace and coalesce(data->>'threadId',id::text)=p_id::text;
  elsif jsonb_typeof(p_change->'title')='string' and length(trim(p_change->>'title')) between 1 and 100 then
    v_chat:=jsonb_set(v_chat,'{title}',to_jsonb(trim(p_change->>'title')));
  elsif jsonb_typeof(p_change->'archived')='boolean' then
    v_chat:=jsonb_set(v_chat,'{archived}',p_change->'archived');
  else return jsonb_build_object('status',400,'error','Provide a title or archive state.');end if;
  update public.folio_conversations set data=v_chat,deleted_at=v_deleted where id=p_id;
  return jsonb_build_object('conversation',v_chat);
end $$;
revoke all on function public.folio_commit_answer(jsonb) from public,anon,authenticated;
revoke all on function public.folio_manage_conversation(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.folio_commit_answer(jsonb) to service_role;
grant execute on function public.folio_manage_conversation(uuid,uuid,uuid,jsonb) to service_role;
commit;
