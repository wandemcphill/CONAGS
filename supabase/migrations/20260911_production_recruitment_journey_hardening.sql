-- Production journey hardening discovered by the disposable production test candidate.
-- 1) Keep application submission aligned with the live CONAGS schema.
-- 2) Make evidence approvals authoritative for onboarding readiness.
-- 3) Require Round 2 completion before Offer.
-- 4) Require Offer before Onboarding, preventing a Documents -> Onboarding bypass.

create or replace function public.laurem_create_recruitment_application(p_token_hash text, p_payload jsonb)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path to public
as $$
declare
  invite_row public.laurem_recruitment_invites;
  application_row public.laurem_recruitment_applications;
  payload_consent boolean;
  payload_role text;
  invite_role text;
  payload_pathway text;
begin
  select * into invite_row from public.laurem_recruitment_invites where token_hash=p_token_hash for update;
  if not found then raise exception using errcode='P0001',message='INVITATION_NOT_FOUND'; end if;
  if invite_row.used_at is not null then raise exception using errcode='P0001',message='INVITATION_USED'; end if;
  if invite_row.expires_at is not null and invite_row.expires_at<=now() then raise exception using errcode='P0001',message='INVITATION_EXPIRED'; end if;
  payload_role:=nullif(btrim(coalesce(p_payload->>'role_applied','')),'');
  if payload_role is null then raise exception using errcode='P0001',message='ROLE_REQUIRED'; end if;
  invite_role:=case lower(btrim(coalesce(invite_row.role,'')))
    when 'registered nurse - international recruitment' then 'registered nurse'
    when 'international registered nurse' then 'registered nurse'
    when 'healthcare worker' then 'healthcare assistant'
    when 'healthcare assistant - international' then 'healthcare assistant'
    else lower(btrim(coalesce(invite_row.role,''))) end;
  payload_role:=case lower(payload_role)
    when 'registered nurse - international recruitment' then 'registered nurse'
    when 'international registered nurse' then 'registered nurse'
    when 'healthcare worker' then 'healthcare assistant'
    when 'healthcare assistant - international' then 'healthcare assistant'
    else lower(payload_role) end;
  if invite_role<>payload_role then raise exception using errcode='P0001',message='INVITATION_ROLE_MISMATCH'; end if;
  if payload_role not in ('healthcare assistant','support worker','senior support worker','registered nurse','physiotherapist') then raise exception using errcode='P0001',message='ROLE_REQUIRED'; end if;
  payload_pathway:=lower(btrim(coalesce(p_payload->>'pathway','')));
  if payload_pathway not in ('uk','international') then raise exception using errcode='P0001',message='PATHWAY_REQUIRED'; end if;
  if payload_role in ('healthcare assistant','support worker','senior support worker','physiotherapist') and payload_pathway<>'uk' then raise exception using errcode='P0001',message='ROLE_PATHWAY_UNAVAILABLE'; end if;
  if payload_role='registered nurse' and payload_pathway='international' and (nullif(btrim(coalesce(p_payload->>'current_country','')), '') is null or nullif(btrim(coalesce(p_payload->>'relocation_readiness','')), '') is null) then raise exception using errcode='P0001',message='INTERNATIONAL_NURSE_DETAILS_REQUIRED'; end if;
  if payload_pathway='uk' and nullif(btrim(coalesce(p_payload->>'right_to_work_status','')), '') is null then raise exception using errcode='P0001',message='RIGHT_TO_WORK_STATUS_REQUIRED'; end if;
  payload_consent:=lower(coalesce(p_payload->>'consent','false'))='true';
  if not payload_consent then raise exception using errcode='P0001',message='CONSENT_REQUIRED'; end if;
  insert into public.laurem_recruitment_applications(
    invite_id,full_name,preferred_name,email,phone,date_of_birth,nationality,country_of_residence,address,role_applied,
    employment_type,availability,start_date,driving_licence,vehicle_access,care_experience,qualifications,training,
    professional_experience,employment_history,employment_gaps,professional_references,living_in_uk,
    current_country,work_permission,requires_sponsorship,international_experience,relocation_readiness,supporting_documents,
    consent,interview_responses,application_data,submitted_at,status,updated_at
  ) values(
    invite_row.id,trim(p_payload->>'full_name'),trim(coalesce(p_payload->>'preferred_name','')),lower(trim(p_payload->>'email')),trim(coalesce(p_payload->>'phone','')),
    nullif(p_payload->>'date_of_birth','')::date,trim(coalesce(p_payload->>'nationality','')),trim(coalesce(p_payload->>'country_of_residence','')),trim(coalesce(p_payload->>'address','')),
    case payload_role when 'healthcare assistant' then 'Healthcare Assistant' when 'support worker' then 'Support Worker' when 'senior support worker' then 'Senior Support Worker' when 'registered nurse' then 'Registered Nurse' when 'physiotherapist' then 'Physiotherapist' end,
    p_payload->>'employment_type',coalesce(p_payload->'availability','{}'::jsonb),nullif(p_payload->>'start_date','')::date,p_payload->>'driving_licence',p_payload->>'vehicle_access',p_payload->>'care_experience',p_payload->>'qualifications',coalesce(p_payload->'training','{}'::jsonb),
    p_payload->>'professional_experience',coalesce(p_payload->'employment_history','[]'::jsonb),coalesce(p_payload->'employment_gaps','[]'::jsonb),coalesce(p_payload->'references','[]'::jsonb),
    case when payload_pathway='uk' then 'Yes' else 'No' end,trim(coalesce(p_payload->>'current_country',p_payload->>'country_of_residence','')),p_payload->>'work_permission',p_payload->>'requires_sponsorship',p_payload->>'international_experience',p_payload->>'relocation_readiness',coalesce(p_payload->'supporting_documents','[]'::jsonb),
    true,coalesce(p_payload->'interview_responses','{}'::jsonb),coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('role_applied',case payload_role when 'healthcare assistant' then 'Healthcare Assistant' when 'support worker' then 'Support Worker' when 'senior support worker' then 'Senior Support Worker' when 'registered nurse' then 'Registered Nurse' when 'physiotherapist' then 'Physiotherapist' end,'pathway',payload_pathway,'living_in_uk',case when payload_pathway='uk' then 'Yes' else 'No' end),
    now(),'Application',now()
  ) returning * into application_row;
  update public.laurem_recruitment_invites set used_at=now() where id=invite_row.id and used_at is null;
  return application_row;
