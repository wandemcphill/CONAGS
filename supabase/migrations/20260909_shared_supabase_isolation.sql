create extension if not exists pgcrypto;

-- CONAGS and BIMED share the same Supabase project. Never repurpose the
-- existing public recruitment_* tables because BIMED still owns them.
-- This migration creates CONAGS-owned physical tables with a laurem_ prefix,
-- then copies the legacy CONAGS-era recruitment records into the isolated set.

create or replace function public.laurem_safe_jsonb(p_value text, p_fallback jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return coalesce(p_fallback, '{}'::jsonb);
  end if;
  return p_value::jsonb;
exception when others then
  return coalesce(p_fallback, '{}'::jsonb);
end;
$$;

create table if not exists public.laurem_recruitment_invites (
  id uuid primary key default gen_random_uuid(),
  candidate_name text,
  candidate_email text,
  role text,
  token_hash text not null unique,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.laurem_recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references public.laurem_recruitment_invites(id) on delete set null,
  full_name text not null,
  preferred_name text,
  email text not null,
  phone text,
  date_of_birth date,
  nationality text,
  country_of_residence text,
  address text,
  role_applied text,
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
  admin_notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_applications_status_idx on public.laurem_recruitment_applications(status);
create index if not exists laurem_recruitment_applications_email_idx on public.laurem_recruitment_applications(lower(email));
create index if not exists laurem_recruitment_applications_role_idx on public.laurem_recruitment_applications(role_applied);

create table if not exists public.laurem_recruitment_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
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
create index if not exists laurem_recruitment_interviews_application_idx on public.laurem_recruitment_interviews(application_id);

create table if not exists public.laurem_recruitment_second_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'sent' check (status in ('sent','completed')),
  answers jsonb,
  sent_by text not null,
  sent_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_second_interviews_application_idx on public.laurem_recruitment_second_interviews(application_id);

create table if not exists public.laurem_recruitment_nurse_interview_responses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.laurem_recruitment_invites(id) on delete cascade,
  application_id uuid references public.laurem_recruitment_applications(id) on delete cascade,
  pathway text not null check (pathway in ('uk','international')),
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(invite_id)
);
create unique index if not exists laurem_recruitment_nurse_interview_responses_application_idx
  on public.laurem_recruitment_nurse_interview_responses(application_id) where application_id is not null;

create table if not exists public.laurem_recruitment_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_status_history_application_idx
  on public.laurem_recruitment_status_history(application_id, created_at desc);

create table if not exists public.laurem_recruitment_document_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  document_type text not null,
  description text,
  required boolean not null default true,
  status text not null default 'requested' check (status in ('requested','uploaded','approved','rejected','waived')),
  requested_by text,
  requested_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  required_for_readiness boolean not null default false,
  readiness_item_key text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(application_id, document_type)
);
create index if not exists laurem_recruitment_document_requests_application_idx
  on public.laurem_recruitment_document_requests(application_id);

create table if not exists public.laurem_recruitment_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  document_request_id uuid references public.laurem_recruitment_document_requests(id) on delete set null,
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
  review_note text,
  superseded_at timestamptz,
  superseded_by uuid references public.laurem_recruitment_documents(id) on delete set null,
  checksum_sha256 text
);
create index if not exists laurem_recruitment_documents_application_idx
  on public.laurem_recruitment_documents(application_id, uploaded_at desc);

create table if not exists public.laurem_recruitment_contracts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.laurem_recruitment_applications(id) on delete cascade,
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
  contract_type text not null default 'standard' check (contract_type in ('standard','international_nurse')),
  annual_salary numeric,
  weekly_hours numeric,
  visa_route text,
  sponsorship_occupation_code text,
  nmc_status text,
  registration_deadline text,
  pre_registration_salary numeric,
  post_registration_salary numeric,
  relocation_support text,
  repayable_costs text,
  repayment_schedule text,
  contract_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_contracts_status_idx on public.laurem_recruitment_contracts(status);
create index if not exists laurem_recruitment_contracts_type_idx on public.laurem_recruitment_contracts(contract_type);

