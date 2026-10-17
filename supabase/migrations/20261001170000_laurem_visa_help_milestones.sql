-- Structured Visa Help milestone tracking.
create table if not exists public.laurem_staff_visa_help_milestones (
  id uuid primary key default gen_random_uuid(),
  visa_help_case_id uuid not null references public.laurem_staff_visa_help_cases(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  milestone_type text not null check (milestone_type in ('assessment','support_review','documents','cos','application','identity','decision','post_decision')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','skipped')),
  due_at timestamptz,
  completed_at timestamptz,
  completed_by text,
  notes text check (notes is null or char_length(notes) <= 5000),
  metadata jsonb not null default '{}'::jsonb,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visa_help_case_id, milestone_type)
);

create index if not exists laurem_staff_visa_help_milestones_case_idx
  on public.laurem_staff_visa_help_milestones(visa_help_case_id, position, status, due_at);

create index if not exists laurem_staff_visa_help_milestones_staff_idx
  on public.laurem_staff_visa_help_milestones(staff_id, status, due_at);

alter table public.laurem_staff_visa_help_milestones enable row level security;
revoke all on public.laurem_staff_visa_help_milestones from anon, authenticated;
