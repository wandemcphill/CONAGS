-- CONAGS: isolate staff lifecycle gates from arbitrary candidate/compliance documents.
-- Only canonical readiness keys may block staff conversion or portal provisioning.
-- DBS/PVG, ancillary uploads, SVGs, or future document types remain reviewable records
-- but cannot become lifecycle gates by accident.

create or replace function public.laurem_is_staff_lifecycle_readiness_key(p_item_key text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(btrim(coalesce(p_item_key, ''))) = any (array[
    'identity_verified',
    'qualification_evidence_verified',
    'references_verified',
    'right_to_work_verified',
    'international_work_permission_verified',
    'professional_registration_verified'
  ]);
$$;

create or replace function public.laurem_staff_readiness_key_for_evidence_type(p_evidence_type text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case lower(regexp_replace(btrim(coalesce(p_evidence_type, '')), '[^a-z0-9]+', '_', 'g'))
    when 'identity' then 'identity_verified'
    when 'identity_document' then 'identity_verified'
    when 'passport' then 'identity_verified'
    when 'proof_of_identity' then 'identity_verified'
    when 'qualification' then 'qualification_evidence_verified'
    when 'qualification_evidence' then 'qualification_evidence_verified'
    when 'training' then 'qualification_evidence_verified'
    when 'certificate' then 'qualification_evidence_verified'
    when 'reference' then 'references_verified'
    when 'references' then 'references_verified'
    when 'reference_letter' then 'references_verified'
    when 'right_to_work' then 'right_to_work_verified'
    when 'right_to_work_document' then 'right_to_work_verified'
    when 'work_permission' then 'international_work_permission_verified'
    when 'international_work_permission' then 'international_work_permission_verified'
    when 'visa' then 'international_work_permission_verified'
    when 'nmc_registration' then 'professional_registration_verified'
    when 'professional_registration' then 'professional_registration_verified'
    when 'nmc' then 'professional_registration_verified'
    else null
  end;
$$;

-- Any legacy/custom checklist rows that were accidentally marked required are
-- informational only unless they use a canonical lifecycle key.
update public.laurem_recruitment_onboarding_checklist
set required = false,
    updated_at = clock_timestamp()
where required
  and not public.laurem_is_staff_lifecycle_readiness_key(item_key);

alter table public.laurem_recruitment_onboarding_checklist
  drop constraint if exists laurem_recruitment_onboarding_checklist_required_key_check;

alter table public.laurem_recruitment_onboarding_checklist
  add constraint laurem_recruitment_onboarding_checklist_required_key_check
  check (
    not required
    or public.laurem_is_staff_lifecycle_readiness_key(item_key)
  );

-- Canonical lifecycle evaluation must never count arbitrary required checklist
-- rows as a staff conversion/provisioning blocker.
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

  select *
    into app_row
    from public.laurem_recruitment_applications
   where id=p_application_id
   for update;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'code','APPLICATION_NOT_FOUND',
      'reason','Application not found.'
    );
  end if;

  application_role:=public.laurem_normalize_role(app_row.role_applied);

  select *
    into contract_row
    from public.laurem_recruitment_contracts
   where application_id=p_application_id
     and status='accepted'
     and accepted_at is not null
   order by accepted_at desc
   limit 1
   for update;

  if found then
    contract_role:=public.laurem_normalize_role(contract_row.job_title);
    contract_ok:=contract_role is not null
      and application_role is not null
      and contract_role=application_role;
  end if;

  select exists(
    select 1
      from public.laurem_recruitment_onboarding_checklist
     where application_id=p_application_id
       and required
       and public.laurem_is_staff_lifecycle_readiness_key(item_key)
  ) into readiness_has_items;

  select not exists(
    select 1
      from public.laurem_recruitment_onboarding_checklist
     where application_id=p_application_id
       and required
       and public.laurem_is_staff_lifecycle_readiness_key(item_key)
       and status not in ('completed','waived')
  ) into readiness_ok;

  readiness_ok:=readiness_has_items and readiness_ok;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where application_id=p_application_id
   limit 1
   for update;

  staff_exists:=found;

  if staff_exists and contract_row.id is not null then
    staff_binding_ok:=staff_row.contract_id is null
      or staff_row.contract_id=contract_row.id;
  elsif staff_exists then
    staff_binding_ok:=false;
  end if;

  if not contract_ok then
    return jsonb_build_object(
      'ok',false,
      'code','CONTRACT_POLICY_BLOCKED',
      'reason','An accepted employment contract matching the application role is required.',
      'repair_action','Review or replace the contract, then rerun the gated onboarding flow.'
    );
  end if;

  if not readiness_ok then
    return jsonb_build_object(
      'ok',false,
      'code','READINESS_POLICY_BLOCKED',
      'reason','All canonical staff lifecycle readiness items must be completed or explicitly waived.',
      'repair_action','Complete or appropriately waive the canonical readiness items, then rerun the gated onboarding flow.'
    );
  end if;

  case p_transition
    when 'prepare_onboarding' then
      if app_row.status not in ('Offer','Onboarding','Hired')
         and not (p_reentry_override and app_row.status in ('Rejected','Withdrawn')) then
        return jsonb_build_object(
          'ok',false,
          'code','APPLICATION_STATE_BLOCKED',
          'reason',format('Application status %s cannot enter the onboarding preparation boundary.',app_row.status),
          'repair_action','Move the application through the canonical recruitment lifecycle or use an explicit terminal-state re-entry override.'
        );
      end if;

      if staff_exists and not staff_binding_ok then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_CONTRACT_MISMATCH',
          'reason','The existing staff profile is bound to a different employment contract.',
          'repair_action','Review the staff record before attempting re-entry.'
        );
      end if;

      repair_action:=case
        when not staff_exists or staff_row.contract_id is null
          then 'The gated onboarding flow will create or bind the workforce identity.'
        else null
      end;

    when 'mark_hired' then
      if app_row.status not in ('Onboarding','Hired')
         and not (p_reentry_override and app_row.status in ('Rejected','Withdrawn')) then
        return jsonb_build_object(
          'ok',false,
          'code','APPLICATION_STATE_BLOCKED',
          'reason',format('Application status %s cannot enter Hired.',app_row.status),
          'repair_action','Prepare onboarding before moving the application to Hired.'
        );
      end if;

      if not staff_exists then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_REQUIRED',
          'reason','A workforce staff profile must exist before the application can be Hired.',
          'repair_action','Re-run the gated admin onboarding flow.'
        );
      end if;

      if not staff_binding_ok or staff_row.contract_id is null then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_CONTRACT_BINDING_REQUIRED',
          'reason','The workforce staff profile must be bound to the accepted contract before Hired.',
          'repair_action','Re-run the gated admin onboarding flow to repair the contract binding.'
        );
      end if;

      if staff_row.employment_status not in ('pending','active') then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_STATE_BLOCKED',
          'reason',format('Staff employment status %s cannot support Hired.',staff_row.employment_status),
          'repair_action','Review the staff employment status before retrying Hired.'
        );
      end if;

    when 'portal_provision','portal_activate' then
      if app_row.status <> 'Hired' then
        return jsonb_build_object(
          'ok',false,
          'code','HIRED_REQUIRED',
          'reason','The application must be Hired before the staff portal lifecycle can proceed.',
          'repair_action','Complete the Hired transition first.'
        );
      end if;

      if not staff_exists then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_REQUIRED',
          'reason','A workforce staff profile must exist before portal lifecycle operations can proceed.',
          'repair_action','Re-run the gated admin onboarding flow.'
        );
      end if;

      if not staff_binding_ok or staff_row.contract_id is null then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_CONTRACT_BINDING_REQUIRED',
          'reason','The workforce staff profile must be bound to the accepted contract before portal lifecycle operations can proceed.',
          'repair_action','Re-run the gated admin onboarding flow to repair the contract binding.'
        );
      end if;

      if staff_row.employment_status <> 'pending' then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_PORTAL_STATE_BLOCKED',
          'reason',format('Portal lifecycle requires a pending staff record, not %s.',staff_row.employment_status),
          'repair_action','Review the existing activation or employment state instead of issuing another activation.'
        );
      end if;

      if staff_row.activated_at is not null then
        return jsonb_build_object(
          'ok',false,
          'code','STAFF_ALREADY_ACTIVATED',
          'reason','The staff portal account has already been activated.',
          'repair_action','Use the existing staff session/login recovery flow.'
        );
      end if;

    else
      raise exception using errcode='P0001',message='INVALID_LIFECYCLE_TRANSITION';
  end case;

  return jsonb_build_object(
    'ok',true,
    'transition',p_transition,
    'application_id',p_application_id,
    'application_status',app_row.status,
    'contract_id',contract_row.id,
    'staff_id',case when staff_exists then staff_row.id else null end,
    'staff_status',case when staff_exists then staff_row.employment_status else null end,
    'repair_action',repair_action
  );
