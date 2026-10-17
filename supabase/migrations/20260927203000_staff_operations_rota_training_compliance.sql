-- CONAGS staff rota, training and DBS/PVG compliance requests.
create extension if not exists pgcrypto;
create sequence if not exists public.laurem_staff_compliance_invoice_seq;

create table if not exists public.laurem_staff_rota_requests (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
 effective_from date not null,
 stable_shift_preference boolean not null default true,
 regions text[] not null default '{}'::text[],
 shift_preferences text[] not null default '{}'::text[],
 care_settings text[] not null default '{}'::text[],
 driver_available boolean not null default false,
 notes text,
 status text not null default 'requested' check (status in ('requested','under_review','approved','declined','superseded')),
 reviewed_by text, reviewed_at timestamptz, review_note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(staff_id,effective_from)
);
create index if not exists laurem_staff_rota_requests_staff_idx on public.laurem_staff_rota_requests(staff_id,effective_from desc);
create index if not exists laurem_staff_rota_requests_status_idx on public.laurem_staff_rota_requests(status,effective_from);

create table if not exists public.laurem_staff_training_assignments (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
 training_type text not null default 'Mandatory one-week induction training',
 mandatory boolean not null default true,
 status text not null default 'due' check (status in ('due','scheduled','in_progress','completed','waived','cancelled')),
 week_start date, week_end date, location text, notes text,
 assigned_by text, assigned_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists laurem_staff_training_staff_idx on public.laurem_staff_training_assignments(staff_id,created_at desc);
create index if not exists laurem_staff_training_status_idx on public.laurem_staff_training_assignments(status,week_start);

create table if not exists public.laurem_staff_compliance_cases (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
 compliance_type text not null check (compliance_type in ('dbs','pvg')),
 status text not null default 'requested' check (status in ('requested','invoice_issued','paid','submitted','completed','declined','cancelled')),
 check_level text, amount_pence integer not null default 0 check(amount_pence>=0),
 official_fee_pence integer not null default 0 check(official_fee_pence>=0),
 currency text not null default 'GBP' check(currency='GBP'),
 invoice_number text not null unique, issue_date date not null default current_date, due_date date,
 billed_name text not null, billed_email text not null, payment_reference text, payment_method text, paid_at timestamptz,
 details jsonb not null default '{}'::jsonb, requested_at timestamptz not null default now(), completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists laurem_staff_compliance_staff_idx on public.laurem_staff_compliance_cases(staff_id,compliance_type,requested_at desc);
create index if not exists laurem_staff_compliance_status_idx on public.laurem_staff_compliance_cases(status,requested_at desc);
create unique index if not exists laurem_staff_compliance_open_staff_type_idx on public.laurem_staff_compliance_cases(staff_id,compliance_type) where status not in ('completed','declined','cancelled');

alter table public.laurem_staff_rota_requests enable row level security;
alter table public.laurem_staff_training_assignments enable row level security;
alter table public.laurem_staff_compliance_cases enable row level security;
revoke all on public.laurem_staff_rota_requests,public.laurem_staff_training_assignments,public.laurem_staff_compliance_cases from anon,authenticated;

create or replace function public.laurem_request_staff_compliance(p_staff_id uuid,p_compliance_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_staff public.laurem_staff_profiles%rowtype; v_case public.laurem_staff_compliance_cases%rowtype;
 v_amount integer; v_invoice text; v_description text; v_fee_note text; v_due date; v_now timestamptz:=clock_timestamp();
begin
 if p_compliance_type not in ('dbs','pvg') then raise exception 'INVALID_COMPLIANCE_TYPE'; end if;
 select * into v_staff from public.laurem_staff_profiles where id=p_staff_id for update;
 if not found then raise exception 'STAFF_NOT_FOUND'; end if;
 if v_staff.employment_status not in ('pending','active') then raise exception 'STAFF_NOT_ELIGIBLE'; end if;
 select * into v_case from public.laurem_staff_compliance_cases where staff_id=p_staff_id and compliance_type=p_compliance_type and status not in ('completed','declined','cancelled') order by requested_at desc limit 1 for update;
 if found then
   return jsonb_build_object('ok',true,'already_exists',true,'case',to_jsonb(v_case),'invoice',jsonb_build_object('invoice_number',v_case.invoice_number,'status',v_case.status,'amount_pence',v_case.amount_pence,'currency',v_case.currency,'issue_date',v_case.issue_date,'due_date',v_case.due_date,'description',v_case.details->>'description','official_fee_note',v_case.details->>'official_fee_note'));
 end if;
 if p_compliance_type='dbs' then
   if current_date>=date '2026-10-05' then v_amount:=4100;v_fee_note:='Official Enhanced DBS fee in force from 5 October 2026.'; else v_amount:=4950;v_fee_note:='Official Enhanced DBS fee in force before 5 October 2026; the official fee reduces to £41.00 from 5 October 2026.'; end if;
   v_description:='Enhanced DBS application through CONAGS Care';v_due:=current_date;
 else
   if current_date>=date '2026-08-01' and current_date<date '2027-08-01' then v_amount:=0;v_fee_note:='Official PVG application fee waived for eligible social-care workers in Scotland through 31 July 2027. Eligibility is confirmed by CONAGS.'; else v_amount:=5900;v_fee_note:='Official PVG application fee, subject to current Disclosure Scotland rules and eligibility.'; end if;
   v_description:='PVG application through CONAGS Care';v_due:=case when v_amount>0 then current_date else null end;
 end if;
 v_invoice:='CONAGS-'||upper(p_compliance_type)||'-'||to_char(v_now,'YYYYMMDD')||'-'||lpad(nextval('public.laurem_staff_compliance_invoice_seq')::text,6,'0');
 insert into public.laurem_staff_compliance_cases(staff_id,compliance_type,status,check_level,amount_pence,official_fee_pence,invoice_number,issue_date,due_date,billed_name,billed_email,details,requested_at,created_at,updated_at)
 values(p_staff_id,p_compliance_type,'invoice_issued',case when p_compliance_type='dbs' then 'enhanced' else 'pvg' end,v_amount,v_amount,v_invoice,current_date,v_due,v_staff.full_name,v_staff.email,jsonb_build_object('description',v_description,'official_fee_note',v_fee_note,'amount_is_official_fee_only',true,'admin_or_third_party_fee_included',false),v_now,v_now,v_now)
 returning * into v_case;
 return jsonb_build_object('ok',true,'already_exists',false,'case',to_jsonb(v_case),'invoice',jsonb_build_object('invoice_number',v_case.invoice_number,'status',v_case.status,'amount_pence',v_case.amount_pence,'currency',v_case.currency,'issue_date',v_case.issue_date,'due_date',v_case.due_date,'description',v_description,'official_fee_note',v_fee_note));
exception when unique_violation then
 select * into v_case from public.laurem_staff_compliance_cases where staff_id=p_staff_id and compliance_type=p_compliance_type and status not in ('completed','declined','cancelled') order by requested_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'already_exists',true,'case',to_jsonb(v_case),'invoice',jsonb_build_object('invoice_number',v_case.invoice_number,'status',v_case.status,'amount_pence',v_case.amount_pence,'currency',v_case.currency,'issue_date',v_case.issue_date,'due_date',v_case.due_date,'description',v_case.details->>'description','official_fee_note',v_case.details->>'official_fee_note')); end if;
 raise;
end; $$;
revoke all on function public.laurem_request_staff_compliance(uuid,text) from public,anon,authenticated;
grant execute on function public.laurem_request_staff_compliance(uuid,text) to service_role;
