-- Shared by EVERY live caller using this Google project, including local smoke
-- checks. No account identifiers, prompts, keys or document text are recorded.
-- Starts disabled: verify Free tier and exclusive project usage before enabling.
create table public.folio_ai_policy (
  model text primary key,
  enabled boolean not null default false,
  rpm integer not null,
  tpm integer not null,
  rpd integer not null,
  warn_rpm integer not null,
  warn_tpm integer not null,
  warn_rpd integer not null,
  check (
    (model = 'gemini-3.5-flash-lite' and rpm = 13 and tpm = 225000 and rpd = 450
      and warn_rpm = 12 and warn_tpm = 200000 and warn_rpd = 400) or
    (model = 'gemini-embedding-001' and rpm = 90 and tpm = 27000 and rpd = 900
      and warn_rpm = 80 and warn_tpm = 24000 and warn_rpd = 800)
  )
);
insert into public.folio_ai_policy(model, rpm, tpm, rpd, warn_rpm, warn_tpm, warn_rpd)
values ('gemini-3.5-flash-lite',13,225000,450,12,200000,400),
       ('gemini-embedding-001',90,27000,900,80,24000,800);

create table public.folio_ai_reservations (
  id uuid primary key default gen_random_uuid(),
  model text not null references public.folio_ai_policy(model),
  admitted_at timestamptz not null default clock_timestamp(),
  requests integer not null check (requests > 0),
  tokens integer not null check (tokens > 0)
);
create index folio_ai_reservations_window on public.folio_ai_reservations(model, admitted_at);
alter table public.folio_ai_policy enable row level security;
alter table public.folio_ai_reservations enable row level security;
revoke all on public.folio_ai_policy, public.folio_ai_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.folio_ai_policy, public.folio_ai_reservations to service_role;

-- A conservative 120-second window covers admission-to-provider latency as well
-- as the provider's minute window. Carry the same overlap across Pacific midnight
-- so a request admitted before midnight cannot escape next-day accounting.
create function public.folio_ai_capacity() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day timestamptz;
  v_models jsonb;
begin
  if (select count(*) from public.folio_ai_policy) <> 2 then
    raise exception 'AI policy is incomplete';
  end if;
  v_day := date_trunc('day', v_now at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  select jsonb_agg(jsonb_build_object(
    'model', p.model, 'enabled', p.enabled,
    'rpm', p.rpm, 'tpm', p.tpm, 'rpd', p.rpd,
    'requests', u.requests, 'tokens', u.tokens, 'daily', u.daily,
    'state', case when not p.enabled or u.requests >= p.rpm or u.tokens >= p.tpm or u.daily >= p.rpd then 'paused'
      when u.requests >= p.warn_rpm or u.tokens >= p.warn_tpm or u.daily >= p.warn_rpd then 'warning'
      else 'available' end
  ) order by p.model) into v_models
  from public.folio_ai_policy p
  cross join lateral (
    select coalesce(sum(r.requests) filter (where r.admitted_at >= v_now - interval '120 seconds'),0) as requests,
           coalesce(sum(r.tokens) filter (where r.admitted_at >= v_now - interval '120 seconds'),0) as tokens,
           coalesce(sum(r.requests),0) as daily
    from public.folio_ai_reservations r
    where r.model = p.model and r.admitted_at >= least(v_day - interval '120 seconds', v_now - interval '120 seconds')
  ) u;
  return jsonb_build_object('models', v_models, 'state',
    case when exists (select 1 from jsonb_array_elements(v_models) m where m->>'state' = 'paused') then 'paused'
      when exists (select 1 from jsonb_array_elements(v_models) m where m->>'state' = 'warning') then 'warning'
      else 'available' end);
end;
$$;

create function public.folio_reserve_ai(p_model text, p_requests integer, p_tokens integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_policy public.folio_ai_policy%rowtype;
  v_usage jsonb;
  v_now timestamptz;
  v_day timestamptz;
begin
  if p_requests is null or p_requests < 1 or p_tokens is null or p_tokens < 1 then
    raise exception 'Invalid AI reservation';
  end if;
  -- Row lock serializes concurrent users/Workers; time is read AFTER obtaining it.
  select * into v_policy from public.folio_ai_policy where model = p_model for update;
  if not found then raise exception 'Unknown AI model'; end if;
  v_now := clock_timestamp();
  v_day := date_trunc('day', v_now at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  delete from public.folio_ai_reservations
    where model = p_model and admitted_at < least(v_day - interval '120 seconds', v_now - interval '120 seconds');
  select m into v_usage from jsonb_array_elements(public.folio_ai_capacity()->'models') m where m->>'model' = p_model;
  if not v_policy.enabled
    or (v_usage->>'requests')::bigint + p_requests > v_policy.rpm
    or (v_usage->>'tokens')::bigint + p_tokens > v_policy.tpm
    or (v_usage->>'daily')::bigint + p_requests > v_policy.rpd then
    return jsonb_build_object('allowed', false);
  end if;
  -- Never refund: rejected/failed/ambiguous upstream attempts can consume quota.
  insert into public.folio_ai_reservations(model, admitted_at, requests, tokens)
    values (p_model, clock_timestamp(), p_requests, p_tokens);
  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.folio_ai_capacity() from public, anon, authenticated;
revoke all on function public.folio_reserve_ai(text,integer,integer) from public, anon, authenticated;
grant execute on function public.folio_ai_capacity() to service_role;
grant execute on function public.folio_reserve_ai(text,integer,integer) to service_role;
