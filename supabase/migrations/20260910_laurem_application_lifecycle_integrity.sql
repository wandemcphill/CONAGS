-- CONAGS recruitment lifecycle integrity fix.
--
-- Completed applications enter the recruiter workflow at Application, not the
-- legacy Submitted value. Second interviews require a completed first
-- interview and atomically advance the candidate to Second Interview.
-- All objects and data changes are scoped to the CONAGS namespace.

update public.laurem_recruitment_applications
   set status = 'Application',
       updated_at = now()
 where status = 'Submitted';

alter table public.laurem_recruitment_applications
  alter column status set default 'Application';

create or replace function public.laurem_create_recruitment_application(
  p_token_hash text,
  p_payload jsonb
)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.laurem_recruitment_invites;
  application_row public.laurem_recruitment_applications;
  payload_consent boolean;
  payload_role text;
  payload_living_in_uk text;
  payload_pathway text;
begin
  select * into invite_row
    from public.laurem_recruitment_invites
   where token_hash = p_token_hash
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_FOUND';
  end if;

  if invite_row.used_at is not null then
    raise exception using errcode = 'P0001', message = 'INVITATION_USED';
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'INVITATION_EXPIRED';
  end if;

  payload_role := nullif(btrim(coalesce(p_payload->>'role_applied', '')), '');
  if payload_role is null then
    raise exception using errcode = 'P0001', message = 'ROLE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(invite_row.role, '')), '') is not null
     and lower(btrim(invite_row.role)) <> lower(payload_role) then
    raise exception using errcode = 'P0001', message = 'INVITATION_ROLE_MISMATCH';
  end if;

  payload_pathway := lower(btrim(coalesce(p_payload->>'pathway', '')));
  if payload_pathway not in ('uk', 'international') then
    raise exception using errcode = 'P0001', message = 'PATHWAY_REQUIRED';
  end if;

  payload_living_in_uk := case when payload_pathway = 'uk' then 'yes' else 'no' end;

  if lower(payload_role) in ('senior support worker', 'care worker', 'healthcare assistant')
     and payload_living_in_uk <> 'yes' then
    raise exception using errcode = 'P0001', message = 'CARE_ROLE_IN_COUNTRY_ONLY';
  end if;

  payload_consent := lower(coalesce(p_payload->>'consent', 'false')) = 'true';
  if not payload_consent then
    raise exception using errcode = 'P0001', message = 'CONSENT_REQUIRED';
  end if;

  insert into public.laurem_recruitment_applications (
    invite_id, full_name, preferred_name, email, phone, date_of_birth,
    nationality, country_of_residence, address, role_applied, employment_type,
    availability, start_date, driving_licence, vehicle_access, care_experience,
    qualifications, training, professional_experience, employment_history,
    employment_gaps, professional_references, living_in_uk, current_country,
    work_permission, requires_sponsorship, international_experience,
    relocation_readiness, supporting_documents, consent, interview_responses,
    application_data, submitted_at, status, updated_at
  ) values (
    invite_row.id,
    p_payload->>'full_name', p_payload->>'preferred_name', p_payload->>'email', p_payload->>'phone',
    nullif(p_payload->>'date_of_birth', '')::date, p_payload->>'nationality',
    p_payload->>'country_of_residence', p_payload->>'address', payload_role,
    p_payload->>'employment_type', coalesce(p_payload->'availability', '{}'::jsonb),
    nullif(p_payload->>'start_date', '')::date, p_payload->>'driving_licence', p_payload->>'vehicle_access',
    p_payload->>'care_experience', p_payload->>'qualifications', coalesce(p_payload->'training', '{}'::jsonb),
    p_payload->>'professional_experience', coalesce(p_payload->'employment_history', '[]'::jsonb),
    coalesce(p_payload->'employment_gaps', '[]'::jsonb), coalesce(p_payload->'references', '[]'::jsonb),
    case when payload_pathway = 'uk' then 'Yes' else 'No' end,
    p_payload->>'current_country', p_payload->>'work_permission', p_payload->>'requires_sponsorship',
    p_payload->>'international_experience', p_payload->>'relocation_readiness',
    coalesce(p_payload->'supporting_documents', '[]'::jsonb), true,
    coalesce(p_payload->'interview_responses', '{}'::jsonb), p_payload, now(), 'Application', now()
  ) returning * into application_row;

  update public.laurem_recruitment_invites
     set used_at = now()
   where id = invite_row.id and used_at is null;

  return application_row;
