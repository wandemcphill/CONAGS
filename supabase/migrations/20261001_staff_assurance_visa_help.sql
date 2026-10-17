create extension if not exists pgcrypto;

create table if not exists public.laurem_staff_visa_help_cases (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  status text not null default 'draft' check (status in (
    'draft',
    'triaged',
    'awaiting_staff',
    'legal_review',
    'awaiting_documents',
    'ready_for_submission',
    'submitted',
    'closed'
  )),
  current_visa_type text,
  current_visa_start_date date,
  current_visa_end_date date,
  living_in_uk boolean,
  target_role text,
  target_work_location text,
  selected_route text,
  recommendation jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  dependants jsonb not null default '[]'::jsonb,
  document_checklist jsonb not null default '[]'::jsonb,
  legal_team_requested boolean not null default false,
  self_complete_selected boolean not null default false,
  consent_to_legal_support boolean not null default false,
  assigned_to text,
  staff_message text,
  legal_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laurem_staff_visa_help_cases_staff_idx
  on public.laurem_staff_visa_help_cases(staff_id, created_at desc);

create unique index if not exists laurem_staff_visa_help_open_staff_idx
  on public.laurem_staff_visa_help_cases(staff_id)
  where status not in ('closed','submitted');

create table if not exists public.laurem_staff_visa_help_events (
  id uuid primary key default gen_random_uuid(),
  visa_help_case_id uuid not null references public.laurem_staff_visa_help_cases(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('staff','admin','legal','system')),
  actor text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists laurem_staff_visa_help_events_case_idx
  on public.laurem_staff_visa_help_events(visa_help_case_id, created_at desc);

alter table public.laurem_staff_visa_help_cases enable row level security;
alter table public.laurem_staff_visa_help_events enable row level security;
revoke all on public.laurem_staff_visa_help_cases, public.laurem_staff_visa_help_events from anon, authenticated;

alter table public.laurem_staff_documents drop constraint if exists laurem_staff_documents_category_check;
alter table public.laurem_staff_documents
  add constraint laurem_staff_documents_category_check
  check (category in (
    'contract',
    'job_description',
    'offer_letter',
    'policy',
    'handbook',
    'payslip',
    'compliance',
    'visa_sponsorship',
    'visa_help',
    'other'
  ));
