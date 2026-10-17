create table if not exists staff_onboarding_packages (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references staff_profiles(id) on delete cascade,
  audience text not null check (audience in ('sponsored_hca','international_nurse','standard_staff')),
  title text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','complete')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists staff_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references staff_onboarding_packages(id) on delete cascade,
  task_key text not null,
  category text not null,
  title text not null,
  description text,
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','completed','waived')),
  document_path text,
  acknowledgement_required boolean not null default true,
  acknowledged_at timestamptz,
  acknowledged_by text,
  completed_at timestamptz,
  completed_by text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(package_id, task_key)
);

create index if not exists staff_onboarding_tasks_package_idx on staff_onboarding_tasks(package_id, sort_order);
create index if not exists staff_onboarding_tasks_status_idx on staff_onboarding_tasks(status);

alter table staff_onboarding_packages enable row level security;
alter table staff_onboarding_tasks enable row level security;
revoke all on staff_onboarding_packages, staff_onboarding_tasks from anon, authenticated;