end;
$$;

revoke all on function public.laurem_create_recruitment_application(text, jsonb) from public, anon, authenticated;
grant execute on function public.laurem_create_recruitment_application(text, jsonb) to service_role;

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
  active_staff boolean := false;
  first_interview_complete boolean := false;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='P0001',message='ADMIN_ACTOR_REQUIRED';
  end if;

  select * into app_row
    from public.laurem_recruitment_applications
   where id=p_application_id
   for update;

  if not found then
    raise exception using errcode='P0001',message='APPLICATION_NOT_FOUND';
  end if;

  if p_to_status is null or p_to_status not in('Enquiry','Invited','Application','Screening','Interview','Second Interview','Documents','Sponsorship','Offer','Onboarding','Hired','Rejected','Withdrawn') then
    raise exception using errcode='P0001',message='INVALID_RECRUITMENT_STATUS';
  end if;

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

  if not allowed then
    blocked_reason := format('Transition from %s to %s is not permitted.',app_row.status,p_to_status);
  end if;

  if p_to_status='Second Interview' and not p_override then
    select exists(
      select 1
        from public.laurem_recruitment_interviews i
       where i.application_id = app_row.id
         and i.status = 'Completed'
         and i.cancelled_at is null
    ) into first_interview_complete;
    if not first_interview_complete then
      blocked_reason := coalesce(blocked_reason||' ','')||'A completed first interview is required before Second Interview.';
    end if;
  end if;

  if p_to_status='Onboarding' and not p_override then
    select not exists(
      select 1 from public.laurem_recruitment_onboarding_checklist c
       where c.application_id=app_row.id and c.required and c.status not in('completed','waived')
    ) into readiness_ready;
    if not readiness_ready then
      blocked_reason:=coalesce(blocked_reason||' ','')||'Onboarding readiness is incomplete.';
    end if;

    select exists(
      select 1 from public.laurem_recruitment_contracts c
       where c.application_id=app_row.id and c.status='accepted' and c.accepted_at is not null
         and lower(coalesce(c.job_title,''))=lower(coalesce(app_row.role_applied,''))
    ) into accepted_contract;
    if not accepted_contract then
      blocked_reason:=coalesce(blocked_reason||' ','')||'An accepted contract matching the applied role is required.';
    end if;
  end if;

  if p_to_status='Hired' and not p_override then
    select exists(
      select 1 from public.laurem_staff_profiles s
       where s.application_id=app_row.id and s.employment_status='active'
    ) into active_staff;
    if not active_staff then
      blocked_reason:=coalesce(blocked_reason||' ','')||'An active staff profile is required before Hired.';
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

  update public.laurem_recruitment_applications
     set status=p_to_status,updated_at=now()
   where id=p_application_id
   returning * into result_row;

  insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note)
  values(p_application_id,app_row.status,p_to_status,p_actor,coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')));

  insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
  values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,case when p_override then 'overridden' else 'allowed' end,
    coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')),jsonb_build_object('override',p_override,'blocked_reason',blocked_reason));

  return result_row;
end;
$$;

revoke all on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) to service_role;

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
  previous_status text;
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

  previous_status := app_row.status;

  update public.laurem_recruitment_applications
     set status = 'Second Interview', updated_at = now()
   where id = p_application_id;

  insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note)
  values(p_application_id,previous_status,'Second Interview',p_sent_by,'Second interview invitation created after completed first interview.');

  insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
  values(p_application_id,p_sent_by,'status_transition',previous_status,'Second Interview','allowed','Second interview invitation created.',jsonb_build_object('source','second_interview_invitation'));

  id := v_id;
  return next;
end;
$$;

revoke all on function public.laurem_create_second_interview_invitation(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.laurem_create_second_interview_invitation(uuid,text,text,timestamptz) to service_role;
