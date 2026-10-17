create table if not exists staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('annual','sick','family','unpaid','other')),
  start_date date not null,
  end_date date not null,
  total_days numeric(6,2),
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists staff_leave_requests_staff_dates_idx on staff_leave_requests(staff_id, start_date desc);
create index if not exists staff_leave_requests_status_idx on staff_leave_requests(status, start_date);

alter table staff_leave_requests enable row level security;
revoke all on staff_leave_requests from anon, authenticated;

create table if not exists payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  pay_date date,
  status text not null default 'open' check (status in ('open','processing','closed')),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_start, period_end),
  check (period_end >= period_start)
);

create table if not exists payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  approved_hours numeric(10,2) not null default 0,
  hourly_rate numeric(12,2),
  gross_amount numeric(14,2),
  status text not null default 'draft' check (status in ('draft','approved','paid','void')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_period_id, staff_id)
);
create index if not exists payroll_entries_period_idx on payroll_entries(payroll_period_id);
create index if not exists payroll_entries_staff_idx on payroll_entries(staff_id);

alter table payroll_periods enable row level security;
alter table payroll_entries enable row level security;
revoke all on payroll_periods, payroll_entries from anon, authenticated;
