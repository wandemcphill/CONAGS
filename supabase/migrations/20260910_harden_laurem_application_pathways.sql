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
    else lower(btrim(coalesce(invite_row.role,'')))
  end;
  payload_role:=case lower(payload_role)
    when 'registered nurse - international recruitment' then 'registered nurse'
    when 'international registered nurse' then 'registered nurse'
    when 'healthcare worker' then 'healthcare assistant'
    when 'healthcare assistant - international' then 'healthcare assistant'
    else lower(payload_role)
  end;
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
    professional_experience,employment_history,employment_gaps,professional_references,living_in_uk,living_in_ireland,
    current_country,work_permission,requires_sponsorship,international_experience,relocation_readiness,supporting_documents,
    consent,interview_responses,application_data,submitted_at,status,updated_at
  ) values(
    invite_row.id,trim(p_payload->>'full_name'),trim(coalesce(p_payload->>'preferred_name','')),lower(trim(p_payload->>'email')),trim(coalesce(p_payload->>'phone','')),
    nullif(p_payload->>'date_of_birth','')::date,trim(coalesce(p_payload->>'nationality','')),trim(coalesce(p_payload->>'country_of_residence','')),trim(coalesce(p_payload->>'address','')),
    case payload_role when 'healthcare assistant' then 'Healthcare Assistant' when 'support worker' then 'Support Worker' when 'senior support worker' then 'Senior Support Worker' when 'registered nurse' then 'Registered Nurse' when 'physiotherapist' then 'Physiotherapist' end,
    p_payload->>'employment_type',coalesce(p_payload->'availability','{}'::jsonb),nullif(p_payload->>'start_date','')::date,p_payload->>'driving_licence',p_payload->>'vehicle_access',p_payload->>'care_experience',p_payload->>'qualifications',coalesce(p_payload->'training','{}'::jsonb),
    p_payload->>'professional_experience',coalesce(p_payload->'employment_history','[]'::jsonb),coalesce(p_payload->'employment_gaps','[]'::jsonb),coalesce(p_payload->'references','[]'::jsonb),
    case when payload_pathway='uk' then 'Yes' else 'No' end,p_payload->>'living_in_ireland',trim(coalesce(p_payload->>'current_country',p_payload->>'country_of_residence','')),p_payload->>'work_permission',p_payload->>'requires_sponsorship',p_payload->>'international_experience',p_payload->>'relocation_readiness',coalesce(p_payload->'supporting_documents','[]'::jsonb),
    true,coalesce(p_payload->'interview_responses','{}'::jsonb),coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('pathway',payload_pathway,'living_in_uk',case when payload_pathway='uk' then 'Yes' else 'No' end),
    now(),'Application',now()
  ) returning * into application_row;

  update public.laurem_recruitment_invites set used_at=now() where id=invite_row.id and used_at is null;
  return application_row;
end;
$$;

revoke all on function public.laurem_create_recruitment_application(text,jsonb) from public,anon,authenticated;
grant execute on function public.laurem_create_recruitment_application(text,jsonb) to service_role;
