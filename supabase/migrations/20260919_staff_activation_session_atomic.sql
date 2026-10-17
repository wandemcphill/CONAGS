create or replace function public.laurem_activate_staff_account_with_session(
  p_email text,
  p_token_hash text,
  p_password_hash text,
  p_session_token_hash text,
  p_session_expires_at timestamptz,
  p_expected_session_version integer,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns public.laurem_staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.laurem_staff_profiles;
  current_session_version integer;
  now_value timestamptz := clock_timestamp();
begin
  if nullif(trim(coalesce(p_session_token_hash, '')), '') is null
     or p_session_expires_at <= now_value then
    raise exception 'STAFF_ACTIVATION_SESSION_INVALID';
  end if;

  select * into staff_row
  from public.laurem_staff_profiles
  where activation_token_hash = p_token_hash
    and lower(email) = lower(trim(p_email))
  for update;

  if not found then
    raise exception 'ACTIVATION_INVALID';
  end if;

  if staff_row.activation_expires_at is null
     or staff_row.activation_expires_at <= now_value then
    raise exception 'ACTIVATION_EXPIRED';
  end if;

  if staff_row.activated_at is not null
     or staff_row.password_hash is not null then
    raise exception 'ACTIVATION_USED';
  end if;

  current_session_version := greatest(coalesce(staff_row.session_version, 1), 1);
  if current_session_version <> greatest(coalesce(p_expected_session_version, 1), 1) then
    raise exception 'ACTIVATION_CHANGED';
  end if;

  update public.laurem_staff_profiles
  set password_hash = p_password_hash,
      activation_token_hash = null,
      activation_expires_at = null,
      activated_at = now_value,
      employment_status = 'active',
      session_version = current_session_version + 1,
      updated_at = now_value
  where id = staff_row.id
  returning * into staff_row;

  insert into public.laurem_staff_portal_sessions(
    staff_id,
    token_hash,
    expires_at,
    ip_address,
    user_agent
  ) values (
    staff_row.id,
    p_session_token_hash,
    p_session_expires_at,
    p_ip_address,
    p_user_agent
  );

  insert into public.laurem_staff_security_events(
    staff_id,
    event_type,
    actor,
    ip_address,
    user_agent,
    details
  ) values (
    staff_row.id,
    'staff.activation.completed',
    staff_row.email,
    p_ip_address,
    p_user_agent,
    jsonb_build_object(
      'session_created', true,
      'session_expires_at', p_session_expires_at,
      'session_version', staff_row.session_version
    )
  );

  return staff_row;
end;
$$;

revoke all on function public.laurem_activate_staff_account_with_session(
  text,text,text,text,timestamptz,integer,inet,text
) from public, anon, authenticated;

grant execute on function public.laurem_activate_staff_account_with_session(
  text,text,text,text,timestamptz,integer,inet,text
) to service_role;