end;
$$;

create or replace function public.laurem_transition_application_status(p_application_id uuid,p_to_status text,p_actor text,p_note text default null,p_override boolean default false,p_override_reason text default null)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path=public
as $$
declare
  app_row public.laurem_recruitment_applications;
  result_row public.laurem_recruitment_applications;
  allowed boolean:=false;
  blocked_reason text:=null;
  readiness_ready boolean:=false;
  accepted_contract boolean:=false;
  active_staff boolean:=false;
  round_one_passed boolean:=false;
  round_two_passed boolean:=false;
  platform_contract_required boolean:=false;
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
    or (app_row.status='Documents' and p_to_status in('Sponsorship','Offer','Rejected','Withdrawn'))
    or (app_row.status='Sponsorship' and p_to_status in('Offer','Rejected','Withdrawn'))
    or (app_row.status='Offer' and p_to_status in('Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Onboarding' and p_to_status in('Hired','Rejected','Withdrawn'));
  if not allowed then blocked_reason:=format('Transition from %s to %s is not permitted.',app_row.status,p_to_status); end if;
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
    select exists(select 1 from public.laurem_staff_profiles s where s.application_id=app_row.id and s.employment_status='active') into active_staff;
    if not active_staff then blocked_reason:=coalesce(blocked_reason||' ','')||'An active staff profile is required before Hired.'; end if;
  end if;
  if blocked_reason is not null and not p_override then
    insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata) values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked',blocked_reason,jsonb_build_object('override_requested',false));
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