end;
$function$;

-- The atomic staff-onboarding preparer uses the same canonical allowlist.
-- Existing application/contract/readiness gates remain intact.
-- The only checklist rows counted below are canonical lifecycle keys.
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
as $function$
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

  if lower(trim(coalesce(contract_row.job_title, ''))) <> lower(trim(coalesce(app_row.role_applied, ''))) then
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
       and public.laurem_is_staff_lifecycle_readiness_key(item_key)
       and status not in ('completed', 'waived')
  ) into incomplete_required;

  if incomplete_required then
    raise exception using
      errcode='P0001',
      message='READINESS_INCOMPLETE';
  end if;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where application_id = p_application_id
   for update;

  if not found then
    employee_number_value := 'LAU-' || extract(year from current_date)::int || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.laurem_staff_profiles(
      application_id, employee_number, full_name, email, phone, job_title,
      employment_status, start_date, location, nmc_number,
      right_to_work_verified, dbs_verified, contract_id
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
      nullif(trim(coalesce(p_nmc_number, app_row.application_data->>'nmc_number')), ''),
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
    from public.laurem_staff_onboarding_packages as onboarding_package
   where onboarding_package.staff_id = staff_row.id
   for update;

  if not found then
    insert into public.laurem_staff_onboarding_packages(
      staff_id, audience, title, status, access_token_hash, access_token_expires_at
    )
    values (
      staff_row.id, p_audience, p_package_title, 'pending',
      p_access_token_hash, p_access_token_expires_at
    )
    returning * into package_row;

    created_package_value := true;
    access_token_issued_value := p_access_token_hash is not null;
  elsif package_row.access_token_hash is null and p_access_token_hash is not null then
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
    package_id, task_key, category, title, description, required, document_path,
    acknowledgement_required, sort_order
  )
  select package_row.id, t.task_key, t.category, t.title, t.description,
         coalesce(t.required, true), t.document_path,
         coalesce(t.acknowledgement_required, true), coalesce(t.sort_order, 0)
    from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) as t(
      task_key text, category text, title text, description text, required boolean,
      document_path text, acknowledgement_required boolean, sort_order integer
    )
  on conflict on constraint laurem_staff_onboarding_tasks_package_id_task_key_key do nothing;

  select exists(
    select 1
      from public.laurem_staff_onboarding_tasks as onboarding_task
     where onboarding_task.package_id = package_row.id
       and required
       and not (
         status in ('completed', 'waived')
         and (not acknowledgement_required or acknowledged_at is not null)
       )
  ) into incomplete_required;

  select exists(
    select 1
      from public.laurem_staff_onboarding_tasks as onboarding_task
     where onboarding_task.package_id = package_row.id
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
      p_application_id, 'Onboarding', p_actor,
      format('Staff onboarding package %s prepared atomically', package_row.id),
      false, null
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
$function$;

-- Evidence reviews can only alter readiness when the evidence type itself
-- maps to the same canonical readiness key. A document called "dbs", "svg",
-- or any unknown type cannot claim a readiness key.
create or replace function public.laurem_record_evidence_review(
  p_application_id uuid,
  p_evidence_type text,
  p_document_id uuid,
  p_status text,
  p_actor text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_readiness_item_key text default null,
  p_expires_at timestamptz default null
)
returns public.laurem_recruitment_evidence_reviews
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_row public.laurem_recruitment_evidence_reviews;
  result_row public.laurem_recruitment_evidence_reviews;
  checklist_status text;
  canonical_key text;
begin
  if nullif(trim(coalesce(p_evidence_type, '')), '') is null then
    raise exception using errcode='P0001', message='EVIDENCE_TYPE_REQUIRED';
  end if;

  if p_status not in ('pending','approved','rejected','waived','expired','superseded') then
    raise exception using errcode='P0001', message='INVALID_EVIDENCE_STATUS';
  end if;

  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception using errcode='P0001', message='EVIDENCE_ACTOR_REQUIRED';
  end if;

  if p_status = 'approved' and p_expires_at is not null and p_expires_at <= now() then
    raise exception using errcode='P0001', message='EVIDENCE_EXPIRY_MUST_BE_FUTURE';
  end if;

  if p_document_id is not null and not exists (
    select 1 from public.laurem_recruitment_documents d
    where d.id = p_document_id and d.application_id = p_application_id
  ) then
    raise exception using errcode='P0001', message='EVIDENCE_DOCUMENT_APPLICATION_MISMATCH';
  end if;

  select *
    into current_row
    from public.laurem_recruitment_evidence_reviews
   where application_id = p_application_id
     and evidence_type = p_evidence_type
     and status in ('pending','approved','waived')
   order by created_at desc
   limit 1
   for update;

  if current_row.id is not null
     and current_row.status = p_status
     and current_row.document_id is not distinct from p_document_id
     and current_row.expires_at is not distinct from p_expires_at then
    return current_row;
  end if;

  if current_row.id is not null then
    update public.laurem_recruitment_evidence_reviews
       set status = 'superseded', updated_at = now()
     where id = current_row.id;

    insert into public.laurem_recruitment_evidence_audit(
      application_id, evidence_review_id, action, actor, previous_status, new_status, note
    )
    values (
      p_application_id, current_row.id, 'superseded', p_actor,
      current_row.status, 'superseded', p_note
    );
  end if;

  insert into public.laurem_recruitment_evidence_reviews(
    application_id, evidence_type, document_id, status, reviewed_by, reviewed_at,
    review_note, metadata, expires_at
  )
  values (
    p_application_id,
    nullif(trim(p_evidence_type), ''),
    p_document_id,
    p_status,
    case when p_status in ('approved','rejected','waived','expired','superseded') then p_actor else null end,
    case when p_status in ('approved','rejected','waived','expired','superseded') then now() else null end,
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    p_expires_at
  )
  returning * into result_row;

  insert into public.laurem_recruitment_evidence_audit(
    application_id, evidence_review_id, action, actor, previous_status, new_status, note
  )
  values (
    p_application_id, result_row.id, 'status_changed', p_actor,
    current_row.status, p_status, p_note
  );

  if p_document_id is not null and p_status in ('pending','approved','rejected') then
    update public.laurem_recruitment_documents
       set status = case
         when p_status = 'approved' then 'approved'
         when p_status = 'rejected' then 'rejected'
         else 'pending'
       end,
       reviewed_by = case when p_status = 'pending' then null else p_actor end,
       reviewed_at = case when p_status = 'pending' then null else now() end,
       review_note = nullif(trim(coalesce(p_note, '')), '')
     where id = p_document_id
       and application_id = p_application_id;
  end if;

  if p_document_id is not null and p_status = 'approved' then
    update public.laurem_recruitment_documents
       set superseded_at = null, superseded_by = null
     where id = p_document_id
       and application_id = p_application_id;
  end if;

  canonical_key := public.laurem_staff_readiness_key_for_evidence_type(p_evidence_type);

  if p_readiness_item_key is not null
     and canonical_key is not null
     and lower(btrim(p_readiness_item_key)) = canonical_key then

    checklist_status := case
      when p_status = 'approved' then 'completed'
      when p_status = 'waived' then 'waived'
      else 'pending'
    end;

    update public.laurem_recruitment_onboarding_checklist
       set status = checklist_status,
           completed_at = case when checklist_status in ('completed','waived') then now() else null end,
           completed_by = case when checklist_status in ('completed','waived') then p_actor else null end,
           notes = nullif(trim(coalesce(p_note, '')), ''),
           updated_at = now()
     where application_id = p_application_id
       and item_key = canonical_key;
  end if;

  return result_row;
end;
$function$;

revoke all on function public.laurem_is_staff_lifecycle_readiness_key(text)
  from public, anon, authenticated;
grant execute on function public.laurem_is_staff_lifecycle_readiness_key(text)
  to service_role;

revoke all on function public.laurem_staff_readiness_key_for_evidence_type(text)
  from public, anon, authenticated;
grant execute on function public.laurem_staff_readiness_key_for_evidence_type(text)
  to service_role;

revoke all on function public.laurem_evaluate_staff_lifecycle(uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.laurem_evaluate_staff_lifecycle(uuid,text,boolean)
  to service_role;

revoke all on function public.laurem_prepare_staff_onboarding_atomic(
  uuid,text,text,text,jsonb,text,text,boolean,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.laurem_prepare_staff_onboarding_atomic(
  uuid,text,text,text,jsonb,text,text,boolean,text,timestamptz
) to service_role;

revoke all on function public.laurem_record_evidence_review(
  uuid,text,uuid,text,text,text,jsonb,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.laurem_record_evidence_review(
  uuid,text,uuid,text,text,text,jsonb,text,timestamptz
) to service_role;

alter function public.laurem_is_staff_lifecycle_readiness_key(text)
  set search_path = public;

alter function public.laurem_staff_readiness_key_for_evidence_type(text)
  set search_path = public;