create table if not exists public.laurem_recruitment_contract_tokens (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.laurem_recruitment_contracts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_contract_tokens_contract_idx on public.laurem_recruitment_contract_tokens(contract_id);

create table if not exists public.laurem_recruitment_onboarding_checklist (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  item_key text not null,
  title text not null,
  description text not null,
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','completed','waived')),
  completed_at timestamptz,
  completed_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(application_id, item_key)
);
create index if not exists laurem_recruitment_onboarding_checklist_application_idx
  on public.laurem_recruitment_onboarding_checklist(application_id, created_at);

create table if not exists public.laurem_recruitment_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  evidence_type text not null,
  document_id uuid references public.laurem_recruitment_documents(id) on delete set null,
  status text not null check (status in ('pending','approved','rejected','waived','expired','superseded')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_evidence_reviews_application_idx
  on public.laurem_recruitment_evidence_reviews(application_id, evidence_type, created_at desc);
create unique index if not exists laurem_recruitment_evidence_reviews_active_type_idx
  on public.laurem_recruitment_evidence_reviews(application_id, evidence_type)
  where status in ('pending','approved','waived');

create table if not exists public.laurem_recruitment_evidence_audit (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  evidence_review_id uuid references public.laurem_recruitment_evidence_reviews(id) on delete set null,
  action text not null,
  actor text not null,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_evidence_audit_application_idx
  on public.laurem_recruitment_evidence_audit(application_id, created_at desc);

create table if not exists public.laurem_recruitment_admin_actions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.laurem_recruitment_applications(id) on delete cascade,
  actor text not null,
  action_type text not null,
  from_status text,
  to_status text,
  outcome text not null check (outcome in ('allowed','blocked','overridden')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists laurem_recruitment_admin_actions_application_idx
  on public.laurem_recruitment_admin_actions(application_id, created_at desc);

create table if not exists public.laurem_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references public.laurem_recruitment_applications(id) on delete set null,
  employee_number text unique not null,
  laurem_id text unique,
  portal_handle text unique,
  portal_address text unique,
  full_name text not null,
  email text not null,
  phone text,
  job_title text not null,
  employment_status text not null default 'pending' check (employment_status in ('pending','active','suspended','leaver')),
  start_date date,
  end_date date,
  location text,
  nmc_number text,
  right_to_work_verified boolean not null default false,
  dbs_verified boolean not null default false,
  contract_id uuid references public.laurem_recruitment_contracts(id) on delete set null,
  password_hash text,
  session_version integer not null default 1,
  activation_token_hash text,
  activation_expires_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  department_namespace text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists laurem_staff_profiles_status_idx on public.laurem_staff_profiles(employment_status);
create index if not exists laurem_staff_profiles_email_idx on public.laurem_staff_profiles(lower(email));

create sequence if not exists public.laurem_staff_number_seq start 1000;
create or replace function public.laurem_assign_staff_identity()
returns trigger language plpgsql as $$
begin
  if new.laurem_id is null or btrim(new.laurem_id) = '' then
    new.laurem_id := 'LAU-' || lpad(nextval('public.laurem_staff_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists laurem_staff_identity_trigger on public.laurem_staff_profiles;
create trigger laurem_staff_identity_trigger
before insert on public.laurem_staff_profiles
for each row execute function public.laurem_assign_staff_identity();

create table if not exists public.laurem_staff_availability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  effective_from date not null default current_date,
  full_time boolean not null default false,
  part_time boolean not null default false,
  days boolean not null default true,
  nights boolean not null default false,
  weekends boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.laurem_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
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
create index if not exists laurem_staff_assignments_staff_time_idx on public.laurem_staff_assignments(staff_id, scheduled_start);

create table if not exists public.laurem_staff_timesheets (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  assignment_id uuid references public.laurem_staff_assignments(id) on delete set null,
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
create index if not exists laurem_staff_timesheets_staff_date_idx on public.laurem_staff_timesheets(staff_id, work_date desc);

create table if not exists public.laurem_staff_onboarding_packages (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references public.laurem_staff_profiles(id) on delete cascade,
  audience text not null check (audience in ('sponsored_hca','international_nurse','standard_staff')),
  title text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','complete')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  access_token_hash text unique,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.laurem_staff_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.laurem_staff_onboarding_packages(id) on delete cascade,
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

create table if not exists public.laurem_staff_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists laurem_staff_portal_sessions_staff_idx on public.laurem_staff_portal_sessions(staff_id, created_at desc);

create table if not exists public.laurem_staff_portal_auth_limits (
  bucket_key text primary key,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.laurem_staff_security_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.laurem_staff_profiles(id) on delete set null,
  event_type text not null,
  actor text,
  ip_address inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.laurem_staff_internal_mailboxes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references public.laurem_staff_profiles(id) on delete cascade,
  handle text not null,
  namespace text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists laurem_staff_internal_mailbox_address_idx on public.laurem_staff_internal_mailboxes(lower(handle || '@' || namespace));

create table if not exists public.laurem_staff_message_conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text unique not null,
  created_by_staff_id uuid references public.laurem_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists public.laurem_staff_message_participants (
  conversation_id uuid not null references public.laurem_staff_message_conversations(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key(conversation_id, staff_id)
);

create table if not exists public.laurem_staff_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.laurem_staff_message_conversations(id) on delete cascade,
  sender_staff_id uuid references public.laurem_staff_profiles(id) on delete restrict,
  sender_admin_email text,
  body text not null check(length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check((sender_staff_id is not null) or (sender_admin_email is not null))
);
create index if not exists laurem_staff_messages_conversation_idx on public.laurem_staff_messages(conversation_id, created_at asc);

create table if not exists public.laurem_staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
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

create table if not exists public.laurem_payroll_periods (
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

create table if not exists public.laurem_payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.laurem_payroll_periods(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  approved_hours numeric(10,2) not null default 0,
  hourly_rate numeric(12,2),
  gross_amount numeric(14,2),
  status text not null default 'draft' check (status in ('draft','approved','paid','void')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_period_id, staff_id)
);

create table if not exists public.laurem_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_id uuid,
  channel text not null check (channel in ('email')),
  recipient_key text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sending','retrying','sent','failed','not_configured')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_id text,
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists laurem_notification_deliveries_entity_idx on public.laurem_notification_deliveries(event_type, entity_id, created_at desc);
create index if not exists laurem_notification_deliveries_status_idx on public.laurem_notification_deliveries(status, updated_at);

create or replace function public.laurem_create_recruitment_application(p_token_hash text, p_payload jsonb)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.laurem_recruitment_invites;
  application_row public.laurem_recruitment_applications;
begin
  select * into invite_row from public.laurem_recruitment_invites where token_hash = p_token_hash for update;
  if not found then raise exception using errcode='P0001', message='INVITATION_NOT_FOUND'; end if;
  if invite_row.used_at is not null then raise exception using errcode='P0001', message='INVITATION_USED'; end if;
  if invite_row.expires_at is not null and invite_row.expires_at <= now() then raise exception using errcode='P0001', message='INVITATION_EXPIRED'; end if;

  insert into public.laurem_recruitment_applications(
    invite_id, full_name, preferred_name, email, phone, date_of_birth, nationality, country_of_residence, address,
    role_applied, employment_type, availability, start_date, driving_licence, vehicle_access, care_experience,
    qualifications, training, professional_experience, employment_history, employment_gaps, professional_references,
    living_in_uk, current_country, work_permission, requires_sponsorship, international_experience, relocation_readiness,
    supporting_documents, consent, interview_responses, application_data, submitted_at, updated_at
  ) values (
    invite_row.id, p_payload->>'full_name', p_payload->>'preferred_name', p_payload->>'email', p_payload->>'phone',
    nullif(p_payload->>'date_of_birth','')::date, p_payload->>'nationality', p_payload->>'country_of_residence', p_payload->>'address',
    p_payload->>'role_applied', p_payload->>'employment_type', coalesce(p_payload->'availability','{}'::jsonb),
    nullif(p_payload->>'start_date','')::date, p_payload->>'driving_licence', p_payload->>'vehicle_access', p_payload->>'care_experience',
    p_payload->>'qualifications', coalesce(p_payload->'training','{}'::jsonb), p_payload->>'professional_experience',
    coalesce(p_payload->'employment_history','[]'::jsonb), coalesce(p_payload->'employment_gaps','[]'::jsonb), coalesce(p_payload->'references','[]'::jsonb),
    p_payload->>'living_in_uk', p_payload->>'current_country', p_payload->>'work_permission', p_payload->>'requires_sponsorship',
    p_payload->>'international_experience', p_payload->>'relocation_readiness', coalesce(p_payload->'supporting_documents','[]'::jsonb),
    true, coalesce(p_payload->'interview_responses','{}'::jsonb), p_payload, now(), now()
  ) returning * into application_row;

  update public.laurem_recruitment_invites set used_at = now() where id = invite_row.id and used_at is null;
  return application_row;
end;
$$;

create or replace function public.laurem_consume_recruitment_contract_token(
  p_token_hash text,
  p_action text,
  p_accepted_by_name text default null,
  p_decline_reason text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare token_row public.laurem_recruitment_contract_tokens; contract_row public.laurem_recruitment_contracts; now_ts timestamptz := now();
begin
  if p_action not in ('accept','decline') then return jsonb_build_object('ok',false,'code','INVALID_ACTION'); end if;
  select * into token_row from public.laurem_recruitment_contract_tokens where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('ok',false,'code','TOKEN_NOT_FOUND'); end if;
  if token_row.expires_at is not null and token_row.expires_at <= now_ts then return jsonb_build_object('ok',false,'code','TOKEN_EXPIRED'); end if;
  if token_row.used_at is not null then return jsonb_build_object('ok',false,'code','TOKEN_USED'); end if;
  select * into contract_row from public.laurem_recruitment_contracts where id = token_row.contract_id for update;
  if not found then return jsonb_build_object('ok',false,'code','CONTRACT_NOT_FOUND'); end if;
  if contract_row.status not in ('issued','viewed') then return jsonb_build_object('ok',false,'code','CONTRACT_UNAVAILABLE'); end if;
  if p_action = 'accept' then
    if nullif(trim(coalesce(p_accepted_by_name,'')), '') is null then return jsonb_build_object('ok',false,'code','NAME_REQUIRED'); end if;
    update public.laurem_recruitment_contracts set status='accepted', accepted_at=now_ts, accepted_by_name=trim(p_accepted_by_name), accepted_ip=p_ip::inet, acceptance_user_agent=p_user_agent, viewed_at=coalesce(contract_row.viewed_at,now_ts), updated_at=now_ts where id=contract_row.id;
  else
    update public.laurem_recruitment_contracts set status='declined', declined_at=now_ts, decline_reason=nullif(trim(coalesce(p_decline_reason,'')),''), viewed_at=coalesce(contract_row.viewed_at,now_ts), updated_at=now_ts where id=contract_row.id;
  end if;
  update public.laurem_recruitment_contract_tokens set used_at=now_ts where id=token_row.id and used_at is null;
  if not found then return jsonb_build_object('ok',false,'code','TOKEN_CONSUMPTION_RACE'); end if;
  return jsonb_build_object('ok',true,'status',case when p_action='accept' then 'accepted' else 'declined' end,'contract_id',contract_row.id,'token_id',token_row.id);
end;
$$;

create or replace function public.laurem_record_evidence_review(p_application_id uuid,p_evidence_type text,p_document_id uuid,p_status text,p_actor text,p_note text default null,p_metadata jsonb default '{}'::jsonb)
returns public.laurem_recruitment_evidence_reviews
language plpgsql security definer set search_path=public
as $$
declare current_row public.laurem_recruitment_evidence_reviews; result_row public.laurem_recruitment_evidence_reviews;
begin
  if p_status not in ('pending','approved','rejected','waived','expired','superseded') then raise exception using errcode='P0001', message='INVALID_EVIDENCE_STATUS'; end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='P0001', message='EVIDENCE_ACTOR_REQUIRED'; end if;
  select * into current_row from public.laurem_recruitment_evidence_reviews where application_id=p_application_id and evidence_type=p_evidence_type and status in ('pending','approved','waived') order by created_at desc limit 1 for update;
  if current_row.id is not null and current_row.status='approved' and p_status='approved' and current_row.document_id=p_document_id then return current_row; end if;
  if current_row.id is not null and p_status in ('approved','waived','pending') then
    update public.laurem_recruitment_evidence_reviews set status='superseded',updated_at=now() where id=current_row.id;
    insert into public.laurem_recruitment_evidence_audit(application_id,evidence_review_id,action,actor,previous_status,new_status,note) values(p_application_id,current_row.id,'superseded',p_actor,current_row.status,'superseded',p_note);
  end if;
  insert into public.laurem_recruitment_evidence_reviews(application_id,evidence_type,document_id,status,reviewed_by,reviewed_at,review_note,metadata) values(p_application_id,p_evidence_type,p_document_id,p_status,case when p_status in ('approved','rejected','waived') then p_actor else null end,case when p_status in ('approved','rejected','waived') then now() else null end,nullif(trim(coalesce(p_note,'')),''),coalesce(p_metadata,'{}'::jsonb)) returning * into result_row;
  insert into public.laurem_recruitment_evidence_audit(application_id,evidence_review_id,action,actor,previous_status,new_status,note) values(p_application_id,result_row.id,'status_changed',p_actor,current_row.status,p_status,p_note);
  return result_row;
end;
$$;

create or replace function public.laurem_transition_application_status(p_application_id uuid,p_to_status text,p_actor text,p_note text default null,p_override boolean default false,p_override_reason text default null)
returns public.laurem_recruitment_applications
language plpgsql security definer set search_path=public
as $$
declare app_row public.laurem_recruitment_applications; result_row public.laurem_recruitment_applications; allowed boolean := false; blocked_reason text := null; readiness_ready boolean := false; accepted_contract boolean := false; active_staff boolean := false;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED'; end if;
  select * into app_row from public.laurem_recruitment_applications where id=p_application_id for update;
  if not found then raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND'; end if;
  if p_to_status is null or p_to_status not in ('Enquiry','Invited','Application','Screening','Interview','Second Interview','Documents','Sponsorship','Offer','Onboarding','Hired','Rejected','Withdrawn') then raise exception using errcode='P0001', message='INVALID_RECRUITMENT_STATUS'; end if;
  allowed := (app_row.status=p_to_status) or (app_row.status='Enquiry' and p_to_status in ('Invited','Rejected','Withdrawn')) or (app_row.status='Invited' and p_to_status in ('Application','Rejected','Withdrawn')) or (app_row.status='Application' and p_to_status in ('Screening','Rejected','Withdrawn')) or (app_row.status='Screening' and p_to_status in ('Interview','Documents','Rejected','Withdrawn')) or (app_row.status='Interview' and p_to_status in ('Second Interview','Documents','Offer','Rejected','Withdrawn')) or (app_row.status='Second Interview' and p_to_status in ('Documents','Offer','Rejected','Withdrawn')) or (app_row.status='Documents' and p_to_status in ('Sponsorship','Offer','Onboarding','Rejected','Withdrawn')) or (app_row.status='Sponsorship' and p_to_status in ('Offer','Rejected','Withdrawn')) or (app_row.status='Offer' and p_to_status in ('Onboarding','Rejected','Withdrawn')) or (app_row.status='Onboarding' and p_to_status in ('Hired','Rejected','Withdrawn'));
  if not allowed then blocked_reason := format('Transition from %s to %s is not permitted.',app_row.status,p_to_status); end if;
  if p_to_status='Onboarding' and not p_override then
    select not exists(select 1 from public.laurem_recruitment_onboarding_checklist c where c.application_id=app_row.id and c.required and c.status not in ('completed','waived')) into readiness_ready;
    if not readiness_ready then blocked_reason := coalesce(blocked_reason||' ','')||'Onboarding readiness is incomplete.'; end if;
    select exists(select 1 from public.laurem_recruitment_contracts c where c.application_id=app_row.id and c.status='accepted' and c.accepted_at is not null and lower(coalesce(c.job_title,''))=lower(coalesce(app_row.role_applied,''))) into accepted_contract;
    if not accepted_contract then blocked_reason := coalesce(blocked_reason||' ','')||'An accepted contract matching the applied role is required.'; end if;
  end if;
  if p_to_status='Hired' and not p_override then
    select exists(select 1 from public.laurem_staff_profiles s where s.application_id=app_row.id and s.employment_status='active') into active_staff;
    if not active_staff then blocked_reason := coalesce(blocked_reason||' ','')||'An active staff profile is required before Hired.'; end if;
  end if;
  if blocked_reason is not null and not p_override then
    insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata) values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked',blocked_reason,jsonb_build_object('override_requested',false));
    raise exception using errcode='P0001', message='STATUS_TRANSITION_BLOCKED', detail=blocked_reason;
  end if;
  if p_override and nullif(trim(coalesce(p_override_reason,'')),'') is null then
    insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata) values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,'blocked','Override reason is required.',jsonb_build_object('override_requested',true));
    raise exception using errcode='P0001', message='OVERRIDE_REASON_REQUIRED';
  end if;
  update public.laurem_recruitment_applications set status=p_to_status,updated_at=now() where id=p_application_id returning * into result_row;
  insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note) values(p_application_id,app_row.status,p_to_status,p_actor,coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')));
  insert into public.laurem_recruitment_admin_actions(application_id,actor,action_type,from_status,to_status,outcome,reason,metadata) values(p_application_id,p_actor,'status_transition',app_row.status,p_to_status,case when p_override then 'overridden' else 'allowed' end,coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')),jsonb_build_object('override',p_override,'blocked_reason',blocked_reason));
  return result_row;
end;
$$;

create or replace function public.laurem_consume_staff_auth_attempt(p_bucket_key text,p_max_attempts integer default 10,p_window_seconds integer default 900,p_lock_seconds integer default 900)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare current_row public.laurem_staff_portal_auth_limits; now_value timestamptz:=now(); allowed boolean:=true; retry_after integer:=0;
begin
  if nullif(trim(coalesce(p_bucket_key,'')),'') is null then raise exception using message='AUTH_BUCKET_REQUIRED'; end if;
  select * into current_row from public.laurem_staff_portal_auth_limits where bucket_key=p_bucket_key for update;
  if not found then insert into public.laurem_staff_portal_auth_limits(bucket_key) values(p_bucket_key) returning * into current_row; end if;
  if current_row.locked_until is not null and current_row.locked_until>now_value then allowed:=false; retry_after:=greatest(1,ceil(extract(epoch from current_row.locked_until-now_value))::integer);
  elsif current_row.window_started_at + make_interval(secs=>p_window_seconds)<=now_value then update public.laurem_staff_portal_auth_limits set attempt_count=1,window_started_at=now_value,locked_until=null,updated_at=now_value where bucket_key=p_bucket_key;
  else update public.laurem_staff_portal_auth_limits set attempt_count=attempt_count+1,updated_at=now_value,locked_until=case when attempt_count+1>=p_max_attempts then now_value+make_interval(secs=>p_lock_seconds) else locked_until end where bucket_key=p_bucket_key returning * into current_row; if current_row.locked_until is not null and current_row.locked_until>now_value then allowed:=false; retry_after:=greatest(1,ceil(extract(epoch from current_row.locked_until-now_value))::integer); end if; end if;
  return jsonb_build_object('allowed',allowed,'retry_after',retry_after);
end;
$$;

create or replace function public.laurem_activate_staff_account(p_token_hash text,p_email text,p_password_hash text,p_ip inet default null,p_user_agent text default null)
returns public.laurem_staff_profiles language plpgsql security definer set search_path=public
as $$
declare staff_row public.laurem_staff_profiles; now_value timestamptz:=now();
begin
  select * into staff_row from public.laurem_staff_profiles where activation_token_hash=p_token_hash and lower(email)=lower(trim(p_email)) for update;
  if not found then raise exception using message='STAFF_ACTIVATION_INVALID'; end if;
  if staff_row.activation_expires_at is null or staff_row.activation_expires_at<=now_value then raise exception using message='STAFF_ACTIVATION_EXPIRED'; end if;
  if staff_row.activated_at is not null or staff_row.password_hash is not null then raise exception using message='STAFF_ACTIVATION_USED'; end if;
  update public.laurem_staff_profiles set password_hash=p_password_hash,activation_token_hash=null,activation_expires_at=null,activated_at=now_value,employment_status='active',session_version=coalesce(session_version,1)+1,updated_at=now_value where id=staff_row.id returning * into staff_row;
  insert into public.laurem_staff_security_events(staff_id,event_type,actor,ip_address,user_agent,details) values(staff_row.id,'staff.activation.completed',staff_row.email,p_ip,p_user_agent,'{}'::jsonb);
  return staff_row;
end;
$$;

create or replace function public.laurem_create_international_nurse_contract_template_meta()
returns jsonb language sql immutable
as $$
select jsonb_build_object('default_role','Registered Nurse','default_pathway','international','default_visa_route','Health and Care Worker visa / applicable sponsored work route','default_soc_family','2231-2237','default_weekly_hours',37.5);
$$;

revoke all on function public.laurem_safe_jsonb(text,jsonb) from public,anon,authenticated;
revoke all on function public.laurem_create_recruitment_application(text,jsonb) from public,anon,authenticated;
revoke all on function public.laurem_consume_recruitment_contract_token(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) from public,anon,authenticated;
revoke all on function public.laurem_consume_staff_auth_attempt(text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.laurem_activate_staff_account(text,text,text,inet,text) from public,anon,authenticated;
revoke all on function public.laurem_create_international_nurse_contract_template_meta() from public,anon,authenticated;
grant execute on function public.laurem_create_recruitment_application(text,jsonb) to service_role;
grant execute on function public.laurem_consume_recruitment_contract_token(text,text,text,text,text,text) to service_role;
grant execute on function public.laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.laurem_transition_application_status(uuid,text,text,text,boolean,text) to service_role;
grant execute on function public.laurem_consume_staff_auth_attempt(text,integer,integer,integer) to service_role;
grant execute on function public.laurem_activate_staff_account(text,text,text,inet,text) to service_role;
grant execute on function public.laurem_create_international_nurse_contract_template_meta() to service_role;

-- Copy legacy recruitment data into the isolated CONAGS tables. The original
-- shared tables remain untouched for BIMED compatibility.
insert into public.laurem_recruitment_invites(id,candidate_name,candidate_email,role,token_hash,expires_at,used_at,created_at)
select id,candidate_name,candidate_email,role,token_hash,expires_at,used_at,created_at from public.recruitment_invites
on conflict (id) do nothing;

insert into public.laurem_recruitment_applications(
  id,invite_id,full_name,preferred_name,email,phone,date_of_birth,nationality,country_of_residence,address,
  role_applied,employment_type,availability,start_date,driving_licence,vehicle_access,care_experience,qualifications,
  training,professional_experience,employment_history,employment_gaps,professional_references,living_in_uk,current_country,
  work_permission,requires_sponsorship,international_experience,relocation_readiness,supporting_documents,consent,status,
  interview_responses,application_data,admin_notes,submitted_at,created_at,updated_at
)
select
  a.id,a.invite_id,a.full_name,a.preferred_name,a.email,a.phone,a.date_of_birth,a.nationality,a.country_of_residence,a.address,
  a.role_applied,a.employment_type,
  public.laurem_safe_jsonb(a.availability::text,'{}'::jsonb),a.start_date,a.driving_licence,a.vehicle_access,a.care_experience,a.qualifications,
  public.laurem_safe_jsonb(a.training::text,'{}'::jsonb),a.professional_experience,
  public.laurem_safe_jsonb(a.employment_history::text,'[]'::jsonb),public.laurem_safe_jsonb(a.employment_gaps::text,'[]'::jsonb),
  public.laurem_safe_jsonb(a.professional_references::text,'[]'::jsonb),
  case when lower(coalesce(a.living_in_ireland,''))='yes' then 'Yes' when lower(coalesce(a.living_in_ireland,''))='no' then 'No' else null end,
  a.current_country,a.work_permission,a.requires_employment_permit,a.international_experience,a.relocation_readiness,
  coalesce(a.supporting_documents,'[]'::jsonb),coalesce(a.consent,false),coalesce(a.status,'Submitted'),
  coalesce(a.interview_responses,'{}'::jsonb),jsonb_build_object('legacy_shared_application',to_jsonb(a)),a.admin_notes,a.submitted_at,coalesce(a.submitted_at,now()),a.updated_at
from public.recruitment_applications a
on conflict (id) do nothing;

insert into public.laurem_recruitment_interviews(id,application_id,scheduled_at,duration_minutes,location,meeting_link,interviewer,candidate_instructions,status,reschedule_count,cancelled_at,cancellation_reason,created_at,updated_at)
select id,application_id,scheduled_at,duration_minutes,location,meeting_link,interviewer,candidate_instructions,status,reschedule_count,cancelled_at,cancellation_reason,created_at,updated_at
from public.recruitment_interviews
where exists(select 1 from public.laurem_recruitment_applications a where a.id=recruitment_interviews.application_id)
on conflict (id) do nothing;

insert into public.laurem_recruitment_second_interviews(id,application_id,token_hash,status,answers,sent_by,sent_at,completed_at,expires_at,created_at)
select id,application_id,token_hash,status,answers,sent_by,sent_at,completed_at,expires_at,created_at
from public.recruitment_second_interviews
where exists(select 1 from public.laurem_recruitment_applications a where a.id=recruitment_second_interviews.application_id)
on conflict (id) do nothing;

insert into public.laurem_recruitment_onboarding_checklist(id,application_id,item_key,title,description,required,status,completed_at,completed_by,notes,created_at,updated_at)
select id,application_id,item_key,title,description,required,status,completed_at,completed_by,notes,created_at,updated_at
from public.recruitment_onboarding_checklist
where exists(select 1 from public.laurem_recruitment_applications a where a.id=recruitment_onboarding_checklist.application_id)
on conflict (id) do nothing;

-- Backfill only unambiguously portable legacy contract signatures into an
-- archival CONAGS table. No shared contract table is modified.
create table if not exists public.laurem_legacy_contract_signatures (like public.recruitment_contract_signatures including all);
insert into public.laurem_legacy_contract_signatures select * from public.recruitment_contract_signatures on conflict do nothing;

-- Private CONAGS documents live in a dedicated bucket. BIMED's storage remains untouched.
insert into storage.buckets(id,name,public)
values ('laurem-private-documents','laurem-private-documents',false)
on conflict(id) do update set public=false;

-- API clients use the server-side service role only. Explicitly deny direct
-- client access to the new CONAGS tables.
revoke all on
  public.laurem_recruitment_invites,
  public.laurem_recruitment_applications,
  public.laurem_recruitment_interviews,
  public.laurem_recruitment_second_interviews,
  public.laurem_recruitment_nurse_interview_responses,
  public.laurem_recruitment_status_history,
  public.laurem_recruitment_document_requests,
  public.laurem_recruitment_documents,
  public.laurem_recruitment_contracts,
  public.laurem_recruitment_contract_tokens,
  public.laurem_recruitment_onboarding_checklist,
  public.laurem_recruitment_evidence_reviews,
  public.laurem_recruitment_evidence_audit,
  public.laurem_recruitment_admin_actions,
  public.laurem_staff_profiles,
  public.laurem_staff_availability,
  public.laurem_staff_assignments,
  public.laurem_staff_timesheets,
  public.laurem_staff_onboarding_packages,
  public.laurem_staff_onboarding_tasks,
  public.laurem_staff_portal_sessions,
  public.laurem_staff_portal_auth_limits,
  public.laurem_staff_security_events,
  public.laurem_staff_internal_mailboxes,
  public.laurem_staff_message_conversations,
  public.laurem_staff_message_participants,
  public.laurem_staff_messages,
  public.laurem_staff_leave_requests,
  public.laurem_payroll_periods,
  public.laurem_payroll_entries,
  public.laurem_notification_deliveries
from anon, authenticated;

alter table public.laurem_recruitment_invites enable row level security;
alter table public.laurem_recruitment_applications enable row level security;
alter table public.laurem_recruitment_interviews enable row level security;
alter table public.laurem_recruitment_second_interviews enable row level security;
alter table public.laurem_recruitment_nurse_interview_responses enable row level security;
alter table public.laurem_recruitment_status_history enable row level security;
alter table public.laurem_recruitment_document_requests enable row level security;
alter table public.laurem_recruitment_documents enable row level security;
alter table public.laurem_recruitment_contracts enable row level security;
alter table public.laurem_recruitment_contract_tokens enable row level security;
alter table public.laurem_recruitment_onboarding_checklist enable row level security;
alter table public.laurem_recruitment_evidence_reviews enable row level security;
alter table public.laurem_recruitment_evidence_audit enable row level security;
alter table public.laurem_recruitment_admin_actions enable row level security;
alter table public.laurem_staff_profiles enable row level security;
alter table public.laurem_staff_availability enable row level security;
alter table public.laurem_staff_assignments enable row level security;
alter table public.laurem_staff_timesheets enable row level security;
alter table public.laurem_staff_onboarding_packages enable row level security;
alter table public.laurem_staff_onboarding_tasks enable row level security;
alter table public.laurem_staff_portal_sessions enable row level security;
alter table public.laurem_staff_portal_auth_limits enable row level security;
alter table public.laurem_staff_security_events enable row level security;
alter table public.laurem_staff_internal_mailboxes enable row level security;
alter table public.laurem_staff_message_conversations enable row level security;
alter table public.laurem_staff_message_participants enable row level security;
alter table public.laurem_staff_messages enable row level security;
alter table public.laurem_staff_leave_requests enable row level security;
alter table public.laurem_payroll_periods enable row level security;
alter table public.laurem_payroll_entries enable row level security;
alter table public.laurem_notification_deliveries enable row level security;
