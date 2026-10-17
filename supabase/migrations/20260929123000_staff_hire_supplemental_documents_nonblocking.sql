-- CONAGS: supplemental candidate documents must not be able to roll back a valid staff hire.
-- The core employment contract, generated employment documents and activation credential
-- remain protected by the canonical lifecycle gates.
-- CONAGS: make employment conversion and initial staff-portal provisioning one DB transaction.
-- Email delivery remains post-commit; the portal credential, mailbox identity,
-- employment documents, audit/history, and Hired status are committed together.

create unique index if not exists laurem_staff_internal_mailboxes_handle_namespace_key
  on public.laurem_staff_internal_mailboxes(handle, namespace);

create or replace function public.laurem_guard_staff_activation_status()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.employment_status = 'active'
     and old.employment_status <> 'active'
     and (new.activated_at is null or new.password_hash is null) then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_PORTAL_ACTIVATION_REQUIRED',
      detail = 'A staff account becomes active only after the one-time portal activation flow records activated_at and a password.';
  end if;
  return new;
end;
$function$;

drop trigger if exists laurem_staff_activation_status_guard on public.laurem_staff_profiles;

create trigger laurem_staff_activation_status_guard
before update of employment_status, activated_at, password_hash
on public.laurem_staff_profiles
for each row
execute function public.laurem_guard_staff_activation_status();


