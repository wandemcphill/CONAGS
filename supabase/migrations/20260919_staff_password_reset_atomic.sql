create or replace function public.laurem_complete_staff_password_reset(
  p_token_hash text,
  p_password_hash text
)
returns table(
  staff_id uuid,
  laurem_id text,
  employee_number text,
  email text,
  session_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.laurem_staff_password_reset_tokens%rowtype;
  staff_row public.laurem_staff_profiles%rowtype;
  now_value timestamptz := clock_timestamp();
  next_version integer;
begin
  select * into token_row
  from public.laurem_staff_password_reset_tokens
  where token_hash = p_token_hash
  for update;

  if not found or token_row.consumed_at is not null or token_row.expires_at <= now_value then
    raise exception 'STAFF_PASSWORD_RESET_INVALID_OR_EXPIRED';
  end if;

  select * into staff_row
  from public.laurem_staff_profiles
  where id = token_row.staff_id
  for update;

  if not found or staff_row.activated_at is null or staff_row.employment_status not in ('pending','active') then
    raise exception 'STAFF_PASSWORD_RESET_NOT_ELIGIBLE';
  end if;

  next_version := greatest(coalesce(staff_row.session_version, 1), 1) + 1;

  update public.laurem_staff_profiles
  set password_hash = p_password_hash,
      session_version = next_version,
      updated_at = now_value
  where id = staff_row.id
  returning * into staff_row;

  update public.laurem_staff_password_reset_tokens
  set consumed_at = now_value
  where id = token_row.id
    and consumed_at is null;

  if not found then
    raise exception 'STAFF_PASSWORD_RESET_ALREADY_USED';
  end if;

  insert into public.laurem_staff_security_events(
    staff_id,event_type,actor,details
  ) values (
    staff_row.id,'staff.password_reset.completed','staff_password_reset',
    jsonb_build_object('session_version',next_version)
  );

  staff_id := staff_row.id;
  laurem_id := staff_row.laurem_id;
  employee_number := staff_row.employee_number;
  email := staff_row.email;
  session_version := staff_row.session_version;
  return next;
end;
$$;

revoke all on function public.laurem_complete_staff_password_reset(text,text) from public, anon, authenticated;
grant execute on function public.laurem_complete_staff_password_reset(text,text) to service_role;
