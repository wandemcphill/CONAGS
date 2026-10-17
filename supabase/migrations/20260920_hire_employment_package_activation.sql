-- CONAGS hire-time employment document package and corrected Hired lifecycle boundary.
-- Hired is the administrative confirmation point. Portal activation and employment document issuance follow that action.

create or replace function public.laurem_transition_application_status(
  p_application_id uuid,
  p_to_status text,
  p_actor text,
  p_note text default null,
  p_override boolean default false,
  p_override_reason text default null
)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.laurem_recruitment_applications;
  result_row public.laurem_recruitment_applications;
  allowed boolean := false;
  blocked_reason text := null;
  readiness_ready boolean := false;
  accepted_contract boolean := false;
  staff_ready boolean := false;
  round_one_passed boolean := false;
  round_two_passed boolean := false;
  platform_contract_required boolean := false;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  select * into app_row from public.laurem_recruitment_applications where id=p_application_id for update;
  if not found then raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND'; end if;
  if p_to_status is null or p_to_status not in('Enquiry','Invited','Application','Screening','Interview','Second Interview','Documents','Sponsorship','Offer','Onboarding','Hired','Rejected','Withdrawn') then
    raise exception using errcode='P0001', message='INVALID_RECRUITMENT_STATUS';
  end if;

  allowed := (app_row.status=p_to_status)
    or (app_row.status='Enquiry' and p_to_status in('Invited','Rejected','Withdrawn'))
    or (app_row.status='Invited' and p_to_status in('Application','Rejected','Withdrawn'))
    or (app_row.status='Application' and p_to_status in('Screening','Rejected','Withdrawn'))
    or (app_row.status='Screening' and p_to_status in('Interview','Documents','Rejected','Withdrawn'))
    or (app_row.status='Interview' and p_to_status in('Second Interview','Documents','Offer','Rejected','Withdrawn'))
    or (app_row.status='Second Interview' and p_to_status in('Documents','Offer','Rejected','Withdrawn'))
    or (app_row.status='Documents' and p_to_status in('Sponsorship','Offer','Rejected','Withdrawn'))
    or (app_row.status='Sponsorship' and p_to_status in('Offer','Rejected','Withdrawn'))
    or (app_row.status='Offer' and p_to_status in('Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Onboarding' and p_to_status in('Hired','Rejected','Withdrawn'));
  if not allowed then
    blocked_reason := format('Transition from %s to %s is not permitted.',app_row.status,p_to_status);
  end if;

  if p_to_status='Second Interview' and not p_override then
    select exists(select 1 from public.laurem_interview_attempts a where a.application_id=app_row.id and a.round=1 and a.status='passed') into round_one_passed;
    if not round_one_passed then blocked_reason:=coalesce(blocked_reason||' ','')||'Round 1 must be passed before Second Interview.'; end if;
  end if;

  if p_to_status='Offer' and not p_override then
    select exists(select 1 from public.laurem_interview_attempts a where a.application_id=app_row.id and a.round=2 and a.status='submitted') into round_two_passed;
    if not round_two_passed then blocked_reason:=coalesce(blocked_reason||' ','')||'Round 2 must be completed before Offer.'; end if;
  end if;

  if p_to_status='Onboarding' and not p_override then
    select not exists(
      select 1 from public.laurem_recruitment_onboarding_checklist c
      where c.application_id=app_row.id and c.required and c.status not in('completed','waived')
        and not exists (
          select 1 from public.laurem_recruitment_evidence_reviews r
          where r.application_id=app_row.id and r.status in('approved','waived')
            and ((c.item_key='identity_verified' and lower(regexp_replace(r.evidence_type,'[^a-z0-9]+','_','g')) in ('identity','identity_document','passport','proof_of_identity'))
              or (c.item_key='qualification_evidence_verified' and lower(regexp_replace(r.evidence_type,'[^a-z0-9]+','_','g')) in ('qualification','qualification_evidence','training','certificate'))
              or (c.item_key='references_verified' and lower(regexp_replace(r.evidence_type,'[^a-z0-9]+','_','g')) in ('reference','references','reference_letter'))
              or (c.item_key='right_to_work_verified' and lower(regexp_replace(r.evidence_type,'[^a-z0-9]+','_','g')) in ('right_to_work','right_to_work_document'))
              or (c.item_key='international_work_permission_verified' and lower(regexp_replace(r.evidence_type,'[^a-z0-9]+','_','g')) in ('work_permission','international_work_permission','visa'))
              or (c.item_key='professional_registration_verified' and lower(regexp_replace(r.evidence_type,'[^a-z0-9]+','_','g')) in ('nmc_registration','professional_registration','nmc'))
            )
        )
    ) into readiness_ready;
    if not readiness_ready then blocked_reason:=coalesce(blocked_reason||' ','')||'Onboarding readiness is incomplete.'; end if;
    platform_contract_required := lower(trim(coalesce(app_row.role_applied,'')))='registered nurse' and app_row.living_in_uk='No';
    if platform_contract_required then
      select exists(select 1 from public.laurem_recruitment_contracts c where c.application_id=app_row.id and c.status='accepted' and c.accepted_at is not null and lower(coalesce(c.job_title,''))='registered nurse') into accepted_contract;
      if not accepted_contract then blocked_reason:=coalesce(blocked_reason||' ','')||'An accepted international Registered Nurse contract is required.'; end if;
    end if;
  end if;

  if p_to_status='Hired' and not p_override then
    select exists(
      select 1 from public.laurem_staff_profiles s
      where s.application_id=app_row.id
        and s.employment_status in ('pending','active')
    ) into staff_ready;
    if not staff_ready then
      blocked_reason:=coalesce(blocked_reason||' ','')||'A prepared staff profile is required before Hired.';
    end if;

    select exists(
      select 1 from public.laurem_recruitment_contracts c
      where c.application_id=app_row.id
        and c.status='accepted'
        and c.accepted_at is not null
    ) into accepted_contract;
    if not accepted_contract then
      blocked_reason:=coalesce(blocked_reason||' ','')||'An accepted employment contract is required before Hired.';
    end if;
  end if;

  if blocked_reason is not null and not p_override then
    insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
    values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked',blocked_reason,jsonb_build_object('override_requested',false));
    raise exception using errcode='P0001',message='STATUS_TRANSITION_BLOCKED',detail=blocked_reason;
  end if;

  if p_override and nullif(trim(coalesce(p_override_reason,'')),'') is null then
    insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
    values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked','Override reason is required.',jsonb_build_object('override_requested',true));
    raise exception using errcode='P0001',message='OVERRIDE_REASON_REQUIRED';
  end if;

  update public.laurem_recruitment_applications set status=p_to_status,updated_at=now() where id=p_application_id returning * into result_row;
  insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note)
  values(p_application_id,app_row.status,p_to_status,p_actor,coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')));
  insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
  values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,case when p_override then 'overridden' else 'allowed' end,coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')),jsonb_build_object('override',p_override,'blocked_reason',blocked_reason));
  return result_row;
end;
$$;

revoke all on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) to service_role;

