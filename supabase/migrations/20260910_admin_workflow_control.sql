create extension if not exists pgcrypto;

create table if not exists recruitment_admin_actions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references recruitment_applications(id) on delete cascade,
  actor text not null,
  action_type text not null,
  from_status text,
  to_status text,
  outcome text not null check (outcome in ('allowed','blocked','overridden')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists recruitment_admin_actions_application_idx
  on recruitment_admin_actions(application_id, created_at desc);

alter table recruitment_admin_actions enable row level security;
revoke all on recruitment_admin_actions from anon, authenticated;

create or replace function laurem_transition_application_status(
  p_application_id uuid,
  p_to_status text,
  p_actor text,
  p_note text default null,
  p_override boolean default false,
  p_override_reason text default null
)
returns recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row recruitment_applications;
  allowed boolean := false;
  blocked_reason text := null;
  readiness_ready boolean := false;
  accepted_contract boolean := false;
  active_staff boolean := false;
  result_row recruitment_applications;
begin
  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  select * into app_row
  from recruitment_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND';
  end if;

  if p_to_status is null or p_to_status not in (
    'Enquiry','Invited','Application','Screening','Interview','Second Interview',
    'Documents','Sponsorship','Offer','Onboarding','Hired','Rejected','Withdrawn'
  ) then
    raise exception using errcode='P0001', message='INVALID_RECRUITMENT_STATUS';
  end if;

  allowed :=
    (app_row.status = 'Enquiry' and p_to_status in ('Invited','Rejected','Withdrawn')) or
    (app_row.status = 'Invited' and p_to_status in ('Application','Rejected','Withdrawn')) or
    (app_row.status = 'Application' and p_to_status in ('Screening','Rejected','Withdrawn')) or
    (app_row.status = 'Screening' and p_to_status in ('Interview','Documents','Rejected','Withdrawn')) or
    (app_row.status = 'Interview' and p_to_status in ('Second Interview','Documents','Offer','Rejected','Withdrawn')) or
    (app_row.status = 'Second Interview' and p_to_status in ('Documents','Offer','Rejected','Withdrawn')) or
    (app_row.status = 'Documents' and p_to_status in ('Sponsorship','Offer','Onboarding','Rejected','Withdrawn')) or
    (app_row.status = 'Sponsorship' and p_to_status in ('Offer','Rejected','Withdrawn')) or
    (app_row.status = 'Offer' and p_to_status in ('Onboarding','Rejected','Withdrawn')) or
    (app_row.status = 'Onboarding' and p_to_status in ('Hired','Rejected','Withdrawn')) or
    (app_row.status = p_to_status);

  if not allowed then
    blocked_reason := format('Transition from %s to %s is not permitted.', app_row.status, p_to_status);
  end if;

  if p_to_status = 'Onboarding' and not p_override then
    select exists(
      select 1 from recruitment_onboarding_checklist c
      where c.application_id = app_row.id
        and c.required
        and c.status not in ('completed','waived')
    ) = false into readiness_ready;
    if not readiness_ready then blocked_reason := 'Onboarding readiness is incomplete.'; end if;

    select exists(
      select 1 from recruitment_contracts c
      where c.application_id = app_row.id
        and c.status = 'accepted'
        and c.accepted_at is not null
        and lower(coalesce(c.job_title,'')) = lower(coalesce(app_row.role_applied,''))
    ) into accepted_contract;
    if not accepted_contract then blocked_reason := coalesce(blocked_reason || ' ', '') || 'An accepted contract matching the applied role is required.'; end if;
  end if;

  if p_to_status = 'Hired' and not p_override then
    select exists(
      select 1 from staff_profiles s
      where s.application_id = app_row.id
        and s.employment_status = 'active'
    ) into active_staff;
    if not active_staff then blocked_reason := coalesce(blocked_reason || ' ', '') || 'An active staff profile is required before Hired.'; end if;
  end if;

  if blocked_reason is not null and not p_override then
    insert into recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
    values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked',blocked_reason,jsonb_build_object('override_requested',false));
    raise exception using errcode='P0001', message='STATUS_TRANSITION_BLOCKED', detail=blocked_reason;
  end if;

  if p_override and nullif(trim(coalesce(p_override_reason,'')), '') is null then
    insert into recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
    values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked','Override reason is required.',jsonb_build_object('override_requested',true));
    raise exception using errcode='P0001', message='OVERRIDE_REASON_REQUIRED';
  end if;

  update recruitment_applications
  set status = p_to_status,
      updated_at = now()
  where id = p_application_id
  returning * into result_row;

  insert into recruitment_status_history(application_id,from_status,to_status,changed_by,note)
  values(
    p_application_id,
    app_row.status,
    p_to_status,
    p_actor,
    coalesce(nullif(trim(p_note),''), nullif(trim(p_override_reason),''))
  );

  insert into recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata)
  values(
    p_application_id,
    p_actor,
    'status_transition',
    app_row.status,
    p_to_status,
    case when p_override then 'overridden' else 'allowed' end,
    coalesce(nullif(trim(p_note),''), nullif(trim(p_override_reason),'')),
    jsonb_build_object('override',p_override,'blocked_reason',blocked_reason)
  );

  return result_row;
end;
$$;

revoke all on function laurem_transition_application_status(uuid,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function laurem_transition_application_status(uuid,text,text,text,boolean,text) to service_role;
