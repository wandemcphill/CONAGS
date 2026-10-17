create or replace function public.laurem_sync_recruitment_status_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.laurem_record_audit_event(
    'recruitment','application',new.application_id,new.application_id,null,'admin_or_recruiter',
    new.changed_by,'application.status_changed',new.from_status,new.to_status,new.note,
    'laurem_recruitment_status_history',new.id,'{}'::jsonb
  );
  return new;
end;
$$;

create or replace function public.laurem_sync_recruitment_admin_action_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.laurem_record_audit_event(
    'recruitment','application',new.application_id,new.application_id,null,'admin',
    new.actor,'admin.' || new.action_type,new.from_status,new.to_status,new.reason,
    'laurem_recruitment_admin_actions',new.id,jsonb_build_object('outcome',new.outcome)
  );
  return new;
end;
$$;

create or replace function public.laurem_sync_recruitment_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.laurem_record_audit_event(
    'recruitment',
    case when new.application_id is not null then 'application' else 'invite' end,
    coalesce(new.application_id,new.invite_id),
    new.application_id,
    null,
    'admin_or_recruiter',
    new.actor,
    new.event_type,
    coalesce(new.metadata->>'from_status',new.metadata->>'previous_status'),
    coalesce(new.metadata->>'to_status',new.metadata->>'new_status'),
    new.metadata->>'reason',
    'recruitment_audit_log',
    new.id,
    '{}'::jsonb
  );
  return new;
end;
$$;

create or replace function public.laurem_sync_evidence_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.laurem_record_audit_event(
    'evidence','evidence_review',new.evidence_review_id,new.application_id,null,'admin',
    new.actor,'evidence.' || new.action,new.previous_status,new.new_status,new.note,
    'laurem_recruitment_evidence_audit',new.id,'{}'::jsonb
  );
  return new;
end;
$$;

create or replace function public.laurem_sync_staff_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  app_id uuid;
begin
  select application_id into app_id from public.laurem_staff_profiles where id=new.staff_id;
  perform public.laurem_record_audit_event(
    'workforce','staff',new.staff_id,new.staff_id,app_id,'admin_or_staff',
    new.actor,new.action,null,null,new.metadata->>'reason',
    'recruitment_staff_audit_log',new.id,'{}'::jsonb
  );
  return new;
end;
$$;

create or replace function public.laurem_sync_workforce_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  app_id uuid;
  area text;
begin
  if new.staff_id is not null then
    select application_id into app_id from public.laurem_staff_profiles where id=new.staff_id;
  end if;

  area := case
    when coalesce(new.entity_type,'')='timesheet' or new.event_type like 'timesheet.%' or new.event_type like 'attendance.%' then 'workforce'
    when coalesce(new.entity_type,'')='leave_request' or new.event_type like 'leave.%' then 'workforce'
    when coalesce(new.entity_type,'')='payroll_period' or new.event_type like 'payroll.%' then 'payroll'
    else 'workforce'
  end;

  perform public.laurem_record_audit_event(
    area,
    coalesce(new.entity_type,'workforce'),
    coalesce(new.entity_id,new.assignment_id),
    app_id,
    new.staff_id,
    case when new.actor is null or new.actor in ('system','System') then 'system' else 'admin_or_staff' end,
    coalesce(new.actor,'system'),
    new.event_type,
    coalesce(new.details->>'from',new.details->>'previousStatus'),
    coalesce(new.details->>'to',new.details->>'status'),
    coalesce(new.details->>'reason',new.details->>'note'),
    'laurem_workforce_audit_events',
    new.id,
    '{}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists trg_laurem_status_to_canonical_audit on public.laurem_recruitment_status_history;
create trigger trg_laurem_status_to_canonical_audit
after insert on public.laurem_recruitment_status_history
for each row execute function public.laurem_sync_recruitment_status_audit();

drop trigger if exists trg_laurem_admin_action_to_canonical_audit on public.laurem_recruitment_admin_actions;
create trigger trg_laurem_admin_action_to_canonical_audit
after insert on public.laurem_recruitment_admin_actions
for each row execute function public.laurem_sync_recruitment_admin_action_audit();

drop trigger if exists trg_recruitment_audit_log_to_canonical_audit on public.recruitment_audit_log;
create trigger trg_recruitment_audit_log_to_canonical_audit
after insert on public.recruitment_audit_log
for each row execute function public.laurem_sync_recruitment_audit_log();

drop trigger if exists trg_evidence_audit_to_canonical_audit on public.laurem_recruitment_evidence_audit;
create trigger trg_evidence_audit_to_canonical_audit
after insert on public.laurem_recruitment_evidence_audit
for each row execute function public.laurem_sync_evidence_audit();

drop trigger if exists trg_staff_audit_to_canonical_audit on public.recruitment_staff_audit_log;
create trigger trg_staff_audit_to_canonical_audit
after insert on public.recruitment_staff_audit_log
for each row execute function public.laurem_sync_staff_audit_log();

drop trigger if exists trg_workforce_audit_to_canonical_audit on public.laurem_workforce_audit_events;
create trigger trg_workforce_audit_to_canonical_audit
after insert on public.laurem_workforce_audit_events
for each row execute function public.laurem_sync_workforce_audit();

revoke all on function public.laurem_sync_recruitment_status_audit() from public, anon, authenticated;
revoke all on function public.laurem_sync_recruitment_admin_action_audit() from public, anon, authenticated;
revoke all on function public.laurem_sync_recruitment_audit_log() from public, anon, authenticated;
revoke all on function public.laurem_sync_evidence_audit() from public, anon, authenticated;
revoke all on function public.laurem_sync_staff_audit_log() from public, anon, authenticated;
revoke all on function public.laurem_sync_workforce_audit() from public, anon, authenticated;