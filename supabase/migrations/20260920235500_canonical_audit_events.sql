create table if not exists public.laurem_audit_events (
  id uuid primary key default gen_random_uuid(),
  lifecycle_area text not null,
  entity_type text,
  entity_id uuid,
  application_id uuid,
  staff_id uuid,
  actor_type text not null default 'unknown',
  actor text not null,
  action text not null,
  previous_state text,
  new_state text,
  reason text,
  source_table text,
  source_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint laurem_audit_events_source_unique unique (source_table, source_event_id)
);

create index if not exists laurem_audit_events_application_time_idx
  on public.laurem_audit_events (application_id, occurred_at desc);

create index if not exists laurem_audit_events_staff_time_idx
  on public.laurem_audit_events (staff_id, occurred_at desc);

create index if not exists laurem_audit_events_area_time_idx
  on public.laurem_audit_events (lifecycle_area, occurred_at desc);

create index if not exists laurem_audit_events_entity_time_idx
  on public.laurem_audit_events (entity_type, entity_id, occurred_at desc);

create index if not exists laurem_audit_events_time_idx
  on public.laurem_audit_events (occurred_at desc);

alter table public.laurem_audit_events enable row level security;
revoke all on table public.laurem_audit_events from public, anon, authenticated;

create or replace function public.laurem_record_audit_event(
  p_lifecycle_area text,
  p_entity_type text,
  p_entity_id uuid,
  p_application_id uuid,
  p_staff_id uuid,
  p_actor_type text,
  p_actor text,
  p_action text,
  p_previous_state text,
  p_new_state text,
  p_reason text,
  p_source_table text,
  p_source_event_id uuid,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_id uuid;
begin
  if nullif(trim(p_lifecycle_area), '') is null then
    raise exception 'AUDIT_LIFECYCLE_AREA_REQUIRED';
  end if;

  if nullif(trim(p_actor), '') is null then
    raise exception 'AUDIT_ACTOR_REQUIRED';
  end if;

  if nullif(trim(p_action), '') is null then
    raise exception 'AUDIT_ACTION_REQUIRED';
  end if;

  insert into public.laurem_audit_events (
    lifecycle_area,
    entity_type,
    entity_id,
    application_id,
    staff_id,
    actor_type,
    actor,
    action,
    previous_state,
    new_state,
    reason,
    source_table,
    source_event_id,
    metadata,
    occurred_at
  )
  values (
    trim(p_lifecycle_area),
    nullif(trim(p_entity_type), ''),
    p_entity_id,
    p_application_id,
    p_staff_id,
    coalesce(nullif(trim(p_actor_type), ''), 'unknown'),
    trim(p_actor),
    trim(p_action),
    nullif(trim(p_previous_state), ''),
    nullif(trim(p_new_state), ''),
    nullif(left(trim(coalesce(p_reason, '')), 2000), ''),
    nullif(trim(p_source_table), ''),
    p_source_event_id,
    coalesce(p_metadata, '{}'::jsonb),
    clock_timestamp()
  )
  on conflict (source_table, source_event_id)
  do update set
    lifecycle_area = excluded.lifecycle_area,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    application_id = excluded.application_id,
    staff_id = excluded.staff_id,
    actor_type = excluded.actor_type,
    actor = excluded.actor,
    action = excluded.action,
    previous_state = excluded.previous_state,
    new_state = excluded.new_state,
    reason = excluded.reason,
    metadata = excluded.metadata,
    occurred_at = excluded.occurred_at
  returning id into audit_id;

  return audit_id;
end;
$$;

revoke all on function public.laurem_record_audit_event(
  text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,uuid,jsonb
) from public, anon, authenticated;

insert into public.laurem_audit_events (
  lifecycle_area, entity_type, entity_id, application_id, actor_type, actor, action,
  previous_state, new_state, reason, source_table, source_event_id, metadata, occurred_at
)
select
  'recruitment',
  'application',
  h.application_id,
  case when exists (select 1 from public.laurem_recruitment_applications x where x.id=h.application_id) then h.application_id else null end,
  'admin',
  h.changed_by,
  'application.status_changed',
  h.from_status,
  h.to_status,
  h.note,
  'laurem_recruitment_status_history',
  h.id,
  '{}'::jsonb,
  h.created_at
from public.laurem_recruitment_status_history h
on conflict (source_table, source_event_id) do nothing;

insert into public.laurem_audit_events (
  lifecycle_area, entity_type, entity_id, application_id, actor_type, actor, action,
  previous_state, new_state, reason, source_table, source_event_id, metadata, occurred_at
)
select
  'recruitment',
  'application',
  a.application_id,
  case when exists (select 1 from public.laurem_recruitment_applications x where x.id=a.application_id) then a.application_id else null end,
  'admin',
  a.actor,
  'admin.' || a.action_type,
  a.from_status,
  a.to_status,
  a.reason,
  'laurem_recruitment_admin_actions',
  a.id,
  jsonb_build_object('outcome', a.outcome),
  a.created_at
from public.laurem_recruitment_admin_actions a
on conflict (source_table, source_event_id) do nothing;

insert into public.laurem_audit_events (
  lifecycle_area, entity_type, entity_id, application_id, actor_type, actor, action,
  previous_state, new_state, reason, source_table, source_event_id, metadata, occurred_at
)
select
  'recruitment',
  case when l.application_id is not null then 'application' else 'invite' end,
  coalesce(l.application_id, l.invite_id),
  case when exists (select 1 from public.laurem_recruitment_applications x where x.id=l.application_id) then l.application_id else null end,
  'admin',
  l.actor,
  l.event_type,
  coalesce(l.metadata->>'from_status', l.metadata->>'previous_status'),
  coalesce(l.metadata->>'to_status', l.metadata->>'new_status'),
  l.metadata->>'reason',
  'recruitment_audit_log',
  l.id,
  '{}'::jsonb,
  coalesce(l.created_at, now())
from public.recruitment_audit_log l
on conflict (source_table, source_event_id) do nothing;

insert into public.laurem_audit_events (
  lifecycle_area, entity_type, entity_id, application_id, actor_type, actor, action,
  previous_state, new_state, reason, source_table, source_event_id, metadata, occurred_at
)
select
  'evidence',
  'evidence_review',
  e.evidence_review_id,
  case when exists (select 1 from public.laurem_recruitment_applications x where x.id=e.application_id) then e.application_id else null end,
  'admin',
  e.actor,
  'evidence.' || e.action,
  e.previous_status,
  e.new_status,
  e.note,
  'laurem_recruitment_evidence_audit',
  e.id,
  '{}'::jsonb,
  e.created_at
from public.laurem_recruitment_evidence_audit e
on conflict (source_table, source_event_id) do nothing;

insert into public.laurem_audit_events (
  lifecycle_area, entity_type, entity_id, staff_id, application_id, actor_type, actor, action,
  previous_state, new_state, reason, source_table, source_event_id, metadata, occurred_at
)
select
  case
    when w.entity_type = 'timesheet' or w.event_type like 'timesheet.%' or w.event_type like 'attendance.%' then 'workforce'
    when w.entity_type = 'leave_request' or w.event_type like 'leave.%' then 'workforce'
    when w.entity_type = 'payroll_period' or w.event_type like 'payroll.%' then 'payroll'
    else 'workforce'
  end,
  coalesce(w.entity_type, 'workforce'),
  coalesce(w.entity_id, w.assignment_id),
  w.staff_id,
  s.application_id,
  case when w.actor is null or w.actor in ('system','System') then 'system' else 'admin_or_staff' end,
  coalesce(w.actor, 'system'),
  w.event_type,
  coalesce(w.details->>'from', w.details->>'previousStatus'),
  coalesce(w.details->>'to', w.details->>'status'),
  coalesce(w.details->>'reason', w.details->>'note'),
  'laurem_workforce_audit_events',
  w.id,
  '{}'::jsonb,
  w.created_at
from public.laurem_workforce_audit_events w
left join public.laurem_staff_profiles s on s.id = w.staff_id
on conflict (source_table, source_event_id) do nothing;

insert into public.laurem_audit_events (
  lifecycle_area, entity_type, entity_id, staff_id, application_id, actor_type, actor, action,
  reason, source_table, source_event_id, metadata, occurred_at
)
select
  'workforce',
  'staff',
  l.staff_id,
  l.staff_id,
  case when exists (select 1 from public.laurem_recruitment_applications x where x.id=s.application_id) then s.application_id else null end,
  'admin_or_staff',
  l.actor,
  l.action,
  l.metadata->>'reason',
  'recruitment_staff_audit_log',
  l.id,
  '{}'::jsonb,
  l.created_at
from public.recruitment_staff_audit_log l
left join public.laurem_staff_profiles s on s.id = l.staff_id
on conflict (source_table, source_event_id) do nothing;