create or replace function public.laurem_hire_application_atomic(
  p_application_id uuid,
  p_actor text,
  p_job_title text,
  p_job_description text,
  p_job_description_sha256 text,
  p_activation_token_hash text,
  p_activation_expires_at timestamptz
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
  mailbox_row public.laurem_staff_internal_mailboxes%rowtype;
  candidate_pack_exists boolean := false;
  mailbox_namespace text;
  mailbox_base text;
  mailbox_handle text;
  now_value timestamptz := clock_timestamp();
  had_activation_token boolean := false;
  i integer;
  package_result jsonb;
  signed_result jsonb := '{}'::jsonb;
  lifecycle_policy jsonb;
  transitioned public.laurem_recruitment_applications;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_job_title,'')),'') is null then
    raise exception using errcode='P0001', message='JOB_TITLE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_job_description,'')),'') is null then
    raise exception using errcode='P0001', message='JOB_DESCRIPTION_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_job_description_sha256,'')),'') is null then
    raise exception using errcode='P0001', message='JOB_DESCRIPTION_HASH_REQUIRED';
  end if;

  if encode(extensions.digest(convert_to(p_job_description, 'utf8'), 'sha256'), 'hex') <> lower(trim(p_job_description_sha256)) then
    raise exception using errcode='P0001', message='JOB_DESCRIPTION_HASH_MISMATCH';
  end if;

  if nullif(trim(coalesce(p_activation_token_hash,'')),'') is null then
    raise exception using errcode='P0001', message='STAFF_ACTIVATION_TOKEN_REQUIRED';
  end if;

  if p_activation_expires_at is null or p_activation_expires_at <= now_value then
    raise exception using errcode='P0001', message='STAFF_ACTIVATION_EXPIRY_INVALID';
  end if;

  select *
    into app_row
    from public.laurem_recruitment_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND';
  end if;

  if app_row.status <> 'Onboarding' then
    raise exception using
      errcode='P0001',
      message='APPLICATION_NOT_READY_FOR_ATOMIC_HIRE',
      detail=format('Atomic hire expects Onboarding, received %s.', app_row.status);
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
    raise exception using errcode='P0001', message='ACCEPTED_CONTRACT_REQUIRED';
  end if;

  if public.laurem_normalize_role(contract_row.job_title)
     is distinct from public.laurem_normalize_role(app_row.role_applied) then
    raise exception using errcode='P0001', message='CONTRACT_ROLE_MISMATCH';
  end if;

  lifecycle_policy := public.laurem_evaluate_staff_lifecycle(
    p_application_id,
    'mark_hired',
    false
  );

  if coalesce((lifecycle_policy->>'ok')::boolean, false) = false then
    raise exception using
      errcode='P0001',
      message='LIFECYCLE_POLICY_BLOCKED',
      detail=coalesce(lifecycle_policy->>'reason', 'Canonical Hired lifecycle policy blocked atomic hire.');
  end if;

  select *
    into staff_row
    from public.laurem_staff_profiles
   where application_id = p_application_id
   order by created_at asc
   limit 1
   for update;

  if not found then
    raise exception using errcode='P0001', message='STAFF_REQUIRED';
  end if;

  if staff_row.contract_id is null or staff_row.contract_id <> contract_row.id then
    raise exception using errcode='P0001', message='STAFF_CONTRACT_BINDING_REQUIRED';
  end if;

  if staff_row.employment_status <> 'pending' or staff_row.activated_at is not null or staff_row.password_hash is not null then
    raise exception using
      errcode='P0001',
      message='STAFF_PORTAL_STATE_BLOCKED',
      detail='Atomic hire requires a pending, not-yet-activated staff profile.';
  end if;

  package_result := public.laurem_issue_staff_employment_document_package(
    p_staff_id,
    p_application_id,
    p_job_title,
    p_job_description,
    lower(trim(p_job_description_sha256)),
    p_actor
  );

  select exists(
    select 1
      from public.laurem_candidate_document_packs
     where application_id = p_application_id
       and status = 'completed'
  ) into candidate_pack_exists;

  if candidate_pack_exists then
    begin
      signed_result := public.laurem_attach_signed_candidate_documents_to_staff(
        p_staff_id,
        p_application_id,
        p_actor
      );
    exception
      when others then
        -- Signed candidate documents are supplemental. A malformed, missing,
        -- unsupported, or otherwise failed attachment must never roll back the
        -- core hire, staff profile, mailbox, employment documents or activation
        -- credential that have already satisfied the lifecycle gates.
        signed_result := jsonb_build_object(
          'ok', false,
          'skipped', true,
          'reason', 'Supplemental candidate document attachment failed after core hire gates were satisfied.',
          'error_code', sqlstate
        );

        insert into public.laurem_staff_security_events(
          staff_id,
          event_type,
          actor,
          details
        )
        values (
          p_staff_id,
          'staff.candidate_documents.attach_failed',
          coalesce(nullif(trim(p_actor),''),'staff_portal_provisioning'),
          jsonb_build_object(
            'application_id', p_application_id,
            'error_code', sqlstate,
            'core_hire_continues', true
          )
        );
    end;
  end if;

  select *
    into mailbox_row
    from public.laurem_staff_internal_mailboxes
   where staff_id = staff_row.id
   for update;

  if not found then
    mailbox_namespace := case
      when lower(coalesce(staff_row.job_title,'')) like '%nurse%' then 'conagsnurse'
      when lower(coalesce(staff_row.job_title,'')) like '%care%'
        or lower(coalesce(staff_row.job_title,'')) like '%support%'
        or lower(coalesce(staff_row.job_title,'')) like '%assistant%' then 'conagscare'
      else 'conagsstaff'
    end;

    mailbox_base := regexp_replace(
      lower(trim(coalesce(staff_row.full_name,'staff'))),
      '[^a-z0-9]+',
      '.',
      'g'
    );
    mailbox_base := regexp_replace(mailbox_base, '[.]+', '.', 'g');
    mailbox_base := btrim(mailbox_base, '.');

    if nullif(mailbox_base,'') is null then
      mailbox_base := 'staff';
    end if;

    for i in 1..100 loop
      mailbox_handle := case when i = 1 then mailbox_base else mailbox_base || i::text end;

      insert into public.laurem_staff_internal_mailboxes(
        staff_id, handle, namespace, enabled, created_at, updated_at
      )
      values (
        staff_row.id, mailbox_handle, mailbox_namespace, true, now_value, now_value
      )
      on conflict do nothing
      returning * into mailbox_row;

      if found then
        exit;
      end if;
    end loop;

    if mailbox_row.id is null then
      raise exception using errcode='P0001', message='STAFF_MAILBOX_ALLOCATION_FAILED';
    end if;
  end if;

  had_activation_token := staff_row.activation_token_hash is not null;

  update public.laurem_staff_profiles
     set portal_handle = mailbox_row.handle,
         department_namespace = mailbox_row.namespace,
         portal_address = mailbox_row.handle || '@' || mailbox_row.namespace,
         activation_token_hash = p_activation_token_hash,
         activation_expires_at = p_activation_expires_at,
         activation_used_at = null,
         updated_at = now_value
   where id = staff_row.id
   returning * into staff_row;

  insert into public.laurem_staff_security_events(
    staff_id,
    event_type,
    actor,
    details
  )
  values (
    staff_row.id,
    'staff.activation.issued',
    coalesce(nullif(trim(p_actor),''),'staff_portal_provisioning'),
    jsonb_build_object(
      'expires_at', p_activation_expires_at,
      'atomic_hire', true,
      'application_status_before', app_row.status,
      'reissued', had_activation_token
    )
  );

  select public.laurem_transition_application_status(
    p_application_id,
    'Hired',
    p_actor,
    'Employment document package issued, staff portal provisioned, and one-time activation credential recorded atomically.',
    false,
    null
  ) into transitioned;

  return jsonb_build_object(
    'ok', true,
    'application', to_jsonb(transitioned),
    'staff_id', staff_row.id,
    'employee_number', staff_row.employee_number,
    'laurem_id', coalesce(staff_row.laurem_id, staff_row.employee_number),
    'email', staff_row.email,
    'full_name', staff_row.full_name,
    'job_title', staff_row.job_title,
    'employment_status', staff_row.employment_status,
    'activated_at', staff_row.activated_at,
    'portal_address', mailbox_row.handle || '@' || mailbox_row.namespace,
    'activation_issued', true,
    'activation_expires_at', p_activation_expires_at,
    'employment_documents', package_result,
    'signed_candidate_documents', signed_result
  );
end;
$function$;

revoke all on function public.laurem_hire_application_atomic(
  uuid,text,text,text,text,text,timestamptz
) from public, anon, authenticated;

grant execute on function public.laurem_hire_application_atomic(
  uuid,text,text,text,text,text,timestamptz
) to service_role;

revoke all on function public.laurem_guard_staff_activation_status()
  from public, anon, authenticated;

grant execute on function public.laurem_guard_staff_activation_status()
  to service_role;
