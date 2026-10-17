-- CONAGS: accepted contract may provision a pending Staff Portal identity before Hired.
-- Portal access is separate from the later readiness-gated Hired transition.
--
-- The authoritative database definitions are established by this migration and
-- the immediately following lifecycle-gate migration. Keep this file forward-only.

-- CONAGS: an accepted contract is sufficient to create a pending Staff Portal identity.
-- Portal provisioning/access is separate from the later Hired/readiness boundary.
-- DBS/PVG and canonical onboarding-readiness remain nonblocking for this portal step.

create or replace function public.laurem_evaluate_staff_lifecycle(
  p_application_id uuid,
  p_transition text,
  p_reentry_override boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  app_row public.laurem_recruitment_applications;
  contract_row public.laurem_recruitment_contracts;
  staff_row public.laurem_staff_profiles;
  contract_role text;
  application_role text;
  contract_ok boolean := false;
  readiness_has_items boolean := false;
  readiness_ok boolean := false;
  staff_exists boolean := false;
  staff_binding_ok boolean := false;
  repair_action text := null;
begin
  if p_transition not in ('prepare_onboarding','mark_hired','portal_provision','portal_activate') then
    raise exception using errcode='P0001',message='INVALID_LIFECYCLE_TRANSITION';
  end if;

  select * into app_row from public.laurem_recruitment_applications where id=p_application_id for update;
  if not found then
    return jsonb_build_object('ok',false,'code','APPLICATION_NOT_FOUND','reason','Application not found.');
  end if;

  application_role:=public.laurem_normalize_role(app_row.role_applied);

  select * into contract_row
    from public.laurem_recruitment_contracts
   where application_id=p_application_id and status='accepted' and accepted_at is not null
   order by accepted_at desc limit 1 for update;

  if found then
    contract_role:=public.laurem_normalize_role(contract_row.job_title);
    contract_ok:=contract_role is not null and application_role is not null and contract_role=application_role;
  end if;

  if p_transition in ('prepare_onboarding','mark_hired') then
    select exists(
      select 1 from public.laurem_recruitment_onboarding_checklist
      where application_id=p_application_id and required and public.laurem_is_staff_lifecycle_readiness_key(item_key)
    ) into readiness_has_items;
    select not exists(
      select 1 from public.laurem_recruitment_onboarding_checklist
      where application_id=p_application_id and required and public.laurem_is_staff_lifecycle_readiness_key(item_key)
        and status not in ('completed','waived')
    ) into readiness_ok;
    readiness_ok:=readiness_has_items and readiness_ok;
  else
    readiness_has_items:=true;
    readiness_ok:=true;
  end if;

  select * into staff_row from public.laurem_staff_profiles where application_id=p_application_id limit 1 for update;
  staff_exists:=found;

  if staff_exists and contract_row.id is not null then
    staff_binding_ok:=staff_row.contract_id is null or staff_row.contract_id=contract_row.id;
  elsif staff_exists then
    staff_binding_ok:=false;
  end if;

  if not contract_ok then
    return jsonb_build_object('ok',false,'code','CONTRACT_POLICY_BLOCKED','reason','An accepted employment contract matching the application role is required.','repair_action','Review or replace the contract, then rerun the gated lifecycle flow.');
  end if;

  if p_transition in ('prepare_onboarding','mark_hired') and not readiness_ok then
    return jsonb_build_object('ok',false,'code','READINESS_POLICY_BLOCKED','reason','All canonical staff lifecycle readiness items must be completed or explicitly waived.','repair_action','Complete or appropriately waive the canonical readiness items, then rerun the gated onboarding flow.');
  end if;

  case p_transition
    when 'prepare_onboarding' then
      if app_row.status not in ('Offer','Onboarding','Hired') and not (p_reentry_override and app_row.status in ('Rejected','Withdrawn')) then
        return jsonb_build_object('ok',false,'code','APPLICATION_STATE_BLOCKED','reason',format('Application status %s cannot enter the onboarding preparation boundary.',app_row.status),'repair_action','Move the application through the canonical recruitment lifecycle or use an explicit terminal-state re-entry override.');
      end if;
      if staff_exists and not staff_binding_ok then
        return jsonb_build_object('ok',false,'code','STAFF_CONTRACT_MISMATCH','reason','The existing staff profile is bound to a different employment contract.','repair_action','Review the staff record before attempting re-entry.');
      end if;
    when 'mark_hired' then
      if app_row.status not in ('Onboarding','Hired') and not (p_reentry_override and app_row.status in ('Rejected','Withdrawn')) then
        return jsonb_build_object('ok',false,'code','APPLICATION_STATE_BLOCKED','reason',format('Application status %s cannot enter Hired.',app_row.status),'repair_action','Prepare onboarding before moving the application to Hired.');
      end if;
      if not staff_exists then
        return jsonb_build_object('ok',false,'code','STAFF_REQUIRED','reason','A workforce staff profile must exist before the application can be Hired.','repair_action','Re-run the gated admin onboarding flow.');
      end if;
      if not staff_binding_ok or staff_row.contract_id is null then
        return jsonb_build_object('ok',false,'code','STAFF_CONTRACT_BINDING_REQUIRED','reason','The workforce staff profile must be bound to the accepted contract before Hired.','repair_action','Re-run the gated admin onboarding flow to repair the contract binding.');
      end if;
      if staff_row.employment_status not in ('pending','active') then
        return jsonb_build_object('ok',false,'code','STAFF_STATE_BLOCKED','reason',format('Staff employment status %s cannot support Hired.',staff_row.employment_status),'repair_action','Review the staff employment status before retrying Hired.');
      end if;
    when 'portal_provision','portal_activate' then
      if app_row.status not in ('Offer','Onboarding','Hired') then
        return jsonb_build_object('ok',false,'code','APPLICATION_STATE_BLOCKED','reason',format('Application status %s cannot enter the Staff Portal lifecycle.',app_row.status),'repair_action','Accept the employment contract and move the application into onboarding first.');
      end if;
      if staff_exists and not staff_binding_ok then
        return jsonb_build_object('ok',false,'code','STAFF_CONTRACT_BINDING_REQUIRED','reason','The workforce staff profile must be bound to the accepted contract before portal lifecycle operations can proceed.','repair_action','Re-run the contract-bound portal provisioning flow to repair the binding.');
      end if;
      if staff_exists and staff_row.activated_at is not null and staff_row.employment_status in ('pending','active') then
        return jsonb_build_object('ok',true,'transition',p_transition,'application_id',p_application_id,'application_status',app_row.status,'contract_id',contract_row.id,'staff_id',staff_row.id,'staff_status',staff_row.employment_status,'repair_action','Use the existing staff session/login recovery flow.');
      end if;
    else
      raise exception using errcode='P0001',message='INVALID_LIFECYCLE_TRANSITION';
  end case;

  return jsonb_build_object('ok',true,'transition',p_transition,'application_id',p_application_id,'application_status',app_row.status,'contract_id',contract_row.id,'staff_id',case when staff_exists then staff_row.id else null end,'staff_status',case when staff_exists then staff_row.employment_status else null end,'repair_action',repair_action);
end;
$function$;

revoke all on function public.laurem_evaluate_staff_lifecycle(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.laurem_evaluate_staff_lifecycle(uuid,text,boolean) to service_role;

create or replace function public.laurem_prepare_staff_portal_after_contract_atomic(
  p_application_id uuid,
  p_actor text default 'contract_acceptance'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  app_row public.laurem_recruitment_applications%rowtype;
  contract_row public.laurem_recruitment_contracts%rowtype;
  staff_row public.laurem_staff_profiles%rowtype;
  existing boolean := false;
  employee_number_value text;
  transitioned public.laurem_recruitment_applications;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  select * into app_row from public.laurem_recruitment_applications where id=p_application_id for update;
  if not found then raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND'; end if;

  if app_row.status not in ('Offer','Onboarding','Hired') then
    raise exception using errcode='P0001', message='APPLICATION_STATE_BLOCKED', detail=format('Application status %s cannot receive Staff Portal provisioning.',app_row.status);
  end if;

  select * into contract_row
    from public.laurem_recruitment_contracts
   where application_id=p_application_id and status='accepted' and accepted_at is not null
   order by accepted_at desc limit 1 for update;
  if not found then raise exception using errcode='P0001', message='CONTRACT_REQUIRED'; end if;

  if public.laurem_normalize_role(contract_row.job_title) is distinct from public.laurem_normalize_role(app_row.role_applied) then
    raise exception using errcode='P0001', message='CONTRACT_ROLE_MISMATCH';
  end if;

  select * into staff_row
    from public.laurem_staff_profiles
   where application_id=p_application_id
   order by created_at asc limit 1 for update;
  existing:=found;

  if not existing then
    employee_number_value := 'LAU-' || extract(year from current_date)::int || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.laurem_staff_profiles(
      application_id, employee_number, full_name, email, phone, job_title,
      employment_status, start_date, location, nmc_number, right_to_work_verified,
      dbs_verified, contract_id
    ) values (
      p_application_id,
      employee_number_value,
      trim(coalesce(app_row.full_name,'')),
      lower(trim(coalesce(app_row.email,''))),
      app_row.phone,
      app_row.role_applied,
      'pending',
      coalesce(contract_row.start_date, app_row.start_date),
      null,
      nullif(trim(coalesce(app_row.application_data->>'nmc_number','')), ''),
      false,
      false,
      contract_row.id
    ) returning * into staff_row;
  else
    if staff_row.contract_id is not null and staff_row.contract_id <> contract_row.id then
      raise exception using errcode='P0001', message='STAFF_CONTRACT_MISMATCH';
    end if;
    if staff_row.contract_id is null then
      update public.laurem_staff_profiles
         set contract_id=contract_row.id, updated_at=clock_timestamp()
       where id=staff_row.id
       returning * into staff_row;
    end if;
    if staff_row.employment_status not in ('pending','active') then
      raise exception using errcode='P0001', message='STAFF_PORTAL_STATE_BLOCKED';
    end if;
  end if;

  if app_row.status='Offer' then
    select public.laurem_transition_application_status(
      p_application_id,'Onboarding',p_actor,
      'Employment contract accepted. Pending Staff Portal identity provisioned; hiring remains a separate lifecycle step.',
      false,null
    ) into transitioned;
  else
    transitioned:=app_row;
  end if;

  return jsonb_build_object(
    'ok',true,
    'created_staff',not existing,
    'staff_id',staff_row.id,
    'employee_number',staff_row.employee_number,
    'laurem_id',coalesce(staff_row.laurem_id,staff_row.employee_number),
    'contract_id',contract_row.id,
    'application_status',transitioned.status,
    'employment_status',staff_row.employment_status
  );
end;
$function$;

revoke all on function public.laurem_prepare_staff_portal_after_contract_atomic(uuid,text) from public, anon, authenticated;
grant execute on function public.laurem_prepare_staff_portal_after_contract_atomic(uuid,text) to service_role;

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
  target_employment_status text;
  now_value timestamptz:=clock_timestamp();
begin
  if nullif(trim(coalesce(p_session_token_hash,'')),'') is null or p_session_expires_at <= now_value then raise exception 'STAFF_ACTIVATION_SESSION_INVALID'; end if;
  if nullif(trim(coalesce(p_password_hash,'')),'') is null then raise exception 'STAFF_ACTIVATION_PASSWORD_REQUIRED'; end if;
  select * into staff_row from public.laurem_staff_profiles where activation_token_hash=p_token_hash and lower(email)=lower(trim(p_email));
  if not found then raise exception 'ACTIVATION_INVALID'; end if;
  if staff_row.activation_used_at is not null or staff_row.activated_at is not null or staff_row.password_hash is not null then raise exception 'ACTIVATION_USED'; end if;
  if staff_row.activation_expires_at is null or staff_row.activation_expires_at <= now_value then raise exception 'ACTIVATION_EXPIRED'; end if;

  lifecycle_policy := public.laurem_evaluate_staff_lifecycle(staff_row.application_id,'portal_activate',false);
  if coalesce((lifecycle_policy->>'ok')::boolean,false)=false then
    raise exception using errcode='P0001',message='LIFECYCLE_POLICY_BLOCKED',detail=coalesce(lifecycle_policy->>'reason','Canonical portal activation policy blocked activation.');
  end if;

  target_employment_status := case when lifecycle_policy->>'application_status'='Hired' then 'active' else 'pending' end;

  select * into staff_row from public.laurem_staff_profiles
   where id=(lifecycle_policy->>'staff_id')::uuid and activation_token_hash=p_token_hash and lower(email)=lower(trim(p_email)) for update;
  if not found then raise exception 'ACTIVATION_CHANGED'; end if;
  if staff_row.activation_used_at is not null or staff_row.activated_at is not null or staff_row.password_hash is not null then raise exception 'ACTIVATION_USED'; end if;
  if staff_row.activation_expires_at is null or staff_row.activation_expires_at <= now_value then raise exception 'ACTIVATION_EXPIRED'; end if;

  current_session_version:=greatest(coalesce(staff_row.session_version,1),1);
  if current_session_version <> greatest(coalesce(p_expected_session_version,1),1) then raise exception 'ACTIVATION_CHANGED'; end if;

  update public.laurem_staff_profiles
    set password_hash=p_password_hash, activation_used_at=now_value,
        activation_expires_at=null, activated_at=now_value,
        employment_status=target_employment_status,
        session_version=current_session_version+1, updated_at=now_value
    where id=staff_row.id returning * into staff_row;

  update public.laurem_staff_portal_sessions set revoked_at=now_value where staff_id=staff_row.id and revoked_at is null;
  update public.laurem_staff_password_reset_tokens set consumed_at=now_value where staff_id=staff_row.id and consumed_at is null;
  insert into public.laurem_staff_portal_sessions(staff_id,token_hash,expires_at,ip_address,user_agent)
  values(staff_row.id,p_session_token_hash,p_session_expires_at,p_ip_address,p_user_agent);
  insert into public.laurem_staff_security_events(staff_id,event_type,actor,ip_address,user_agent,details)
  values(staff_row.id,'staff.activation.completed',staff_row.email,p_ip_address,p_user_agent,
    jsonb_build_object('session_created',true,'session_expires_at',p_session_expires_at,'session_version',staff_row.session_version,'employment_status',staff_row.employment_status));
  return staff_row;
end;
$function$;

revoke all on function public.laurem_activate_staff_account_with_session(text,text,text,text,timestamptz,integer,inet,text) from public, anon, authenticated;
grant execute on function public.laurem_activate_staff_account_with_session(text,text,text,text,timestamptz,integer,inet,text) to service_role;

-- Regression assertions are represented by the function definitions above:
-- accepted contract -> Onboarding + pending staff portal provisioning;
-- portal activation does not require readiness unless the application is Hired.
