create extension if not exists pgcrypto;

create table if not exists admin_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  throttle_key text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_auth_attempts_blocked_idx
  on admin_auth_attempts(blocked_until);

alter table admin_auth_attempts enable row level security;
revoke all on admin_auth_attempts from anon, authenticated;

create or replace function laurem_consume_admin_auth_attempt(
  p_throttle_key text,
  p_success boolean default false
)
returns table(allowed boolean, retry_after_seconds integer, failed_attempts integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data admin_auth_attempts;
  now_ts timestamptz := now();
  window_seconds integer := 900;
  max_failures integer := 10;
  block_seconds integer := 900;
  next_failures integer;
  retry_seconds integer := 0;
begin
  if nullif(trim(coalesce(p_throttle_key, '')), '') is null then
    return query select false, block_seconds, max_failures;
    return;
  end if;

  insert into admin_auth_attempts(throttle_key)
  values (p_throttle_key)
  on conflict (throttle_key) do nothing;

  select * into row_data
  from admin_auth_attempts
  where throttle_key = p_throttle_key
  for update;

  if row_data.window_started_at < now_ts - make_interval(secs => window_seconds) then
    row_data.failed_attempts := 0;
    row_data.window_started_at := now_ts;
    row_data.blocked_until := null;
  end if;

  if row_data.blocked_until is not null and row_data.blocked_until > now_ts then
    retry_seconds := greatest(1, ceil(extract(epoch from (row_data.blocked_until - now_ts)))::integer);
    update admin_auth_attempts
    set last_attempt_at = now_ts, updated_at = now_ts
    where id = row_data.id;
    return query select false, retry_seconds, row_data.failed_attempts;
    return;
  end if;

  if p_success then
    update admin_auth_attempts
    set failed_attempts = 0,
        blocked_until = null,
        last_attempt_at = now_ts,
        updated_at = now_ts
    where id = row_data.id;
    return query select true, 0, 0;
    return;
  end if;

  next_failures := row_data.failed_attempts + 1;
  if next_failures >= max_failures then
    update admin_auth_attempts
    set failed_attempts = next_failures,
        blocked_until = now_ts + make_interval(secs => block_seconds),
        last_attempt_at = now_ts,
        updated_at = now_ts
    where id = row_data.id;
    return query select false, block_seconds, next_failures;
    return;
  end if;

  update admin_auth_attempts
  set failed_attempts = next_failures,
      last_attempt_at = now_ts,
      updated_at = now_ts
  where id = row_data.id;

  return query select true, 0, next_failures;
end;
$$;

revoke all on function laurem_consume_admin_auth_attempt(text,boolean) from public, anon, authenticated;
grant execute on function laurem_consume_admin_auth_attempt(text,boolean) to service_role;

comment on table admin_auth_attempts is 'Server-side throttle state for the single configured CONAGS admin credential. Throttle keys are pre-hashed and contain no raw IP or password.';
