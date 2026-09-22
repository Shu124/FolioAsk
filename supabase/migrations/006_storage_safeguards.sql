-- Apply after 001-005, with uploads paused during deployment.
-- App safeguards only: inventory any pre-existing/untracked R2 objects separately.
begin;

create table public.folio_storage_policy (
  singleton boolean primary key default true check (singleton),
  total_bytes bigint not null default 8000000000 check (total_bytes > 0),
  external_bytes bigint not null default 0 check (external_bytes >= 0),
  uploads_enabled boolean not null default true,
  monthly_uploads integer not null default 100000 check (monthly_uploads >= 0),
  monthly_reads integer not null default 1000000 check (monthly_reads >= 0),
  uploads_per_minute integer not null default 10 check (uploads_per_minute >= 0),
  reads_per_minute integer not null default 120 check (reads_per_minute >= 0)
);
insert into public.folio_storage_policy(singleton) values (true);

-- Intentionally no cascading FK: deleting an account/metadata does not erase R2.
-- Pending reservations never expire automatically: an uncertain write may exist.
create table public.folio_storage_allocations (
  id uuid primary key,
  owner_id uuid not null,
  workspace_id uuid not null,
  request_key text not null,
  bytes bigint not null check (bytes > 0),
  content_hash text not null,
  original_key text not null,
  state text not null check (state in ('pending','committed')),
  created_at timestamptz not null default now(),
  unique(owner_id,request_key)
);
insert into public.folio_storage_allocations(id,owner_id,workspace_id,request_key,bytes,content_hash,original_key,state)
  select id,owner_id,workspace_id,request_key,(data->>'bytes')::bigint,
    data->>'contentHash',data->>'originalKey','committed' from public.folio_documents;

create table public.folio_storage_operations (
  scope text not null,
  operation text not null check (operation in ('upload','read')),
  window_start bigint not null,
  count bigint not null check (count >= 0),
  primary key(scope,operation)
);
alter table public.folio_storage_policy enable row level security;
alter table public.folio_storage_allocations enable row level security;
alter table public.folio_storage_operations enable row level security;
revoke all on public.folio_storage_policy,public.folio_storage_allocations,public.folio_storage_operations from public,anon,authenticated;
grant all on public.folio_storage_policy,public.folio_storage_allocations,public.folio_storage_operations to service_role;

