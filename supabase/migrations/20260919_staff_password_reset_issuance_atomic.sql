create or replace function public.laurem_issue_staff_password_reset(
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(
  staff_id uuid,
  laurem_id text,
  employee_number text,
  full_name text,
  preferred_name text,
  email text,
  employment_status text,
  activated_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.laurem_staff_profiles%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  select *
    into staff_row
    from public.laurem_staff_profiles
   where lower(email) = lower(trim(p_email))
   for update;

  if not found
     or staff_row.activated_at is null
     or staff_row.employment_status not in ('pending', 'active') then
    return;
  end if;

  update public.laurem_staff_password_reset_tokens
     set consumed_at = now_value
   where staff_id = staff_row.id
     and consumed_at is null;

  insert into public.laurem_staff_password_reset_tokens(
    staff_id,
    token_hash,
    expires_at,
    requested_at,
    consumed_at
  )
  values (
    staff_row.id,
    p_token_hash,
    p_expires_at,
    now_value,
    null
  );

  staff_id := staff_row.id;
  laurem_id := staff_row.laurem_id;
  employee_number := staff_row.employee_number;
  full_name := staff_row.full_name;
  preferred_name := staff_row.preferred_name;
  email := staff_row.email;
  employment_status := staff_row.employment_status;
  activated_at := staff_row.activated_at;
  expires_at := p_expires_at;

  return next;
end;
$$;

revoke all on function public.laurem_issue_staff_password_reset(text,text,timestamptz)
  from public, anon, authenticated;

grant execute on function public.laurem_issue_staff_password_reset(text,text,timestamptz)
  to service_role;