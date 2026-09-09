alter table public.folio_usage add column answers integer not null default 0;
create table public.folio_answers (
  id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.folio_workspaces(id),request_key text not null,
  created_at bigint not null,data jsonb not null,unique(owner_id,request_key)
);
create table public.folio_embeddings (
  document_id uuid not null references public.folio_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  index_key text not null,data jsonb not null,primary key(document_id,index_key)
);
alter table public.folio_answers enable row level security;
alter table public.folio_embeddings enable row level security;
revoke all on public.folio_answers,public.folio_embeddings from anon,authenticated;
grant all on public.folio_answers,public.folio_embeddings to service_role;
create function public.folio_commit_answer(p_answer jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_owner uuid:=(p_answer->>'ownerId')::uuid;v_workspace uuid:=(p_answer->>'workspaceId')::uuid;v_previous jsonb;v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.folio_workspaces where id=v_workspace and owner_id=v_owner) then return jsonb_build_object('status',404,'error','Workspace not found.');end if;
  select data into v_previous from public.folio_answers where owner_id=v_owner and request_key=p_answer->>'requestKey';
  if v_previous is not null then
    if v_previous->>'fingerprint'<>p_answer->>'fingerprint' then return jsonb_build_object('status',409,'error','This retry key belongs to a different question.');end if;
    return jsonb_build_object('answer',v_previous);
  end if;
  insert into public.folio_usage(owner_id) values(v_owner) on conflict do nothing;
  select answers into v_count from public.folio_usage where owner_id=v_owner;
  if v_count>=20 then return jsonb_build_object('status',429,'error','Your 20 lifetime answers are used. Saved work remains available.');end if;
  insert into public.folio_answers(id,owner_id,workspace_id,request_key,created_at,data) values((p_answer->>'id')::uuid,v_owner,v_workspace,p_answer->>'requestKey',(p_answer->>'createdAt')::bigint,p_answer);
  update public.folio_usage set answers=answers+1 where owner_id=v_owner;
  return jsonb_build_object('answer',p_answer);
end $$;
revoke all on function public.folio_commit_answer(jsonb) from public,anon,authenticated;
grant execute on function public.folio_commit_answer(jsonb) to service_role;
