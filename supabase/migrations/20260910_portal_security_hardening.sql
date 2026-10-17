create extension if not exists pgcrypto;

create table if not exists staff_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,
  last_seen_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists staff_portal_sessions_staff_idx on staff_portal_sessions(staff_id, created_at desc);
create index if not exists staff_portal_sessions_expiry_idx on staff_portal_sessions(expires_at) where revoked_at is null;

create table if not exists staff_security_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_profiles(id) on delete set null,
  event_type text not null,
  actor text not null,
  ip_address text,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists staff_security_events_staff_idx on staff_security_events(staff_id, created_at desc);
create index if not exists staff_security_events_type_idx on staff_security_events(event_type, created_at desc);

create table if not exists staff_auth_rate_limits (
  bucket_key text primary key,
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table staff_portal_sessions enable row level security;
alter table staff_security_events enable row level security;
alter table staff_auth_rate_limits enable row level security;
revoke all on staff_portal_sessions, staff_security_events, staff_auth_rate_limits from anon, authenticated;

create or replace function laurem_consume_staff_auth_attempt(
  p_bucket_key text,
  p_max_attempts integer default 10,
  p_window_seconds integer default 900,
  p_lock_seconds integer default 900
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare r staff_auth_rate_limits; now_at timestamptz := now();
begin
  select * into r from staff_auth_rate_limits where bucket_key = p_bucket_key for update;
  if r.bucket_key is null then
    insert into staff_auth_rate_limits(bucket_key, attempts, first_attempt_at, updated_at)
      values (p_bucket_key, 1, now_at, now_at);
    return query select true, 0;
  end if;
  if r.blocked_until is not null and r.blocked_until > now_at then
    return query select false, greatest(1, ceil(extract(epoch from (r.blocked_until-now_at)))::integer);
  end if;
  if r.first_attempt_at is null or r.first_attempt_at + make_interval(secs => p_window_seconds) <= now_at then
    update staff_auth_rate_limits set attempts=1, first_attempt_at=now_at, blocked_until=null, updated_at=now_at where bucket_key=p_bucket_key;
    return query select true, 0;
  end if;
  if r.attempts >= p_max_attempts then
    update staff_auth_rate_limits set blocked_until=now_at + make_interval(secs => p_lock_seconds), updated_at=now_at where bucket_key=p_bucket_key;
    return query select false, p_lock_seconds;
  end if;
  update staff_auth_rate_limits set attempts=attempts+1, updated_at=now_at where bucket_key=p_bucket_key;
  return query select true, 0;
end;
$$;
revoke all on function laurem_consume_staff_auth_attempt(text,integer,integer,integer) from public, anon, authenticated;
grant execute on function laurem_consume_staff_auth_attempt(text,integer,integer,integer) to service_role;

create or replace function laurem_activate_staff_account(
  p_email text,
  p_token_hash text,
  p_password_hash text,
  p_ip_address text,
  p_user_agent text
)
returns staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare s staff_profiles;
begin
  select * into s
  from staff_profiles
  where lower(email)=lower(p_email)
    and activation_token_hash=p_token_hash
    and activation_expires_at > now()
    and password_hash is null
  for update;
  if not found then raise exception using errcode='P0001', message='ACTIVATION_INVALID'; end if;
  update staff_profiles set
    password_hash=p_password_hash,
    activation_token_hash=null,
    activation_expires_at=null,
    activated_at=now(),
    employment_status='active',
    session_version=session_version+1,
    updated_at=now()
  where id=s.id
  returning * into s;
  insert into staff_security_events(staff_id,event_type,actor,ip_address,user_agent)
    values(s.id,'staff.activation.succeeded',s.email,p_ip_address,p_user_agent);
  return s;
end;
$$;
revoke all on function laurem_activate_staff_account(text,text,text,text,text) from public, anon, authenticated;
grant execute on function laurem_activate_staff_account(text,text,text,text,text) to service_role;

create or replace function laurem_revoke_staff_session(p_staff_id uuid, p_token_hash text, p_actor text)
returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  update staff_portal_sessions set revoked_at=now(), revoked_by=p_actor
    where staff_id=p_staff_id and token_hash=p_token_hash and revoked_at is null;
  return found;
end;
$$;
revoke all on function laurem_revoke_staff_session(uuid,text,text) from public, anon, authenticated;
grant execute on function laurem_revoke_staff_session(uuid,text,text) to service_role;

create or replace function laurem_enforce_staff_session(p_staff_id uuid, p_token_hash text)
returns staff_portal_sessions
language plpgsql security definer set search_path=public
as $$
declare s staff_portal_sessions;
begin
  select * into s from staff_portal_sessions
    where staff_id=p_staff_id and token_hash=p_token_hash and revoked_at is null and expires_at > now();
  if not found then raise exception using errcode='P0001', message='SESSION_INVALID'; end if;
  update staff_portal_sessions set last_seen_at=now() where id=s.id returning * into s;
  return s;
end;
$$;
revoke all on function laurem_enforce_staff_session(uuid,text) from public, anon, authenticated;
grant execute on function laurem_enforce_staff_session(uuid,text) to service_role;
