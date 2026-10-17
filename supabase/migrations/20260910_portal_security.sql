create extension if not exists pgcrypto;

create table if not exists staff_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists staff_portal_sessions_staff_idx on staff_portal_sessions(staff_id, created_at desc);
create index if not exists staff_portal_sessions_active_idx on staff_portal_sessions(staff_id, expires_at) where revoked_at is null;
alter table staff_portal_sessions enable row level security;
revoke all on staff_portal_sessions from anon, authenticated;

create table if not exists staff_portal_auth_limits (
  bucket_key text primary key,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table staff_portal_auth_limits enable row level security;
revoke all on staff_portal_auth_limits from anon, authenticated;

create table if not exists staff_security_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_profiles(id) on delete set null,
  event_type text not null,
  actor text,
  ip_address inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists staff_security_events_staff_idx on staff_security_events(staff_id, created_at desc);
create index if not exists staff_security_events_type_idx on staff_security_events(event_type, created_at desc);
alter table staff_security_events enable row level security;
revoke all on staff_security_events from anon, authenticated;

create or replace function laurem_consume_staff_auth_attempt(p_bucket_key text, p_max_attempts integer default 10, p_window_seconds integer default 900, p_lock_seconds integer default 900)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row staff_portal_auth_limits;
  now_value timestamptz := now();
  allowed boolean := true;
  retry_after integer := 0;
begin
  if nullif(trim(coalesce(p_bucket_key,'')), '') is null then
    raise exception using message = 'AUTH_BUCKET_REQUIRED';
  end if;
  select * into current_row from staff_portal_auth_limits where bucket_key = p_bucket_key for update;
  if not found then
    insert into staff_portal_auth_limits(bucket_key) values (p_bucket_key) returning * into current_row;
  end if;
  if current_row.locked_until is not null and current_row.locked_until > now_value then
    allowed := false;
    retry_after := greatest(1, ceil(extract(epoch from current_row.locked_until - now_value))::integer);
  elsif current_row.window_started_at + make_interval(secs => p_window_seconds) <= now_value then
    update staff_portal_auth_limits set attempt_count = 1, window_started_at = now_value, locked_until = null, updated_at = now_value where bucket_key = p_bucket_key;
  else
    update staff_portal_auth_limits set attempt_count = attempt_count + 1, updated_at = now_value,
      locked_until = case when attempt_count + 1 >= p_max_attempts then now_value + make_interval(secs => p_lock_seconds) else locked_until end
      where bucket_key = p_bucket_key returning * into current_row;
    if current_row.locked_until is not null and current_row.locked_until > now_value then
      allowed := false;
      retry_after := greatest(1, ceil(extract(epoch from current_row.locked_until - now_value))::integer);
    end if;
  end if;
  return jsonb_build_object('allowed', allowed, 'retry_after', retry_after);
end;
$$;

create or replace function laurem_activate_staff_account(p_token_hash text, p_email text, p_password_hash text, p_ip inet default null, p_user_agent text default null)
returns staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row staff_profiles;
  now_value timestamptz := now();
begin
  select * into staff_row from staff_profiles where activation_token_hash = p_token_hash and lower(email) = lower(trim(p_email)) for update;
  if not found then raise exception using message = 'STAFF_ACTIVATION_INVALID'; end if;
  if staff_row.activation_expires_at is null or staff_row.activation_expires_at <= now_value then raise exception using message = 'STAFF_ACTIVATION_EXPIRED'; end if;
  if staff_row.activated_at is not null or staff_row.password_hash is not null then raise exception using message = 'STAFF_ACTIVATION_USED'; end if;
  update staff_profiles set password_hash = p_password_hash, activation_token_hash = null, activation_expires_at = null, activated_at = now_value, employment_status = 'active', session_version = coalesce(session_version,1) + 1, updated_at = now_value where id = staff_row.id returning * into staff_row;
  insert into staff_security_events(staff_id,event_type,actor,ip_address,user_agent,details) values(staff_row.id,'staff.activation.completed',staff_row.email,p_ip,p_user_agent,'{}'::jsonb);
  return staff_row;
end;
$$;

revoke all on function laurem_consume_staff_auth_attempt(text,integer,integer,integer) from public, anon, authenticated;
revoke all on function laurem_activate_staff_account(text,text,text,inet,text) from public, anon, authenticated;
grant execute on function laurem_consume_staff_auth_attempt(text,integer,integer,integer) to service_role;
grant execute on function laurem_activate_staff_account(text,text,text,inet,text) to service_role;
