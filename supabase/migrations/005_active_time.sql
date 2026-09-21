-- Apply after 004. Time starts at rollout; no historical time is inferred.
create table public.folio_active_intervals (
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.folio_workspaces(id),
  bucket bigint not null check (bucket % 15000 = 0),
  milliseconds integer not null check (milliseconds > 0 and milliseconds <= 15000),
  primary key(owner_id,bucket)
);
alter table public.folio_active_intervals enable row level security;
revoke all on public.folio_active_intervals from anon,authenticated;
grant all on public.folio_active_intervals to service_role;
create function public.folio_record_active_time(p_owner uuid,p_workspace uuid,p_bucket bigint,p_milliseconds integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.folio_workspaces where id=p_workspace and owner_id=p_owner) then return jsonb_build_object('status',404,'error','Workspace not found.');end if;
  insert into public.folio_active_intervals values(p_owner,p_workspace,p_bucket,p_milliseconds)
  on conflict(owner_id,bucket) do update set milliseconds=greatest(folio_active_intervals.milliseconds,excluded.milliseconds)
  where folio_active_intervals.workspace_id=excluded.workspace_id;
  return jsonb_build_object('saved',true);
end $$;
create function public.folio_active_time(p_owner uuid,p_workspace uuid) returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('milliseconds',coalesce(sum(milliseconds),0),'startedAt',min(bucket)))
  from public.folio_active_intervals where owner_id=p_owner and workspace_id=p_workspace;
$$;
revoke all on function public.folio_record_active_time(uuid,uuid,bigint,integer),public.folio_active_time(uuid,uuid) from public,anon,authenticated;
grant execute on function public.folio_record_active_time(uuid,uuid,bigint,integer),public.folio_active_time(uuid,uuid) to service_role;
