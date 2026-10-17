create table if not exists workforce_audit_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_profiles(id) on delete set null,
  assignment_id uuid references staff_assignments(id) on delete set null,
  event_type text not null,
  actor text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workforce_audit_events_staff_idx on workforce_audit_events(staff_id, created_at desc);
create index if not exists workforce_audit_events_assignment_idx on workforce_audit_events(assignment_id, created_at desc);

alter table workforce_audit_events enable row level security;
revoke all on workforce_audit_events from anon, authenticated;
