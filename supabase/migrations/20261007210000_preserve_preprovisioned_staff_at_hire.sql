-- CONAGS: allow a staff account activated during onboarding to pass cleanly into Hired.
-- The existing Hired path remains readiness-gated. This function preserves the
-- pre-hire portal password/session and only promotes employment_status to active.

create or replace function public.laurem_hire_preprovisioned_staff_atomic(
  p_application_id uuid,
  p_actor text,
  p_job_title text,
  p_job_description text,
  p_job_description_sha256 text
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
  candidate_pack_exists boolean := false;
  package_result jsonb;
  signed_result jsonb := '{}'::jsonb;
  lifecycle_policy jsonb;
  transitioned public.laurem_recruitment_applications;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_job_title,'')),'') is null then
    raise exception using errcode='P0001', message='JOB_TITLE_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_job_description,'')),'') is null then
    raise exception using errcode='P0001', message='JOB_DESCRIPTION_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_job_description_sha256,'')),'') is null then
    raise exception using errcode='P0001', message='JOB_DESCRIPTION_HASH_REQUIRED';
  end if;
  if encode(extensions.digest(convert_to(p_job_description,'utf8'),'sha256'),'hex') <> lower(trim(p_job_description_sha256)) then
    raise exception using errcode='P0001', message='JOB_DESCRIPTION_HASH_MISMATCH';
  end if;

  select * into app_row
    from public.laurem_recruitment_applications
   where id=p_application_id
   for update;
  if not found then raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND'; end if;
  if app_row.status <> 'Onboarding' then
    raise exception using errcode='P0001', message='APPLICATION_NOT_READY_FOR_PREPROVISIONED_HIRE',
      detail=format('Pre-provisioned hire expects Onboarding, received %s.',app_row.status);
  end if;

  select * into contract_row
    from public.laurem_recruitment_contracts
   where application_id=p_application_id
     and status='accepted'
     and accepted_at is not null
   order by accepted_at desc
   limit 1
   for update;
  if not found then raise exception using errcode='P0001', message='ACCEPTED_CONTRACT_REQUIRED'; end if;

  if public.laurem_normalize_role(contract_row.job_title) is distinct from public.laurem_normalize_role(app_row.role_applied) then
    raise exception using errcode='P0001', message='CONTRACT_ROLE_MISMATCH';
  end if;

  lifecycle_policy := public.laurem_evaluate_staff_lifecycle(p_application_id,'mark_hired',false);
  if coalesce((lifecycle_policy->>'ok')::boolean,false)=false then
    raise exception using errcode='P0001', message='LIFECYCLE_POLICY_BLOCKED',
      detail=coalesce(lifecycle_policy->>'reason','Canonical Hired lifecycle policy blocked pre-provisioned hire.');
  end if;

  select * into staff_row
    from public.laurem_staff_profiles
   where application_id=p_application_id
   order by created_at asc
   limit 1
   for update;
  if not found then raise exception using errcode='P0001', message='STAFF_REQUIRED'; end if;
  if staff_row.contract_id is null or staff_row.contract_id <> contract_row.id then
    raise exception using errcode='P0001', message='STAFF_CONTRACT_BINDING_REQUIRED';
  end if;
  if staff_row.employment_status <> 'pending'
     or staff_row.activated_at is null
     or staff_row.password_hash is null then
    raise exception using errcode='P0001', message='STAFF_PREPROVISIONED_PORTAL_REQUIRED',
      detail='A pre-provisioned hire must have an activated pending Staff Portal account.';
  end if;

  package_result := public.laurem_issue_staff_employment_document_package(
    staff_row.id,
    p_application_id,
    p_job_title,
    p_job_description,
    lower(trim(p_job_description_sha256)),
    p_actor
  );

  select exists(
    select 1 from public.laurem_candidate_document_packs
    where application_id=p_application_id and status='completed'
  ) into candidate_pack_exists;

  if candidate_pack_exists then
    begin
      signed_result := public.laurem_attach_signed_candidate_documents_to_staff(
        staff_row.id,
        p_application_id,
        p_actor
      );
    exception when others then
      signed_result := jsonb_build_object(
        'ok',false,
        'skipped',true,
        'reason','Supplemental candidate document attachment failed after core hire gates were satisfied.',
        'error_code',sqlstate
      );
      insert into public.laurem_staff_security_events(staff_id,event_type,actor,details)
      values(
        staff_row.id,
        'staff.candidate_documents.attach_failed',
        coalesce(nullif(trim(p_actor),''),'staff_portal_hire'),
        jsonb_build_object('application_id',p_application_id,'error_code',sqlstate,'core_hire_continues',true)
      );
    end;
  end if;

  update public.laurem_staff_profiles
     set employment_status='active',
         updated_at=clock_timestamp()
   where id=staff_row.id
   returning * into staff_row;

  select public.laurem_transition_application_status(
    p_application_id,
    'Hired',
    p_actor,
    'Employment documents issued and previously activated Staff Portal account promoted to active employment.',
    false,
    null
  ) into transitioned;

  return jsonb_build_object(
    'ok',true,
    'application',to_jsonb(transitioned),
    'staff_id',staff_row.id,
    'employee_number',staff_row.employee_number,
    'laurem_id',coalesce(staff_row.laurem_id,staff_row.employee_number),
    'email',staff_row.email,
    'full_name',staff_row.full_name,
    'job_title',staff_row.job_title,
    'employment_status',staff_row.employment_status,
    'activated_at',staff_row.activated_at,
    'activation_issued',false,
    'employment_documents',package_result,
    'signed_candidate_documents',signed_result
  );
end;
$function$;

revoke all on function public.laurem_hire_preprovisioned_staff_atomic(uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.laurem_hire_preprovisioned_staff_atomic(uuid,text,text,text,text)
  to service_role;
