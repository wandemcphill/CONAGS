-- Mega-Build 21: harden the staff portal account lifecycle.
-- Forward-only changes. Existing migrations are intentionally untouched.

alter table public.laurem_staff_profiles
  add column if not exists activation_used_at timestamptz;

create index if not exists laurem_staff_profiles_activation_used_idx
  on public.laurem_staff_profiles(activation_used_at desc)
  where activation_used_at is not null;

create or replace function public.laurem_issue_staff_activation_token(
  p_staff_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor text default 'staff_portal_provisioning'
)
returns public.laurem_staff_profiles
language plpgsql
security definer
set search_path = public
as $function$
declare
  staff_row public.laurem_staff_profiles;
  lifecycle_policy jsonb;
  was_previous_activation_used boolean := false;
  now_value timestamptz := clock_timestamp();
begin
  if nullif(trim(coalesce(p_token_hash,'')),'') is null then
    raise exception 'STAFF_ACTIVATION_TOKEN_REQUIRED';
  end if;

  if p_expires_at is null or p_expires_at <= now_value then
    raise exception 'STAFF_ACTIVATION_EXPIRY_INVALID';
  end if;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where id = p_staff_id;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  lifecycle_policy := public.laurem_evaluate_staff_lifecycle(
    staff_row.application_id,
    'portal_provision',
    false
  );

  if coalesce((lifecycle_policy->>'ok')::boolean, false) = false then
    raise exception using
      errcode = 'P0001',
      message = 'LIFECYCLE_POLICY_BLOCKED',
      detail = coalesce(lifecycle_policy->>'reason', 'Canonical portal provisioning policy blocked activation issuance.');
  end if;

  select activation_used_at is not null
    into was_previous_activation_used
    from public.laurem_staff_profiles
   where id = p_staff_id
   for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  if staff_row.employment_status <> 'pending'
     or staff_row.activated_at is not null then
    raise exception 'STAFF_ACTIVATION_REISSUE_NOT_ELIGIBLE';
  end if;

  update public.laurem_staff_profiles
     set activation_token_hash = p_token_hash,
         activation_expires_at = p_expires_at,
         activation_used_at = null,
         updated_at = now_value
   where id = staff_row.id
   returning * into staff_row;

  insert into public.laurem_staff_security_events(
    staff_id,
    event_type,
    actor,
    details
  ) values (
    staff_row.id,
    'staff.activation.issued',
    coalesce(nullif(trim(p_actor),''),'staff_portal_provisioning'),
    jsonb_build_object(
      'expires_at', p_expires_at,
      'reissued', was_previous_activation_used
    )
  );

  return staff_row;
end;
$function$;

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
as $function$
declare
  staff_row public.laurem_staff_profiles;
  current_session_version integer;
  lifecycle_policy jsonb;
  now_value timestamptz := clock_timestamp();
begin
  if nullif(trim(coalesce(p_session_token_hash, '')), '') is null
     or p_session_expires_at <= now_value then
    raise exception 'STAFF_ACTIVATION_SESSION_INVALID';
  end if;

  if nullif(trim(coalesce(p_password_hash, '')), '') is null then
    raise exception 'STAFF_ACTIVATION_PASSWORD_REQUIRED';
  end if;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where activation_token_hash = p_token_hash
     and lower(email) = lower(trim(p_email));

  if not found then
    raise exception 'ACTIVATION_INVALID';
  end if;

  if staff_row.activation_used_at is not null
     or staff_row.activated_at is not null
     or staff_row.password_hash is not null then
    raise exception 'ACTIVATION_USED';
  end if;

  if staff_row.activation_expires_at is null
     or staff_row.activation_expires_at <= now_value then
    raise exception 'ACTIVATION_EXPIRED';
  end if;

  lifecycle_policy := public.laurem_evaluate_staff_lifecycle(
    staff_row.application_id,
    'portal_activate',
    false
  );

  if coalesce((lifecycle_policy->>'ok')::boolean, false) = false then
    raise exception using
      errcode='P0001',
      message='LIFECYCLE_POLICY_BLOCKED',
      detail=coalesce(lifecycle_policy->>'reason', 'Canonical portal activation policy blocked activation.');
  end if;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where id = (lifecycle_policy->>'staff_id')::uuid
     and activation_token_hash = p_token_hash
     and lower(email) = lower(trim(p_email))
   for update;

  if not found then
    raise exception 'ACTIVATION_CHANGED';
  end if;

  if staff_row.activation_used_at is not null
     or staff_row.activated_at is not null
     or staff_row.password_hash is not null then
    raise exception 'ACTIVATION_USED';
  end if;

  if staff_row.activation_expires_at is null
     or staff_row.activation_expires_at <= now_value then
    raise exception 'ACTIVATION_EXPIRED';
  end if;

  current_session_version := greatest(coalesce(staff_row.session_version, 1), 1);
  if current_session_version <> greatest(coalesce(p_expected_session_version, 1), 1) then
    raise exception 'ACTIVATION_CHANGED';
  end if;

  update public.laurem_staff_profiles
     set password_hash = p_password_hash,
         activation_used_at = now_value,
         activation_expires_at = null,
         activated_at = now_value,
         employment_status = 'active',
         session_version = current_session_version + 1,
         updated_at = now_value
   where id = staff_row.id
   returning * into staff_row;

  update public.laurem_staff_portal_sessions
     set revoked_at = now_value
   where staff_id = staff_row.id
     and revoked_at is null;

  update public.laurem_staff_password_reset_tokens
     set consumed_at = now_value
   where staff_id = staff_row.id
     and consumed_at is null;

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
$function$;

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
as $function$
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
     or staff_row.employment_status <> 'active' then
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
$function$;

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
as $function$
declare
  token_row public.laurem_staff_password_reset_tokens%rowtype;
  staff_row public.laurem_staff_profiles%rowtype;
  now_value timestamptz := clock_timestamp();
  next_version integer;
