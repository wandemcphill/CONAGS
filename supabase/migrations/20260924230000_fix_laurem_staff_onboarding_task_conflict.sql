-- Forward-only correction for the PL/pgSQL output-variable collision in the onboarding task upsert.
-- Use the unique constraint explicitly so package_id cannot resolve to the RPC output variable.

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

revoke all on function public.laurem_prepare_staff_onboarding_atomic(
  uuid,text,text,text,jsonb,text,text,boolean,text,timestamptz
) from public, anon, authenticated;

grant execute on function public.laurem_prepare_staff_onboarding_atomic(
  uuid,text,text,text,jsonb,text,text,boolean,text,timestamptz
) to service_role;