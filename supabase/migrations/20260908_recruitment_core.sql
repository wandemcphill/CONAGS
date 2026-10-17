create extension if not exists pgcrypto;

create table if not exists recruitment_invites (
  id uuid primary key default gen_random_uuid(),
  candidate_name text,
  candidate_email text,
  role text,
  token_hash text not null unique,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references recruitment_invites(id) on delete set null,
  full_name text not null,
  preferred_name text,
  email text not null,
  phone text,
  date_of_birth date,
  nationality text,
  country_of_residence text,
  address text,
  role_applied text not null,
  employment_type text,
  availability jsonb not null default '{}'::jsonb,
  start_date date,
  driving_licence text,
  vehicle_access text,
  care_experience text,
  qualifications text,
  training jsonb not null default '{}'::jsonb,
  professional_experience text,
  employment_history jsonb not null default '[]'::jsonb,
  employment_gaps jsonb not null default '[]'::jsonb,
  professional_references jsonb not null default '[]'::jsonb,
  living_in_uk text,
  current_country text,
  work_permission text,
  requires_sponsorship text,
  international_experience text,
  relocation_readiness text,
  supporting_documents jsonb not null default '[]'::jsonb,
  consent boolean not null default false,
  status text not null default 'Submitted',
  interview_responses jsonb not null default '{}'::jsonb,
  application_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recruitment_applications add column if not exists application_data jsonb not null default '{}'::jsonb;
create index if not exists recruitment_applications_status_idx on recruitment_applications(status);
create index if not exists recruitment_applications_email_idx on recruitment_applications(lower(email));
create index if not exists recruitment_applications_role_idx on recruitment_applications(role_applied);

create table if not exists recruitment_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer,
  location text,
  meeting_link text,
  interviewer text,
  candidate_instructions text,
  status text not null default 'Scheduled',
  reschedule_count integer not null default 0,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_second_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'sent' check (status in ('sent','completed')),
  answers jsonb,
  sent_by text not null,
  sent_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table recruitment_invites enable row level security;
alter table recruitment_applications enable row level security;
alter table recruitment_interviews enable row level security;
alter table recruitment_second_interviews enable row level security;
revoke all on recruitment_invites, recruitment_applications, recruitment_interviews, recruitment_second_interviews from anon, authenticated;

create or replace function create_recruitment_application(p_token_hash text, p_payload jsonb)
returns recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare invite_row recruitment_invites; application_row recruitment_applications;
begin
  select * into invite_row from recruitment_invites where token_hash = p_token_hash for update;
  if not found then raise exception using errcode='P0001', message='INVITATION_NOT_FOUND'; end if;
  if invite_row.used_at is not null then raise exception using errcode='P0001', message='INVITATION_USED'; end if;
  if invite_row.expires_at is not null and invite_row.expires_at <= now() then raise exception using errcode='P0001', message='INVITATION_EXPIRED'; end if;

  insert into recruitment_applications (
    invite_id, full_name, preferred_name, email, phone, date_of_birth, nationality, country_of_residence, address,
    role_applied, employment_type, availability, start_date, driving_licence, vehicle_access, care_experience,
    qualifications, training, professional_experience, employment_history, employment_gaps, professional_references,
    living_in_uk, current_country, work_permission, requires_sponsorship, international_experience, relocation_readiness,
    supporting_documents, consent, interview_responses, application_data, updated_at
  ) values (
    invite_row.id, p_payload->>'full_name', p_payload->>'preferred_name', p_payload->>'email', p_payload->>'phone',
    nullif(p_payload->>'date_of_birth','')::date, p_payload->>'nationality', p_payload->>'country_of_residence', p_payload->>'address',
    p_payload->>'role_applied', p_payload->>'employment_type', coalesce(p_payload->'availability','{}'::jsonb),
    nullif(p_payload->>'start_date','')::date, p_payload->>'driving_licence', p_payload->>'vehicle_access', p_payload->>'care_experience',
    p_payload->>'qualifications', coalesce(p_payload->'training','{}'::jsonb), p_payload->>'professional_experience',
    coalesce(p_payload->'employment_history','[]'::jsonb), coalesce(p_payload->'employment_gaps','[]'::jsonb), coalesce(p_payload->'references','[]'::jsonb),
    p_payload->>'living_in_uk', p_payload->>'current_country', p_payload->>'work_permission', p_payload->>'requires_sponsorship',
    p_payload->>'international_experience', p_payload->>'relocation_readiness', coalesce(p_payload->'supporting_documents','[]'::jsonb),
    true, coalesce(p_payload->'interview_responses','{}'::jsonb), p_payload, now()
  ) returning * into application_row;
  update recruitment_invites set used_at=now() where id=invite_row.id and used_at is null;
  return application_row;
end;
$$;

revoke all on function create_recruitment_application(text,jsonb) from public, anon, authenticated;
grant execute on function create_recruitment_application(text,jsonb) to service_role;