create function public.folio_storage_snapshot(p_owner uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_policy public.folio_storage_policy%rowtype;
  v_pending_bytes bigint;
  v_pending_uploads bigint;
  v_total bigint;
begin
  select * into strict v_policy from public.folio_storage_policy where singleton;
  select coalesce(sum(bytes),0),count(*) into v_pending_bytes,v_pending_uploads
    from public.folio_storage_allocations where owner_id=p_owner and state='pending';
  select coalesce(sum(bytes),0) into v_total from public.folio_storage_allocations;
  return jsonb_build_object('reservedBytes',v_pending_bytes,'reservedUploads',v_pending_uploads,
    'uploadsPaused',not v_policy.uploads_enabled or v_total+v_policy.external_bytes>=v_policy.total_bytes);
end $$;

create function public.folio_admit_storage_operation(p_owner uuid,p_operation text,p_now bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_policy public.folio_storage_policy%rowtype;
  v_month bigint;
  v_minute bigint;
  v_month_limit bigint;
  v_minute_limit bigint;
  v_count bigint;
  v_scope text := 'owner:' || p_owner::text;
begin
  if p_operation not in ('upload','read') or p_now is null or p_owner is null then
    raise exception 'Invalid storage operation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('folio:storage',0));
  select * into strict v_policy from public.folio_storage_policy where singleton;
  v_month := (extract(epoch from date_trunc('month',to_timestamp(p_now/1000.0) at time zone 'UTC'))*1000)::bigint;
  v_minute := (p_now/60000)*60000;
  v_month_limit := case when p_operation='upload' then v_policy.monthly_uploads else v_policy.monthly_reads end;
  v_minute_limit := case when p_operation='upload' then v_policy.uploads_per_minute else v_policy.reads_per_minute end;
  select count into v_count from public.folio_storage_operations where scope='global' and operation=p_operation and window_start=v_month;
  if coalesce(v_count,0)>=v_month_limit then
    return jsonb_build_object('status',429,'code','STORAGE_RATE_LIMIT','error','The shared storage request budget is reached. Try again later. Upgrading will not bypass this safeguard.');
  end if;
  select count into v_count from public.folio_storage_operations where scope=v_scope and operation=p_operation and window_start=v_minute;
  if coalesce(v_count,0)>=v_minute_limit then
    return jsonb_build_object('status',429,'code','STORAGE_RATE_LIMIT','error','Too many storage requests. Wait a minute and try again.');
  end if;
  insert into public.folio_storage_operations(scope,operation,window_start,count) values ('global',p_operation,v_month,1),(v_scope,p_operation,v_minute,1)
    on conflict(scope,operation) do update set window_start=excluded.window_start,
      count=case when public.folio_storage_operations.window_start=excluded.window_start then public.folio_storage_operations.count+1 else 1 end;
  return '{}'::jsonb;
end $$;

create function public.folio_reserve_upload(p_document jsonb) returns jsonb
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
  if v_bytes is null or v_bytes<=0 or v_bytes>10000000 then
    return jsonb_build_object('status',413,'error','Free files must be 10 MB or smaller.');
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

create function public.folio_release_upload(p_id uuid,p_owner uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('folio:storage',0));
  delete from public.folio_storage_allocations where id=p_id and owner_id=p_owner and state='pending';
  return '{}'::jsonb;
end $$;

create or replace function public.folio_commit_upload(p_document jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := (p_document->>'ownerId')::uuid;
  v_workspace uuid := (p_document->>'workspaceId')::uuid;
  v_previous jsonb;
  v_uploads integer;
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
  if not exists(select 1 from public.folio_storage_allocations where
      id=(p_document->>'id')::uuid and owner_id=v_owner and workspace_id=v_workspace
      and request_key=p_document->>'requestKey' and bytes=(p_document->>'bytes')::bigint
      and content_hash=p_document->>'contentHash' and original_key=p_document->>'originalKey' and state='pending') then
    return jsonb_build_object('status',409,'error','A matching storage reservation is required.');
  end if;
  insert into public.folio_usage(owner_id) values(v_owner) on conflict do nothing;
  select uploads,stored_bytes into v_uploads,v_stored from public.folio_usage where owner_id=v_owner;
  if v_uploads>=3 or v_stored+(p_document->>'bytes')::bigint>30000000 then
    return jsonb_build_object('status',429,'code','FREE_UPLOAD_LIMIT','error','Your free upload or storage allowance is reached. View upgrade options for more capacity. Saved documents remain available.');
  end if;
  insert into public.folio_documents(id,owner_id,workspace_id,request_key,data)
    values((p_document->>'id')::uuid,v_owner,v_workspace,p_document->>'requestKey',p_document);
  update public.folio_usage set uploads=uploads+1,
    processed_pages=processed_pages+jsonb_array_length(p_document->'pages'),
    stored_bytes=stored_bytes+(p_document->>'bytes')::bigint where owner_id=v_owner;
  update public.folio_storage_allocations set state='committed' where id=(p_document->>'id')::uuid;
  return jsonb_build_object('document',p_document);
end $$;

revoke all on function public.folio_storage_snapshot(uuid),public.folio_admit_storage_operation(uuid,text,bigint),public.folio_reserve_upload(jsonb),public.folio_release_upload(uuid,uuid),public.folio_commit_upload(jsonb) from public,anon,authenticated;
grant execute on function public.folio_storage_snapshot(uuid),public.folio_admit_storage_operation(uuid,text,bigint),public.folio_reserve_upload(jsonb),public.folio_release_upload(uuid,uuid),public.folio_commit_upload(jsonb) to service_role;
commit;
