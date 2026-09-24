-- Apply after 001-008. Keeps the account/global budgets and permissions unchanged.
begin;
create or replace function public.folio_reserve_upload(p_document jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := (p_document->>'ownerId')::uuid;
  v_workspace uuid := (p_document->>'workspaceId')::uuid;
  v_bytes bigint := (p_document->>'bytes')::bigint;
  v_previous jsonb;
  v_policy public.folio_storage_policy%rowtype;
  v_pending_bytes bigint;
  v_pending_uploads bigint;
  v_total bigint;
  v_uploads bigint;
  v_stored bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('folio:storage',0));
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.folio_workspaces where id=v_workspace and owner_id=v_owner) then
    return jsonb_build_object('status',404,'error','Workspace not found.');
  end if;
  select data into v_previous from public.folio_documents where owner_id=v_owner and request_key=p_document->>'requestKey';
  if v_previous is not null then
    if v_previous->>'contentHash'<>p_document->>'contentHash' or v_previous->>'workspaceId'<>p_document->>'workspaceId' then
      return jsonb_build_object('status',409,'error','This retry key belongs to a different upload.');
    end if;
    return jsonb_build_object('document',v_previous);
  end if;
  if exists(select 1 from public.folio_storage_allocations where owner_id=v_owner and request_key=p_document->>'requestKey') then
    return jsonb_build_object('status',409,'code','UPLOAD_IN_PROGRESS','error','This upload is still processing or awaiting storage verification. Retry the same file later; do not start another copy.');
  end if;
  select coalesce(sum(bytes),0),count(*) into v_pending_bytes,v_pending_uploads
    from public.folio_storage_allocations where owner_id=v_owner and state='pending';
  select uploads,stored_bytes into v_uploads,v_stored from public.folio_usage where owner_id=v_owner;
  if coalesce(v_uploads,0)+v_pending_uploads>=3 then
    return jsonb_build_object('status',429,'code','FREE_UPLOAD_LIMIT','error','Your free upload allowance is used or reserved by pending uploads. View upgrade options for more capacity.');
  end if;
  if v_bytes is null or v_bytes<=0 or v_bytes>30000000 then
    return jsonb_build_object('status',413,'error','Free files must be 30 MB or smaller.');
  end if;
  if coalesce(v_stored,0)+v_pending_bytes+v_bytes>30000000 then
    return jsonb_build_object('status',429,'code','FREE_STORAGE_LIMIT','error','Your free 30 MB storage allowance would be exceeded. View upgrade options for more capacity.');
  end if;
  select * into strict v_policy from public.folio_storage_policy where singleton;
  select coalesce(sum(bytes),0) into v_total from public.folio_storage_allocations;
  if not v_policy.uploads_enabled or v_total+v_policy.external_bytes+v_bytes>v_policy.total_bytes then
    return jsonb_build_object('status',503,'code','STORAGE_PAUSED','error','Uploads are temporarily paused by the shared storage safeguard. Upgrading will not bypass this pause. Saved documents remain available.');
  end if;
  insert into public.folio_storage_allocations(id,owner_id,workspace_id,request_key,bytes,content_hash,original_key,state)
    values ((p_document->>'id')::uuid,v_owner,v_workspace,p_document->>'requestKey',v_bytes,p_document->>'contentHash',p_document->>'originalKey','pending');
  return '{}'::jsonb;
end $$;
revoke all on function public.folio_reserve_upload(jsonb) from public,anon,authenticated;
grant execute on function public.folio_reserve_upload(jsonb) to service_role;

-- A slower concurrent retry must never replace a longer indexing checkpoint.
create function public.folio_save_index_progress(p_document uuid,p_owner uuid,p_index_key text,p_chunks jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.folio_documents where id=p_document and owner_id=p_owner) then
    raise exception 'Document not found';
  end if;
  -- Matches MAX_INDEX_CHUNKS: 200k text characters plus 100 page boundaries.
  if jsonb_typeof(p_chunks) is distinct from 'array' or jsonb_array_length(p_chunks)>300 then
    raise exception 'Invalid index checkpoint';
  end if;
  insert into public.folio_embeddings(document_id,owner_id,index_key,data)
    values(p_document,p_owner,p_index_key,p_chunks)
    on conflict(document_id,index_key) do update set data=excluded.data
    where public.folio_embeddings.owner_id=excluded.owner_id
      and jsonb_array_length(excluded.data)>jsonb_array_length(public.folio_embeddings.data);
  return '{}'::jsonb;
end $$;
revoke all on function public.folio_save_index_progress(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.folio_save_index_progress(uuid,uuid,text,jsonb) to service_role;
commit;
