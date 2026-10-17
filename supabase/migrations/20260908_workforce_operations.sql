create extension if not exists pgcrypto;

create table if not exists recruitment_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists recruitment_status_history_application_idx on recruitment_status_history(application_id, created_at desc);

alter table recruitment_nurse_interview_responses add column if not exists application_id uuid references recruitment_applications(id) on delete cascade;
alter table recruitment_nurse_interview_responses add column if not exists submitted_at timestamptz;
create unique index if not exists recruitment_nurse_interview_responses_application_idx
  on recruitment_nurse_interview_responses(application_id) where application_id is not null;

create table if not exists recruitment_document_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  document_type text not null,
  description text,
  required boolean not null default true,
  status text not null default 'requested' check (status in ('requested','uploaded','approved','rejected','waived')),
  requested_by text,
  requested_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique(application_id, document_type)
);
create index if not exists recruitment_document_requests_application_idx on recruitment_document_requests(application_id);

create table if not exists recruitment_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  document_request_id uuid references recruitment_document_requests(id) on delete set null,
  document_type text not null,
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text
);
create index if not exists recruitment_documents_application_idx on recruitment_documents(application_id, uploaded_at desc);

create table if not exists recruitment_contracts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references recruitment_applications(id) on delete cascade,
  version integer not null default 1,
  job_title text not null,
  start_date date,
  contract_end_date date,
  minimum_weekly_hours numeric,
  hourly_rate numeric,
  work_locations jsonb not null default '[]'::jsonb,
  client_or_assignment_details text,
  notice_period_employee text,
  notice_period_employer text,
  holiday_entitlement text,
  pension_scheme text,
  contract_content text not null,
  status text not null default 'draft' check (status in ('draft','issued','viewed','accepted','declined','superseded')),
  issued_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_ip inet,
  acceptance_user_agent text,
  declined_at timestamptz,
  decline_reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recruitment_contracts_status_idx on recruitment_contracts(status);

create table if not exists recruitment_contract_tokens (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references recruitment_contracts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists recruitment_contract_tokens_contract_idx on recruitment_contract_tokens(contract_id);

create table if not exists staff_profiles (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references recruitment_applications(id) on delete set null,
  employee_number text unique not null,
  full_name text not null,
  email text not null,
  phone text,
  job_title text not null,
  employment_status text not null default 'active' check (employment_status in ('pending','active','suspended','leaver')),
  start_date date,
  end_date date,
  location text,
  nmc_number text,
  right_to_work_verified boolean not null default false,
  dbs_verified boolean not null default false,
  contract_id uuid references recruitment_contracts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_profiles_status_idx on staff_profiles(employment_status);
create index if not exists staff_profiles_email_idx on staff_profiles(lower(email));

create table if not exists staff_availability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  effective_from date not null default current_date,
  full_time boolean not null default false,
  part_time boolean not null default false,
  days boolean not null default true,
  nights boolean not null default false,
  weekends boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  client_name text,
  location text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index if not exists staff_assignments_staff_time_idx on staff_assignments(staff_id, scheduled_start);

create table if not exists staff_timesheets (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  assignment_id uuid references staff_assignments(id) on delete set null,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer not null default 0,
  total_hours numeric,
  status text not null default 'submitted' check (status in ('draft','submitted','approved','rejected','paid')),
  approved_by text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_timesheets_staff_date_idx on staff_timesheets(staff_id, work_date desc);

insert into storage.buckets (id, name, public)
values ('laurem-private-documents', 'laurem-private-documents', false)
on conflict (id) do update set public = false;

alter table recruitment_status_history enable row level security;
alter table recruitment_document_requests enable row level security;
alter table recruitment_documents enable row level security;
alter table recruitment_contracts enable row level security;
alter table recruitment_contract_tokens enable row level security;
alter table staff_profiles enable row level security;
alter table staff_availability enable row level security;
alter table staff_assignments enable row level security;
alter table staff_timesheets enable row level security;
revoke all on recruitment_status_history, recruitment_document_requests, recruitment_documents, recruitment_contracts, recruitment_contract_tokens, staff_profiles, staff_availability, staff_assignments, staff_timesheets from anon, authenticated;

create unique index if not exists staff_profiles_employee_number_idx on staff_profiles(employee_number);
