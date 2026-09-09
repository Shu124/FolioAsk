-- Run once in your Supabase project's SQL editor. Browser access is denied;
-- the API uses a server-only service role and enforces ownership on every route.
create table public.folio_sessions (
  hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null
);
create table public.folio_workspaces (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at bigint not null,
  data jsonb not null
);
create index folio_workspaces_owner on public.folio_workspaces(owner_id);
alter table public.folio_sessions enable row level security;
alter table public.folio_workspaces enable row level security;
revoke all on public.folio_sessions, public.folio_workspaces from anon, authenticated;
grant all on public.folio_sessions, public.folio_workspaces to service_role;