begin
  select *
    into token_row
    from public.laurem_staff_password_reset_tokens
   where token_hash = p_token_hash
   for update;

  if not found
     or token_row.consumed_at is not null
     or token_row.expires_at <= now_value then
    raise exception 'STAFF_PASSWORD_RESET_INVALID_OR_EXPIRED';
  end if;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where id = token_row.staff_id
   for update;

  if not found
     or staff_row.activated_at is null
     or staff_row.employment_status <> 'active' then
    raise exception 'STAFF_PASSWORD_RESET_NOT_ELIGIBLE';
  end if;

  if nullif(trim(coalesce(p_password_hash,'')),'') is null then
    raise exception 'STAFF_PASSWORD_REQUIRED';
  end if;

  next_version := greatest(coalesce(staff_row.session_version, 1), 1) + 1;

  update public.laurem_staff_profiles
     set password_hash = p_password_hash,
         session_version = next_version,
         updated_at = now_value
   where id = staff_row.id
   returning * into staff_row;

  update public.laurem_staff_portal_sessions
     set revoked_at = now_value
   where staff_id = staff_row.id
     and revoked_at is null;

  update public.laurem_staff_password_reset_tokens
     set consumed_at = now_value
   where staff_id = staff_row.id
     and consumed_at is null;

  insert into public.laurem_staff_security_events(
    staff_id,
    event_type,
    actor,
    details
  ) values (
    staff_row.id,
    'staff.password_reset.completed',
    'staff_password_reset',
    jsonb_build_object('session_version', next_version)
  );

  staff_id := staff_row.id;
  laurem_id := staff_row.laurem_id;
  employee_number := staff_row.employee_number;
  email := staff_row.email;
  session_version := staff_row.session_version;
  return next;
end;
$function$;

create or replace function public.laurem_change_staff_password(
  p_staff_id uuid,
  p_password_hash text,
  p_expected_session_version integer
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
as $function$
declare
  staff_row public.laurem_staff_profiles%rowtype;
  now_value timestamptz := clock_timestamp();
  next_version integer;
begin
  if nullif(trim(coalesce(p_password_hash,'')),'') is null then
    raise exception 'STAFF_PASSWORD_REQUIRED';
  end if;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where id = p_staff_id
   for update;

  if not found
     or staff_row.activated_at is null
     or staff_row.password_hash is null
     or staff_row.employment_status <> 'active' then
    raise exception 'STAFF_PASSWORD_CHANGE_NOT_ELIGIBLE';
  end if;

  if greatest(coalesce(staff_row.session_version,1),1) <> greatest(coalesce(p_expected_session_version,1),1) then
    raise exception 'STAFF_PASSWORD_CHANGE_SESSION_CHANGED';
  end if;

  next_version := greatest(coalesce(staff_row.session_version,1),1) + 1;

  update public.laurem_staff_profiles
     set password_hash = p_password_hash,
         session_version = next_version,
         updated_at = now_value
   where id = staff_row.id
   returning * into staff_row;

  update public.laurem_staff_portal_sessions
     set revoked_at = now_value
   where staff_id = staff_row.id
     and revoked_at is null;

  update public.laurem_staff_password_reset_tokens
     set consumed_at = now_value
   where staff_id = staff_row.id
     and consumed_at is null;

  insert into public.laurem_staff_security_events(
    staff_id,
    event_type,
    actor,
    details
  ) values (
    staff_row.id,
    'staff.password.changed',
    staff_row.email,
    jsonb_build_object('session_version', next_version)
  );

  staff_id := staff_row.id;
  laurem_id := staff_row.laurem_id;
  employee_number := staff_row.employee_number;
  email := staff_row.email;
  session_version := staff_row.session_version;
  return next;
end;
$function$;

revoke all on function public.laurem_issue_staff_activation_token(uuid,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.laurem_issue_staff_activation_token(uuid,text,timestamptz,text) to service_role;

revoke all on function public.laurem_activate_staff_account_with_session(text,text,text,text,timestamptz,integer,inet,text) from public, anon, authenticated;
grant execute on function public.laurem_activate_staff_account_with_session(text,text,text,text,timestamptz,integer,inet,text) to service_role;

revoke all on function public.laurem_issue_staff_password_reset(text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.laurem_issue_staff_password_reset(text,text,timestamptz) to service_role;

revoke all on function public.laurem_complete_staff_password_reset(text,text) from public, anon, authenticated;
grant execute on function public.laurem_complete_staff_password_reset(text,text) to service_role;

revoke all on function public.laurem_change_staff_password(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.laurem_change_staff_password(uuid,text,integer) to service_role;
