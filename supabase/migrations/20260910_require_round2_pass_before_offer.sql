create or replace function public.laurem_transition_application_status(p_application_id uuid, p_to_status text, p_actor text, p_note text default null, p_override boolean default false, p_override_reason text default null)
returns public.laurem_recruitment_applications
language plpgsql security definer set search_path to public as $$
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
    or (app_row.status='Documents' and p_to_status in('Sponsorship','Offer','Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Sponsorship' and p_to_status in('Offer','Rejected','Withdrawn'))
    or (app_row.status='Offer' and p_to_status in('Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Onboarding' and p_to_status in('Hired','Rejected','Withdrawn'));
  if not allowed then blocked_reason:=format('Transition from %s to %s is not permitted.',app_row.status,p_to_status); end if;
  if p_to_status='Second Interview' and not p_override then
    select exists(select 1 from public.laurem_interview_attempts a where a.application_id=app_row.id and a.round=1 and a.status='passed') into round_one_passed;
    if not round_one_passed then blocked_reason:=coalesce(blocked_reason||' ','')||'Round 1 must be passed before Second Interview.'; end if;
  end if;
  if p_to_status='Offer' and not p_override then
    select exists(select 1 from public.laurem_interview_attempts a where a.application_id=app_row.id and a.round=2 and a.status='passed') into round_two_passed;
    if not round_two_passed then blocked_reason:=coalesce(blocked_reason||' ','')||'Round 2 must be passed before Offer.'; end if;
  end if;
  if p_to_status='Onboarding' and not p_override then
    select not exists(select 1 from public.laurem_recruitment_onboarding_checklist c where c.application_id=app_row.id and c.required and c.status not in('completed','waived')) into readiness_ready;
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
revoke all on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) to service_role;
