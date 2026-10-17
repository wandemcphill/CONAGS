create table if not exists public.laurem_operational_exceptions (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  area text not null,
  severity text not null check (severity in ('critical','high','medium','low')),
  code text not null,
  title text not null,
  detail text not null,
  application_id uuid references public.laurem_recruitment_applications(id) on delete set null,
  staff_id uuid references public.laurem_staff_profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  detected_at timestamptz not null default now(),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.laurem_operational_exception_events (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.laurem_operational_exceptions(id) on delete cascade,
  event_type text not null check (event_type in ('detected','acknowledged','resolved','dismissed','reopened','commented')),
  actor text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists laurem_operational_exceptions_status_area_idx
  on public.laurem_operational_exceptions (status, area, severity);

create index if not exists laurem_operational_exceptions_application_idx
  on public.laurem_operational_exceptions (application_id, status);

create index if not exists laurem_operational_exceptions_staff_idx
  on public.laurem_operational_exceptions (staff_id, status);

create index if not exists laurem_operational_exceptions_detected_idx
  on public.laurem_operational_exceptions (last_detected_at desc);

create index if not exists laurem_operational_exception_events_exception_idx
  on public.laurem_operational_exception_events (exception_id, created_at desc);

alter table public.laurem_operational_exceptions enable row level security;
alter table public.laurem_operational_exception_events enable row level security;

revoke all on table public.laurem_operational_exceptions from public, anon, authenticated;
revoke all on table public.laurem_operational_exception_events from public, anon, authenticated;