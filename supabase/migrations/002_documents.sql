create table public.folio_documents (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.folio_workspaces(id),
  request_key text not null,
  data jsonb not null,
  unique(owner_id,request_key)
);
create table public.folio_usage (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  uploads integer not null default 0,
  processed_pages integer not null default 0,
  stored_bytes bigint not null default 0
);
alter table public.folio_documents enable row level security;
alter table public.folio_usage enable row level security;
revoke all on public.folio_documents,public.folio_usage from anon,authenticated;
grant all on public.folio_documents,public.folio_usage to service_role;

-- Serialize success accounting across all API instances, including retries.
create function public.folio_commit_upload(p_document jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := (p_document->>'ownerId')::uuid;
  v_workspace uuid := (p_document->>'workspaceId')::uuid;
  v_previous jsonb;
  v_uploads integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.folio_workspaces where id=v_workspace and owner_id=v_owner) then
    return jsonb_build_object('error','Workspace not found.','status',404);
  end if;
  select data into v_previous from public.folio_documents where owner_id=v_owner and request_key=p_document->>'requestKey';
  if v_previous is not null then
    if v_previous->>'contentHash' <> p_document->>'contentHash' or v_previous->>'workspaceId' <> p_document->>'workspaceId' then
      return jsonb_build_object('error','This retry key belongs to a different upload.','status',409);
    end if;
    return jsonb_build_object('document',v_previous);
  end if;
  insert into public.folio_usage(owner_id) values(v_owner) on conflict do nothing;
  select uploads into v_uploads from public.folio_usage where owner_id=v_owner;
  if v_uploads>=3 then return jsonb_build_object('error','Your 3 lifetime uploads are used. Saved documents remain available.','status',429); end if;
  insert into public.folio_documents(id,owner_id,workspace_id,request_key,data)
    values((p_document->>'id')::uuid,v_owner,v_workspace,p_document->>'requestKey',p_document);
  update public.folio_usage set uploads=uploads+1,
    processed_pages=processed_pages+jsonb_array_length(p_document->'pages'),
    stored_bytes=stored_bytes+(p_document->>'bytes')::bigint where owner_id=v_owner;
  return jsonb_build_object('document',p_document);
end $$;
revoke all on function public.folio_commit_upload(jsonb) from public,anon,authenticated;
grant execute on function public.folio_commit_upload(jsonb) to service_role;
