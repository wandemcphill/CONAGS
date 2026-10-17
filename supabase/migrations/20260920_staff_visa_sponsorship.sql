-- CONAGS UK visa sponsorship support: staff request, case management, £2,000 service invoice and CoS document lifecycle.
create extension if not exists pgcrypto;

create sequence if not exists public.laurem_staff_visa_invoice_seq;

create table if not exists public.laurem_staff_visa_cases (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  pathway text not null check (pathway in ('visa_switch','international_sponsorship')),
  pathway_basis text not null,
  status text not null default 'requested' check (status in (
    'requested',
    'admin_review',
    'awaiting_payment',
    'preparing_sms',
    'submitted_to_sms',
    'cos_pending',
    'cos_assigned',
    'completed',
    'declined',
    'withdrawn'
  )),
  role_at_request text,
  job_title_at_request text,
  case_snapshot jsonb not null default '{}'::jsonb,
  additional_information jsonb not null default '{}'::jsonb,
  sms_reference text,
  cos_number text,
  cos_assigned_at timestamptz,
  submitted_to_sms_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  withdrawn_at timestamptz,
  admin_notes text,
  requested_at timestamptz not null default now(),
  admin_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laurem_staff_visa_cases_staff_idx
  on public.laurem_staff_visa_cases(staff_id, requested_at desc);
create index if not exists laurem_staff_visa_cases_application_idx
  on public.laurem_staff_visa_cases(application_id, requested_at desc);
create unique index if not exists laurem_staff_visa_cases_open_staff_idx
  on public.laurem_staff_visa_cases(staff_id)
  where status not in ('completed','declined','withdrawn');

create table if not exists public.laurem_staff_visa_invoices (
  id uuid primary key default gen_random_uuid(),
  visa_case_id uuid not null unique references public.laurem_staff_visa_cases(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  invoice_number text not null unique,
  status text not null default 'issued' check (status in ('draft','issued','paid','overdue','void','cancelled')),
  currency text not null default 'GBP' check (currency = 'GBP'),
  amount_pence integer not null default 200000 check (amount_pence > 0),
  description text not null default 'CONAGS visa sponsorship support and case administration',
  issue_date date not null default current_date,
  due_date date,
  billed_name text not null,
  billed_email text not null,
  payment_reference text,
  payment_method text,
  paid_at timestamptz,
  created_by text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laurem_staff_visa_invoices_staff_idx
  on public.laurem_staff_visa_invoices(staff_id, issue_date desc);

create table if not exists public.laurem_staff_visa_case_events (
  id uuid primary key default gen_random_uuid(),
  visa_case_id uuid not null references public.laurem_staff_visa_cases(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'requested',
    'admin_reviewed',
    'pathway_changed',
    'invoice_issued',
    'payment_recorded',
    'sms_prepared',
    'submitted_to_sms',
    'cos_assigned',
    'document_uploaded',
    'completed',
    'declined',
    'withdrawn'
  )),
  actor_type text not null check (actor_type in ('staff','admin','system')),
  actor text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists laurem_staff_visa_case_events_case_idx
  on public.laurem_staff_visa_case_events(visa_case_id, created_at desc);

alter table public.laurem_staff_visa_cases enable row level security;
alter table public.laurem_staff_visa_invoices enable row level security;
alter table public.laurem_staff_visa_case_events enable row level security;
revoke all on public.laurem_staff_visa_cases, public.laurem_staff_visa_invoices, public.laurem_staff_visa_case_events from anon, authenticated;

alter table public.laurem_staff_documents drop constraint if exists laurem_staff_documents_category_check;
alter table public.laurem_staff_documents
  add constraint laurem_staff_documents_category_check
  check (category in ('contract','job_description','offer_letter','policy','handbook','payslip','compliance','visa_sponsorship','other'));

create or replace function public.laurem_request_staff_visa_sponsorship(
  p_staff_id uuid,
  p_requested_pathway text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.laurem_staff_profiles%rowtype;
  v_application public.laurem_recruitment_applications%rowtype;
  v_case public.laurem_staff_visa_cases%rowtype;
  v_invoice public.laurem_staff_visa_invoices%rowtype;
  v_pathway text;
  v_basis text;
  v_is_uk boolean;
  v_now timestamptz := clock_timestamp();
  v_invoice_number text;
begin
  select * into v_staff
  from public.laurem_staff_profiles
  where id = p_staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.employment_status not in ('pending','active') then raise exception 'STAFF_NOT_ELIGIBLE'; end if;

  select * into v_application
  from public.laurem_recruitment_applications
  where id = v_staff.application_id
  for share;

  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  select * into v_case
  from public.laurem_staff_visa_cases
  where staff_id = p_staff_id
    and status not in ('completed','declined','withdrawn')
  order by requested_at desc
  limit 1
  for update;

  if found then
    select * into v_invoice
    from public.laurem_staff_visa_invoices
    where visa_case_id = v_case.id
    order by created_at desc
    limit 1;
    return jsonb_build_object(
      'ok', true,
      'already_exists', true,
      'case', to_jsonb(v_case),
      'invoice', to_jsonb(v_invoice)
    );
  end if;

  v_is_uk :=
    lower(coalesce(v_application.living_in_uk,'')) in ('yes','true','currently in the uk')
    or lower(coalesce(v_application.current_country,'')) ~ '(united kingdom|^uk$|england|scotland|wales|northern ireland)';

  if p_requested_pathway in ('visa_switch','international_sponsorship') then
    v_pathway := p_requested_pathway;
    v_basis := 'Staff-selected route at request time; final route remains subject to CONAGS administrative review and UK immigration eligibility.';
  elsif v_is_uk then
    v_pathway := 'visa_switch';
    v_basis := 'Existing recruitment record indicates the candidate is in the UK; CONAGS therefore opened a visa-switch support case for administrative review.';
  else
    v_pathway := 'international_sponsorship';
    v_basis := 'Existing recruitment record indicates the candidate is outside the UK; CONAGS therefore opened an international sponsorship support case for administrative review.';
  end if;

  insert into public.laurem_staff_visa_cases(
    staff_id,
    application_id,
    pathway,
    pathway_basis,
    status,
    role_at_request,
    job_title_at_request,
    case_snapshot,
    additional_information,
    requested_at,
    created_at,
    updated_at
  )
  values (
    p_staff_id,
    v_application.id,
    v_pathway,
    v_basis,
    'requested',
    v_application.role_applied,
    v_staff.job_title,
    jsonb_build_object(
      'application_id', v_application.id,
      'staff_id', p_staff_id,
      'full_name', v_application.full_name,
      'preferred_name', v_application.preferred_name,
      'email', v_application.email,
      'phone', v_application.phone,
      'date_of_birth', v_application.date_of_birth,
      'nationality', v_application.nationality,
      'country_of_residence', v_application.country_of_residence,
      'address', v_application.address,
      'role_applied', v_application.role_applied,
      'employment_type', v_application.employment_type,
      'start_date', v_application.start_date,
      'qualifications', v_application.qualifications,
      'training', v_application.training,
      'professional_experience', v_application.professional_experience,
      'employment_history', v_application.employment_history,
      'living_in_uk', v_application.living_in_uk,
      'current_country', v_application.current_country,
      'work_permission', v_application.work_permission,
      'requires_sponsorship', v_application.requires_sponsorship,
      'supporting_documents', v_application.supporting_documents,
      'application_data', v_application.application_data,
      'consent', v_application.consent
    ),
    '{}'::jsonb,
    v_now,
    v_now,
    v_now
  )
  returning * into v_case;

  v_invoice_number := 'CONAGS-VS-' || to_char(v_now, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.laurem_staff_visa_invoice_seq')::text, 6, '0');

  insert into public.laurem_staff_visa_invoices(
    visa_case_id,
    staff_id,
    invoice_number,
    status,
    currency,
    amount_pence,
    description,
    issue_date,
    due_date,
    billed_name,
    billed_email,
    created_by,
    notes,
    created_at,
    updated_at
  )
  values (
    v_case.id,
    p_staff_id,
    v_invoice_number,
    'issued',
    'GBP',
    200000,
    'CONAGS visa sponsorship support and case administration',
    current_date,
    null,
    coalesce(v_application.full_name, v_staff.full_name),
    coalesce(v_application.email, v_staff.email),
    'CONAGS platform',
    'Payment terms and payment instructions are pending final configuration by CONAGS management. This invoice is for CONAGS support/service and is not represented as a UK government fee.',
    v_now,
    v_now
  )
  returning * into v_invoice;

  insert into public.laurem_staff_visa_case_events(
    visa_case_id, staff_id, event_type, actor_type, actor, metadata, created_at
  )
  values
  (
    v_case.id, p_staff_id, 'requested', 'staff', v_staff.email,
    jsonb_build_object(
      'pathway', v_pathway,
      'pathway_basis', v_basis,
      'invoice_number', v_invoice.invoice_number,
      'invoice_amount_pence', v_invoice.amount_pence
    ),
    v_now
  ),
  (
    v_case.id, p_staff_id, 'invoice_issued', 'system', 'CONAGS platform',
    jsonb_build_object('invoice_number', v_invoice.invoice_number, 'amount_pence', v_invoice.amount_pence),
    v_now
  );

  return jsonb_build_object(
    'ok', true,
    'already_exists', false,
    'case', to_jsonb(v_case),
    'invoice', to_jsonb(v_invoice)
  );
exception
  when unique_violation then
    select * into v_case
    from public.laurem_staff_visa_cases
    where staff_id = p_staff_id
      and status not in ('completed','declined','withdrawn')
    order by requested_at desc
    limit 1;
    if found then
      select * into v_invoice
      from public.laurem_staff_visa_invoices
      where visa_case_id = v_case.id
      order by created_at desc
      limit 1;
      return jsonb_build_object('ok', true, 'already_exists', true, 'case', to_jsonb(v_case), 'invoice', to_jsonb(v_invoice));
    end if;
    raise;
end;
$$;

revoke all on function public.laurem_request_staff_visa_sponsorship(uuid,text) from public, anon, authenticated;
grant execute on function public.laurem_request_staff_visa_sponsorship(uuid,text) to service_role;
