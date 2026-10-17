-- Keep CONAGS workforce audit events inside the CONAGS physical namespace.
--
-- The application historically referenced the logical `workforce_audit_events`
-- table for assignment and leave audit entries. Because lib/db.ts only rewrites
-- names in its explicit CONAGS allowlist, that logical name previously passed
-- through to the shared schema. This migration gives CONAGS its own physical
-- audit table and preserves the existing application-facing logical name.

create table if not exists public.laurem_workforce_audit_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.laurem_staff_profiles(id) on delete set null,
  assignment_id uuid references public.laurem_staff_assignments(id) on delete set null,
  entity_type text,
  entity_id uuid,
  event_type text not null,
  actor text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists laurem_workforce_audit_events_staff_idx
  on public.laurem_workforce_audit_events(staff_id, created_at desc);
create index if not exists laurem_workforce_audit_events_assignment_idx
  on public.laurem_workforce_audit_events(assignment_id, created_at desc);
create index if not exists laurem_workforce_audit_events_entity_idx
  on public.laurem_workforce_audit_events(entity_type, entity_id, created_at desc);
create index if not exists laurem_workforce_audit_events_type_idx
  on public.laurem_workforce_audit_events(event_type, created_at desc);

alter table public.laurem_workforce_audit_events enable row level security;
revoke all on public.laurem_workforce_audit_events from anon, authenticated;
