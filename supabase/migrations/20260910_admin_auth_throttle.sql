create table if not exists public.laurem_admin_auth_throttle (
  throttle_key text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  first_failed_at timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.laurem_admin_auth_throttle enable row level security;
revoke all on public.laurem_admin_auth_throttle from anon, authenticated;
grant all on public.laurem_admin_auth_throttle to service_role;

create or replace function public.laurem_consume_admin_auth_attempt(
  p_throttle_key text,
  p_success boolean default false
)
returns table(allowed boolean, retry_after_seconds integer, failed_attempts integer)
language plpgsql
as $$
declare
  v_row public.laurem_admin_auth_throttle%rowtype;
  v_now timestamptz := now();
  v_window interval := interval '15 minutes';
  v_limit integer := 10;
  v_retry integer := 0;
begin
  if p_throttle_key is null or length(trim(p_throttle_key)) = 0 then
    raise exception 'Throttle key is required.';
  end if;

  insert into public.laurem_admin_auth_throttle(throttle_key)
  values (p_throttle_key)
  on conflict (throttle_key) do nothing;

  select * into v_row
  from public.laurem_admin_auth_throttle
  where throttle_key = p_throttle_key
  for update;

  if p_success then
    update public.laurem_admin_auth_throttle
    set failed_attempts = 0,
        first_failed_at = null,
        last_failed_at = null,
        updated_at = v_now
    where throttle_key = p_throttle_key;
    return query select true, 0, 0;
    return;
  end if;

  if v_row.last_failed_at is null or v_now - v_row.last_failed_at >= v_window then
    update public.laurem_admin_auth_throttle
    set failed_attempts = 1,
        first_failed_at = v_now,
        last_failed_at = v_now,
        updated_at = v_now
    where throttle_key = p_throttle_key;
    return query select true, 0, 1;
    return;
  end if;

  if v_row.failed_attempts >= v_limit then
    v_retry := greatest(1, ceil(extract(epoch from (v_window - (v_now - v_row.first_failed_at))))::integer);
    return query select false, v_retry, v_row.failed_attempts;
    return;
  end if;

  update public.laurem_admin_auth_throttle
  set failed_attempts = failed_attempts + 1,
      last_failed_at = v_now,
      updated_at = v_now
  where throttle_key = p_throttle_key
  returning failed_attempts into v_row.failed_attempts;

  if v_row.failed_attempts > v_limit then
    v_retry := greatest(1, ceil(extract(epoch from (v_window - (v_now - v_row.first_failed_at))))::integer);
    return query select false, v_retry, v_row.failed_attempts;
  end if;

  return query select true, 0, v_row.failed_attempts;
end;
$$;

revoke all on function public.laurem_consume_admin_auth_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.laurem_consume_admin_auth_attempt(text, boolean) to service_role;
