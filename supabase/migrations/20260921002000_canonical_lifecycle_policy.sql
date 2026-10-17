-- Mega-Build 17: canonical contract/readiness/staff/portal lifecycle policy.
-- No new tables are introduced.
create or replace function public.laurem_normalize_role(p_role text)
returns text language sql immutable strict as $$
select case lower(btrim(p_role))
when 'healthcare assistant' then 'Healthcare Assistant'
when 'healthcare worker' then 'Healthcare Assistant'
when 'healthcare assistant - international' then 'Healthcare Assistant'
when 'support worker' then 'Support Worker'
when 'senior support worker' then 'Senior Support Worker'
when 'registered nurse' then 'Registered Nurse'
when 'registered nurse - international recruitment' then 'Registered Nurse'
when 'international registered nurse' then 'Registered Nurse'
when 'physiotherapist' then 'Physiotherapist'
else null end;
$$;

create or replace function public.laurem_evaluate_staff_lifecycle(p_application_id uuid,p_transition text,p_reentry_override boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare app_row public.laurem_recruitment_applications; contract_row public.laurem_recruitment_contracts; staff_row public.laurem_staff_profiles; contract_role text; application_role text; contract_ok boolean:=false; readiness_has_items boolean:=false; readiness_ok boolean:=false; staff_exists boolean:=false; staff_binding_ok boolean:=false; repair_action text:=null;
begin
if p_transition not in ('prepare_onboarding','mark_hired','portal_provision','portal_activate') then raise exception using errcode='P0001',message='INVALID_LIFECYCLE_TRANSITION'; end if;
select * into app_row from public.laurem_recruitment_applications where id=p_application_id for update;
if not found then return jsonb_build_object('ok',false,'code','APPLICATION_NOT_FOUND','reason','Application not found.'); end if;
application_role:=public.laurem_normalize_role(app_row.role_applied);
select * into contract_row from public.laurem_recruitment_contracts where application_id=p_application_id and status='accepted' and accepted_at is not null order by accepted_at desc limit 1 for update;
if found then contract_role:=public.laurem_normalize_role(contract_row.job_title); contract_ok:=contract_role is not null and application_role is not null and contract_role=application_role; end if;
select exists(select 1 from public.laurem_recruitment_onboarding_checklist where application_id=p_application_id and required) into readiness_has_items;
select not exists(select 1 from public.laurem_recruitment_onboarding_checklist where application_id=p_application_id and required and status not in ('completed','waived')) into readiness_ok;
readiness_ok:=readiness_has_items and readiness_ok;
select * into staff_row from public.laurem_staff_profiles where application_id=p_application_id limit 1 for update;
staff_exists:=found;
if staff_exists and contract_row.id is not null then staff_binding_ok:=staff_row.contract_id is null or staff_row.contract_id=contract_row.id; elsif staff_exists then staff_binding_ok:=false; end if;
if not contract_ok then return jsonb_build_object('ok',false,'code','CONTRACT_POLICY_BLOCKED','reason','An accepted employment contract matching the application role is required.','repair_action','Review or replace the contract, then rerun the gated onboarding flow.'); end if;
if not readiness_ok then return jsonb_build_object('ok',false,'code','READINESS_POLICY_BLOCKED','reason','All required onboarding readiness items must be completed or explicitly waived.','repair_action','Complete or appropriately waive the required readiness items, then rerun the gated onboarding flow.'); end if;
case p_transition
when 'prepare_onboarding' then
if app_row.status not in ('Offer','Onboarding','Hired') and not (p_reentry_override and app_row.status in ('Rejected','Withdrawn')) then return jsonb_build_object('ok',false,'code','APPLICATION_STATE_BLOCKED','reason',format('Application status %s cannot enter the onboarding preparation boundary.',app_row.status),'repair_action','Move the application through the canonical recruitment lifecycle or use an explicit terminal-state re-entry override.'); end if;
if staff_exists and not staff_binding_ok then return jsonb_build_object('ok',false,'code','STAFF_CONTRACT_MISMATCH','reason','The existing staff profile is bound to a different employment contract.','repair_action','Review the legacy staff record before attempting re-entry.'); end if;
repair_action:=case when not staff_exists or staff_row.contract_id is null then 'The gated onboarding flow will create or bind the workforce identity.' else null end;
when 'mark_hired' then
if app_row.status not in ('Onboarding','Hired') and not (p_reentry_override and app_row.status in ('Rejected','Withdrawn')) then return jsonb_build_object('ok',false,'code','APPLICATION_STATE_BLOCKED','reason',format('Application status %s cannot enter Hired.',app_row.status),'repair_action','Prepare onboarding before moving the application to Hired.'); end if;
if not staff_exists then return jsonb_build_object('ok',false,'code','STAFF_REQUIRED','reason','A workforce staff profile must exist before the application can be Hired.','repair_action','Re-run the gated admin onboarding flow.'); end if;
if not staff_binding_ok or staff_row.contract_id is null then return jsonb_build_object('ok',false,'code','STAFF_CONTRACT_BINDING_REQUIRED','reason','The workforce staff profile must be bound to the accepted contract before Hired.','repair_action','Re-run the gated admin onboarding flow to repair the contract binding.'); end if;
if staff_row.employment_status not in ('pending','active') then return jsonb_build_object('ok',false,'code','STAFF_STATE_BLOCKED','reason',format('Staff employment status %s cannot support Hired.',staff_row.employment_status),'repair_action','Review the staff employment status before retrying Hired.'); end if;
when 'portal_provision','portal_activate' then
if app_row.status <> 'Hired' then return jsonb_build_object('ok',false,'code','HIRED_REQUIRED','reason','The application must be Hired before the staff portal lifecycle can proceed.','repair_action','Complete the Hired transition first.'); end if;
if not staff_exists then return jsonb_build_object('ok',false,'code','STAFF_REQUIRED','reason','A workforce staff profile must exist before portal lifecycle operations can proceed.','repair_action','Re-run the gated admin onboarding flow.'); end if;
if not staff_binding_ok or staff_row.contract_id is null then return jsonb_build_object('ok',false,'code','STAFF_CONTRACT_BINDING_REQUIRED','reason','The workforce staff profile must be bound to the accepted contract before portal lifecycle operations can proceed.','repair_action','Re-run the gated admin onboarding flow to repair the contract binding.'); end if;
if staff_row.employment_status <> 'pending' then return jsonb_build_object('ok',false,'code','STAFF_PORTAL_STATE_BLOCKED','reason',format('Portal lifecycle requires a pending staff record, not %s.',staff_row.employment_status),'repair_action','Review the existing activation or employment state instead of issuing another activation.'); end if;
if staff_row.activated_at is not null then return jsonb_build_object('ok',false,'code','STAFF_ALREADY_ACTIVATED','reason','The staff portal account has already been activated.','repair_action','Use the existing staff session/login recovery flow.'); end if;
else raise exception using errcode='P0001',message='INVALID_LIFECYCLE_TRANSITION'; end case;
return jsonb_build_object('ok',true,'transition',p_transition,'application_id',p_application_id,'application_status',app_row.status,'contract_id',contract_row.id,'staff_id',case when staff_exists then staff_row.id else null end,'staff_status',case when staff_exists then staff_row.employment_status else null end,'repair_action',repair_action);
end; $$;

revoke all on function public.laurem_normalize_role(text) from public,anon,authenticated;
grant execute on function public.laurem_normalize_role(text) to service_role;
revoke all on function public.laurem_evaluate_staff_lifecycle(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.laurem_evaluate_staff_lifecycle(uuid,text,boolean) to service_role;
create or replace function public.laurem_transition_application_status(p_application_id uuid, p_to_status text, p_actor text, p_note text default null, p_override boolean default false, p_override_reason text default null)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path to public
as $$
declare
  app_row public.laurem_recruitment_applications;
  result_row public.laurem_recruitment_applications;
  allowed boolean := false;
  blocked_reason text := null;
  policy jsonb;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='P0001',message='ADMIN_ACTOR_REQUIRED'; end if;
  select * into app_row from public.laurem_recruitment_applications where id=p_application_id for update;
  if not found then raise exception using errcode='P0001',message='APPLICATION_NOT_FOUND'; end if;
  if p_to_status is null or p_to_status not in('Enquiry','Invited','Application','Screening','Interview','Second Interview','Documents','Sponsorship','Offer','Onboarding','Hired','Rejected','Withdrawn') then raise exception using errcode='P0001',message='INVALID_RECRUITMENT_STATUS'; end if;
  allowed := (app_row.status=p_to_status)
    or (app_row.status='Enquiry' and p_to_status in('Invited','Rejected','Withdrawn'))
    or (app_row.status='Invited' and p_to_status in('Application','Rejected','Withdrawn'))
    or (app_row.status='Application' and p_to_status in('Screening','Rejected','Withdrawn'))
    or (app_row.status='Screening' and p_to_status in('Interview','Documents','Rejected','Withdrawn'))
    or (app_row.status='Interview' and p_to_status in('Second Interview','Documents','Offer','Rejected','Withdrawn'))
    or (app_row.status='Second Interview' and p_to_status in('Documents','Offer','Rejected','Withdrawn'))
    or (app_row.status='Documents' and p_to_status in('Sponsorship','Offer','Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Sponsorship' and p_to_status in('Offer','Rejected','Withdrawn'))
    or (app_row.status='Offer' and p_to_status in('Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Onboarding' and p_to_status in('Hired','Rejected','Withdrawn'));
  if p_to_status='Onboarding' then
    policy := public.laurem_evaluate_staff_lifecycle(p_application_id,'prepare_onboarding',p_override);
    if coalesce((policy->>'ok')::boolean,false)=false then blocked_reason:=coalesce(policy->>'reason','Canonical onboarding lifecycle policy blocked this transition.'); end if;
  elsif p_to_status='Hired' then
    policy := public.laurem_evaluate_staff_lifecycle(p_application_id,'mark_hired',p_override);
    if coalesce((policy->>'ok')::boolean,false)=false then blocked_reason:=coalesce(policy->>'reason','Canonical Hired lifecycle policy blocked this transition.'); end if;
  elsif p_to_status='Second Interview' then
    if not p_override and app_row.status <> 'Interview' then blocked_reason:=format('Transition from %s to Second Interview is not permitted.',app_row.status); end if;
    if not p_override and not exists(select 1 from public.laurem_recruitment_interviews i where i.application_id=app_row.id and i.status='Completed' and i.cancelled_at is null) then blocked_reason:=coalesce(blocked_reason||' ','')||'A completed first interview is required before Second Interview.'; end if;
  end if;
  if blocked_reason is null and not allowed and not p_override then blocked_reason:=format('Transition from %s to %s is not permitted.',app_row.status,p_to_status); end if;
  if blocked_reason is not null then
    insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata) values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked',blocked_reason,jsonb_build_object('override_requested',p_override));
    raise exception using errcode='P0001',message='STATUS_TRANSITION_BLOCKED',detail=blocked_reason;
  end if;
  if p_override and nullif(trim(coalesce(p_override_reason,'')),'') is null then
    insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata) values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked','Override reason is required.',jsonb_build_object('override_requested',true));
    raise exception using errcode='P0001',message='OVERRIDE_REASON_REQUIRED';
  end if;
  update public.laurem_recruitment_applications set status=p_to_status,updated_at=now() where id=p_application_id returning * into result_row;
  insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note) values(p_application_id,app_row.status,p_to_status,p_actor,coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')));
  insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata) values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,case when p_override then 'overridden' else 'allowed' end,coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')),jsonb_build_object('override',p_override,'blocked_reason',blocked_reason));
  return result_row;
end;
$$;

create or replace function public.laurem_create_second_interview_invitation(
  p_application_id uuid,
  p_token_hash text,
  p_sent_by text,
  p_expires_at timestamptz
)
returns table(id uuid, application_id uuid, status text, sent_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.laurem_recruitment_applications;
  v_id uuid;
  v_status text;
  v_sent_at timestamptz;
  v_expires_at timestamptz;
  first_interview_complete boolean := false;
begin
  select * into app_row
    from public.laurem_recruitment_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  if app_row.status <> 'Interview' then
    raise exception 'first_interview_status_required' using errcode = 'P0001';
  end if;

  select exists(
    select 1 from public.laurem_recruitment_interviews i
     where i.application_id = p_application_id
       and i.status = 'Completed'
       and i.cancelled_at is null
  ) into first_interview_complete;

  if not first_interview_complete then
    raise exception 'first_interview_not_completed' using errcode = 'P0001';
  end if;

  select r.id, r.status, r.sent_at, r.expires_at
    into v_id, v_status, v_sent_at, v_expires_at
    from public.laurem_recruitment_second_interviews r
   where r.application_id = p_application_id
     and r.status = 'sent'
     and r.expires_at > now()
   order by r.sent_at desc
   limit 1;

  if v_id is not null then
    raise exception 'active_second_interview_exists' using errcode = 'P0001';
  end if;

  insert into public.laurem_recruitment_second_interviews(application_id, token_hash, status, sent_by, expires_at)
  values (p_application_id, p_token_hash, 'sent', p_sent_by, p_expires_at)
  returning public.laurem_recruitment_second_interviews.id,
            public.laurem_recruitment_second_interviews.application_id,
            public.laurem_recruitment_second_interviews.status,
            public.laurem_recruitment_second_interviews.sent_at,
            public.laurem_recruitment_second_interviews.expires_at
    into v_id, id, application_id, status, sent_at, expires_at;

  perform public.laurem_transition_application_status(
    p_application_id,
    'Second Interview',
    p_sent_by,
    'Second interview invitation created after completed first interview.',
    false,
    null
  );

  id := v_id;
  return next;
end;
$$;

create or replace function public.laurem_prepare_staff_onboarding_atomic(
  p_application_id uuid,
  p_actor text,
  p_audience text,
  p_package_title text,
  p_tasks jsonb,
  p_location text default null,
  p_nmc_number text default null,
  p_dbs_verified boolean default false,
  p_access_token_hash text default null,
  p_access_token_expires_at timestamptz default null
)
returns table(
  staff_id uuid,
  employee_number text,
  laurem_id text,
  contract_id uuid,
  package_id uuid,
  package_status text,
  package_access_token_expires_at timestamptz,
  created_staff boolean,
  created_package boolean,
  access_token_issued boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.laurem_recruitment_applications%rowtype;
  contract_row public.laurem_recruitment_contracts%rowtype;
  staff_row public.laurem_staff_profiles%rowtype;
  package_row public.laurem_staff_onboarding_packages%rowtype;
  now_value timestamptz := clock_timestamp();
  right_to_work_value boolean := false;
  employee_number_value text;
  onboarding_status text;
  created_staff_value boolean := false;
  created_package_value boolean := false;
  access_token_issued_value boolean := false;
  incomplete_required boolean := false;
  has_progress boolean := false;
begin
  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  if p_audience not in ('sponsored_hca', 'international_nurse', 'standard_staff') then
    raise exception using errcode='P0001', message='ONBOARDING_AUDIENCE_INVALID';
  end if;

  if nullif(trim(coalesce(p_package_title, '')), '') is null then
    raise exception using errcode='P0001', message='ONBOARDING_PACKAGE_TITLE_REQUIRED';
  end if;

  select *
    into app_row
    from public.laurem_recruitment_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND';
  end if;

  select *
    into contract_row
    from public.laurem_recruitment_contracts
   where application_id = p_application_id
     and status = 'accepted'
     and accepted_at is not null
   order by accepted_at desc
   limit 1
   for update;

  if not found then
    raise exception using errcode='P0001', message='CONTRACT_REQUIRED';
  end if;

  if public.laurem_normalize_role(contract_row.job_title) is null
     or public.laurem_normalize_role(app_row.role_applied) is null
     or public.laurem_normalize_role(contract_row.job_title) <> public.laurem_normalize_role(app_row.role_applied) then
    raise exception using errcode='P0001', message='CONTRACT_ROLE_MISMATCH';
  end if;

  insert into public.laurem_recruitment_onboarding_checklist(
    application_id, item_key, title, description, required
  )
  values
    (p_application_id, 'identity_verified', 'Identity verified', 'Identity evidence has been reviewed and verified.', true),
    (p_application_id, 'qualification_evidence_verified', 'Qualification evidence verified', 'Required qualification and training evidence has been reviewed for the applied role.', true),
    (p_application_id, 'references_verified', 'References verified', 'Required professional or employment references have been checked and accepted.', true),
    (p_application_id, 'right_to_work_verified', 'Right to work verified', 'The candidate has been cleared to work in the UK under the applicable pathway.', true)
  on conflict (application_id, item_key) do nothing;

  if app_row.living_in_uk = 'No' then
    insert into public.laurem_recruitment_onboarding_checklist(
      application_id, item_key, title, description, required
    )
    values (
      p_application_id,
      'international_work_permission_verified',
      'International work permission verified',
      'Required visa, sponsorship or work-permission evidence has been reviewed and accepted for this overseas candidate.',
      true
    )
    on conflict (application_id, item_key) do nothing;
  end if;

  if lower(trim(coalesce(app_row.role_applied, ''))) in ('registered nurse', 'registered nurses', 'rn') then
    insert into public.laurem_recruitment_onboarding_checklist(
      application_id, item_key, title, description, required
    )
    values (
      p_application_id,
      'professional_registration_verified',
      'Professional registration verified',
      'NMC registration status or the approved registration pathway has been reviewed and recorded for the registered nurse role.',
      true
    )
    on conflict (application_id, item_key) do nothing;
  end if;

  select exists(
    select 1
      from public.laurem_recruitment_onboarding_checklist
     where application_id = p_application_id
       and item_key = 'right_to_work_verified'
       and status = 'completed'
  ) into right_to_work_value;

  select exists(
    select 1
      from public.laurem_recruitment_onboarding_checklist
     where application_id = p_application_id
       and required
       and status not in ('completed', 'waived')
  ) into incomplete_required;

  if incomplete_required then
    raise exception using
      errcode='P0001',
      message='READINESS_INCOMPLETE';
  end if;

  declare
    lifecycle_policy jsonb;
  begin
    lifecycle_policy := public.laurem_evaluate_staff_lifecycle(
      p_application_id,
      'prepare_onboarding',
      false
    );
    if coalesce((lifecycle_policy->>'ok')::boolean, false) = false then
      raise exception using
        errcode='P0001',
        message='LIFECYCLE_POLICY_BLOCKED',
        detail=coalesce(lifecycle_policy->>'reason', 'Canonical lifecycle policy blocked onboarding preparation.');
    end if;
  end;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where application_id = p_application_id
   for update;

  if not found then
    employee_number_value := 'LAU-' || extract(year from current_date)::int || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.laurem_staff_profiles(
      application_id,
      employee_number,
      full_name,
      email,
      phone,
      job_title,
      employment_status,
      start_date,
      location,
      nmc_number,
      right_to_work_verified,
      dbs_verified,
      contract_id
    )
    values (
      p_application_id,
      employee_number_value,
      trim(coalesce(app_row.full_name, '')),
      lower(trim(coalesce(app_row.email, ''))),
      app_row.phone,
      app_row.role_applied,
      'pending',
      coalesce(contract_row.start_date, app_row.start_date),
      nullif(trim(coalesce(p_location, '')), ''),
      nullif(trim(coalesce(p_nmc_number, app_row.nmc_number, app_row.application_data->>'nmc_number')), ''),
      right_to_work_value,
      coalesce(p_dbs_verified, false),
      contract_row.id
    )
    returning * into staff_row;

    created_staff_value := true;
  else
    if staff_row.contract_id is not null and staff_row.contract_id <> contract_row.id then
      raise exception using errcode='P0001', message='STAFF_CONTRACT_MISMATCH';
    end if;

    if staff_row.contract_id is null then
      update public.laurem_staff_profiles
         set contract_id = contract_row.id,
             updated_at = now_value
       where id = staff_row.id
       returning * into staff_row;
    end if;
  end if;

  select *
    into package_row
    from public.laurem_staff_onboarding_packages
   where staff_id = staff_row.id
   for update;

  if not found then
    insert into public.laurem_staff_onboarding_packages(
      staff_id,
      audience,
      title,
      status,
      access_token_hash,
      access_token_expires_at
    )
    values (
      staff_row.id,
      p_audience,
      p_package_title,
      'pending',
      p_access_token_hash,
      p_access_token_expires_at
    )
    returning * into package_row;

    created_package_value := true;
    access_token_issued_value := p_access_token_hash is not null;
  elsif package_row.access_token_hash is null
    and p_access_token_hash is not null then
    update public.laurem_staff_onboarding_packages
       set audience = p_audience,
           title = p_package_title,
           access_token_hash = p_access_token_hash,
           access_token_expires_at = p_access_token_expires_at,
           updated_at = now_value
     where id = package_row.id
     returning * into package_row;

    access_token_issued_value := true;
  end if;

  insert into public.laurem_staff_onboarding_tasks(
    package_id,
    task_key,
    category,
    title,
    description,
    required,
    document_path,
    acknowledgement_required,
    sort_order
  )
  select
    package_row.id,
    t.task_key,
    t.category,
    t.title,
    t.description,
    coalesce(t.required, true),
    t.document_path,
    coalesce(t.acknowledgement_required, true),
    coalesce(t.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) as t(
    task_key text,
    category text,
    title text,
    description text,
    required boolean,
    document_path text,
    acknowledgement_required boolean,
    sort_order integer
  )
  on conflict (package_id, task_key) do nothing;

  select exists(
    select 1
      from public.laurem_staff_onboarding_tasks
     where package_id = package_row.id
       and required
       and not (
         status in ('completed', 'waived')
         and (not acknowledgement_required or acknowledged_at is not null)
       )
  ) into incomplete_required;

  select exists(
    select 1
      from public.laurem_staff_onboarding_tasks
     where package_id = package_row.id
       and required
       and (status in ('completed', 'waived') or acknowledged_at is not null)
  ) into has_progress;

  onboarding_status := case
    when not incomplete_required then 'complete'
    when has_progress then 'in_progress'
    else 'pending'
  end;

  update public.laurem_staff_onboarding_packages
     set status = onboarding_status,
         completed_at = case when onboarding_status = 'complete' then coalesce(completed_at, now_value) else null end,
         updated_at = now_value
   where id = package_row.id
   returning * into package_row;

  if app_row.status not in ('Onboarding', 'Hired') then
    perform public.laurem_transition_application_status(
      p_application_id,
      'Onboarding',
      p_actor,
      format('Staff onboarding package %s prepared atomically', package_row.id),
      false,
      null
    );
  end if;

  staff_id := staff_row.id;
  employee_number := staff_row.employee_number;
  laurem_id := staff_row.laurem_id;
  contract_id := staff_row.contract_id;
  package_id := package_row.id;
  package_status := package_row.status;
  package_access_token_expires_at := package_row.access_token_expires_at;
  created_staff := created_staff_value;
  created_package := created_package_value;
  access_token_issued := access_token_issued_value;

  return next;
end;
$$;

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
  lifecycle_policy jsonb;
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

revoke all on function public.laurem_create_second_interview_invitation(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.laurem_create_second_interview_invitation(uuid,text,text,timestamptz) to service_role;
revoke all on function public.laurem_prepare_staff_onboarding_atomic(uuid,text,text,text,jsonb,text,text,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.laurem_prepare_staff_onboarding_atomic(uuid,text,text,text,jsonb,text,text,boolean,text,timestamptz) to service_role;
revoke all on function public.laurem_activate_staff_account_with_session(text,text,text,text,timestamptz,integer,inet,text) from public,anon,authenticated;
grant execute on function public.laurem_activate_staff_account_with_session(text,text,text,text,timestamptz,integer,inet,text) to service_role;
