-- Assignment-specific placement terms and final contract lifecycle.
create table if not exists public.laurem_staff_placement_terms (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references public.laurem_staff_profiles(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  training_location text,
  principal_work_location text not null,
  hourly_rate numeric(12,2) not null check (hourly_rate > 0),
  weekly_hours numeric(6,2) not null check (weekly_hours > 0),
  effective_from date not null,
  status text not null default 'draft' check (status in ('draft','issued')),
  contract_document_id uuid references public.laurem_staff_documents(id) on delete set null,
  issued_at timestamptz,
  issued_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (training_location is null or training_location in ('Birmingham','London','Glasgow','Manchester'))
);

create index if not exists laurem_staff_placement_terms_status_idx
  on public.laurem_staff_placement_terms(status,effective_from);

alter table public.laurem_staff_placement_terms enable row level security;
revoke all on public.laurem_staff_placement_terms from anon,authenticated;
grant all on public.laurem_staff_placement_terms to service_role;