create or replace function public.laurem_issue_staff_employment_document_package(
  p_staff_id uuid,
  p_application_id uuid,
  p_job_title text,
  p_job_description text,
  p_job_description_sha256 text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.laurem_staff_profiles;
  job_doc public.laurem_staff_documents;
  contract_result jsonb;
  accepted_contract boolean := false;
  existing_job_doc public.laurem_staff_documents;
  job_source_key text := lower(trim(coalesce(p_job_title,'')));
  now_value timestamptz := clock_timestamp();
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

  select * into staff_row
  from public.laurem_staff_profiles
  where id=p_staff_id and application_id=p_application_id
  for update;
  if not found then raise exception using errcode='P0001', message='STAFF_NOT_FOUND'; end if;

  if staff_row.employment_status not in ('pending','active') then
    raise exception using errcode='P0001', message='STAFF_NOT_ELIGIBLE_FOR_HIRE';
  end if;

  select exists(
    select 1 from public.laurem_recruitment_contracts c
    where c.application_id=p_application_id and c.status='accepted' and c.accepted_at is not null
  ) into accepted_contract;
  if not accepted_contract then
    raise exception using errcode='P0001', message='ACCEPTED_CONTRACT_REQUIRED';
  end if;

  select public.laurem_attach_accepted_contract_document(
    p_staff_id,
    p_application_id,
    p_actor
  ) into contract_result;

  select * into existing_job_doc
  from public.laurem_staff_documents
  where staff_id=p_staff_id
    and source_type='job_description'
    and source_key=job_source_key
  for update;

  if found then
    job_doc := existing_job_doc;
    if job_doc.status = 'revoked' then
      update public.laurem_staff_documents
      set status='issued',
          requires_signature=true,
          signature_status=case when signed_at is not null then 'signed' else 'pending' end,
          content_text=p_job_description,
          document_sha256=p_job_description_sha256,
          issuer_name='Dezou Maurice',
          issuer_title='Manager',
          employer_name='Conags Care Ltd',
          issued_by_actor=coalesce(nullif(btrim(p_actor),''),'CONAGS platform'),
          issued_at=now_value,
          superseded_at=null,
          updated_at=now_value
      where id=existing_job_doc.id
      returning * into job_doc;
    end if;
  else
    insert into public.laurem_staff_documents(
      staff_id, category, title, description, mime_type, content_text, document_sha256,
      source_type, source_key, status, requires_signature, signature_status,
      issuer_name, issuer_title, employer_name, issued_by_actor, issued_at
    ) values (
      p_staff_id,
      'job_description',
      p_job_title || ' Job Description',
      'Role-specific employment job description issued as part of the CONAGS employment document package.',
      'text/plain',
      p_job_description,
      p_job_description_sha256,
      'job_description',
      job_source_key,
      'issued',
      true,
      'pending',
      'Dezou Maurice',
      'Manager',
      'Conags Care Ltd',
      coalesce(nullif(btrim(p_actor),''),'CONAGS platform'),
      now_value
    )
    returning * into job_doc;

    insert into public.laurem_staff_document_events(
      document_id, staff_id, event_type, actor_type, actor, metadata
    ) values (
      job_doc.id,
      p_staff_id,
      'created',
      'admin',
      coalesce(nullif(btrim(p_actor),''),'CONAGS platform'),
      jsonb_build_object(
        'source_type','job_description',
        'document_sha256',job_doc.document_sha256,
        'package_issued_at',now_value
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'contract_document', contract_result->'document',
    'job_description_document', to_jsonb(job_doc)
  );
end;
$$;

revoke all on function public.laurem_issue_staff_employment_document_package(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.laurem_issue_staff_employment_document_package(uuid,uuid,text,text,text,text) to service_role;
