create table if not exists public.laurem_data_governance_policies (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  area text not null,
  title text not null,
  description text not null,
  owner_role text not null,
  retention_days integer,
  action text not null default 'review' check (action in ('review','hold','archive','delete')),
  requires_approval boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.laurem_data_governance_findings (
  id uuid primary key default gen_random_uuid(),
  finding_key text not null unique,
  finding_type text not null,
  severity text not null check (severity in ('critical','high','medium','low')),
  rule_key text references public.laurem_data_governance_policies(rule_key) on delete set null,
  subject_type text not null,
  subject_id uuid,
  application_id uuid,
  staff_id uuid,
  title text not null,
  detail text not null,
  status text not null default 'open' check (status in ('open','acknowledged','held','resolved')),
  detected_at timestamptz not null default now(),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.laurem_data_governance_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.laurem_data_governance_findings(id) on delete cascade,
  event_type text not null check (event_type in ('detected','acknowledged','held','resolved','reopened','commented')),
  actor text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.laurem_data_access_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('export','deletion_review')),
  subject_type text not null check (subject_type in ('application','staff')),
  application_id uuid,
  staff_id uuid,
  requested_by text not null,
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','on_hold','completed','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  completed_at timestamptz,
  resolution_note text,
  manifest jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists laurem_data_findings_status_severity_idx on public.laurem_data_governance_findings (status,severity,last_detected_at desc);
create index if not exists laurem_data_findings_subject_idx on public.laurem_data_governance_findings (subject_type,subject_id);
create index if not exists laurem_data_findings_application_idx on public.laurem_data_governance_findings (application_id,status);
create index if not exists laurem_data_findings_staff_idx on public.laurem_data_governance_findings (staff_id,status);
create index if not exists laurem_data_events_finding_idx on public.laurem_data_governance_events (finding_id,created_at desc);
create index if not exists laurem_data_requests_status_idx on public.laurem_data_access_requests (status,requested_at desc);
create index if not exists laurem_data_requests_subject_idx on public.laurem_data_access_requests (subject_type,requested_at desc);

alter table public.laurem_data_governance_policies enable row level security;
alter table public.laurem_data_governance_findings enable row level security;
alter table public.laurem_data_governance_events enable row level security;
alter table public.laurem_data_access_requests enable row level security;

revoke all on table public.laurem_data_governance_policies from public, anon, authenticated;
revoke all on table public.laurem_data_governance_findings from public, anon, authenticated;
revoke all on table public.laurem_data_governance_events from public, anon, authenticated;
revoke all on table public.laurem_data_access_requests from public, anon, authenticated;

insert into public.laurem_data_governance_policies (rule_key,area,title,description,owner_role,retention_days,action,requires_approval)
values
 ('unsuccessful_candidates','recruitment','Unsuccessful candidates','Candidate records that are no longer progressing must have an explicit retention decision before disposal. No default deletion window is assumed here.','Recruitment Operations',null,'review',true),
 ('recruitment_documents','recruitment','Recruitment documents','Candidate-uploaded recruitment evidence and superseded documents require an explicit retention owner and review decision.','Document Control',null,'review',true),
 ('superseded_staff_documents','workforce','Superseded staff documents','Superseded employment documents remain protected until an explicit approved retention decision is recorded.','Document Control',null,'review',true),
 ('inactive_staff','workforce','Inactive staff','Inactive staff records require a documented retention decision before any destructive action.','Workforce Operations',null,'review',true),
 ('staff_messages','workforce','Staff messages','Staff communications require an explicit retention owner; the governance scanner never deletes messages automatically.','Workforce Operations',null,'review',true)
on conflict (rule_key) do nothing;

create or replace function public.laurem_data_governance_scan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,application_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:recruitment_document:'||d.id,'orphan','critical','recruitment_documents','recruitment_document',d.id,d.application_id,null,
    'Recruitment document has no application record',
    'The document remains stored but its application reference cannot be resolved.',
    jsonb_build_object('storage_path',d.storage_path,'status',d.status),
    clock_timestamp(),clock_timestamp()
  from public.laurem_recruitment_documents d
  left join public.laurem_recruitment_applications a on a.id=d.application_id
  where a.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;
  get diagnostics inserted_count = row_count;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,application_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:staff_document:'||d.id,'orphan','critical','superseded_staff_documents','staff_document',d.id,null,d.staff_id,
    'Staff document has no staff record',
    'The document remains stored but its staff reference cannot be resolved.',
    jsonb_build_object('storage_path',d.storage_path,'status',d.status),
    clock_timestamp(),clock_timestamp()
  from public.laurem_staff_documents d
  left join public.laurem_staff_profiles s on s.id=d.staff_id
  where s.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,application_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:contract:'||c.id,'orphan','high','unsuccessful_candidates','contract',c.id,c.application_id,
    'Employment contract has no application record',
    'The contract cannot be tied to a current recruitment application.',
    jsonb_build_object('status',c.status,'version',c.version),
    clock_timestamp(),clock_timestamp()
  from public.laurem_recruitment_contracts c
  left join public.laurem_recruitment_applications a on a.id=c.application_id
  where a.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:onboarding:'||p.id,'orphan','high','inactive_staff','onboarding_package',p.id,p.staff_id,
    'Onboarding package has no staff record',
    'The onboarding package cannot be tied to a current staff profile.',
    jsonb_build_object('status',p.status),
    clock_timestamp(),clock_timestamp()
  from public.laurem_staff_onboarding_packages p
  left join public.laurem_staff_profiles s on s.id=p.staff_id
  where s.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:message_conversation:'||c.id,'orphan','medium','staff_messages','message_conversation',c.id,c.created_by_staff_id,
    'Message conversation has no participants',
    'A message conversation exists without a participant record and is not safely discoverable through the staff portal.',
    '{}'::jsonb,
    clock_timestamp(),clock_timestamp()
  from public.laurem_staff_message_conversations c
  left join public.laurem_staff_message_participants p on p.conversation_id=c.id
  where p.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:message:'||m.id,'orphan','medium','staff_messages','message',m.id,
    'Staff message has no conversation record',
    'The message cannot be tied to a current conversation.',
    '{}'::jsonb,
    clock_timestamp(),clock_timestamp()
  from public.laurem_staff_messages m
  left join public.laurem_staff_message_conversations c on c.id=m.conversation_id
  where c.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  insert into public.laurem_data_governance_findings (
    finding_key,finding_type,severity,rule_key,subject_type,subject_id,staff_id,title,detail,metadata,last_detected_at,updated_at
  )
  select
    'orphan:visa_case:'||v.id,'orphan','high','inactive_staff','visa_case',v.id,v.staff_id,
    'Visa case has no staff record',
    'The visa case cannot be tied to a current staff profile.',
    jsonb_build_object('status',v.status),
    clock_timestamp(),clock_timestamp()
  from public.laurem_staff_visa_cases v
  left join public.laurem_staff_profiles s on s.id=v.staff_id
  where s.id is null
  on conflict (finding_key) do update set last_detected_at=excluded.last_detected_at,updated_at=excluded.updated_at,status=case when public.laurem_data_governance_findings.status='resolved' then 'open' else public.laurem_data_governance_findings.status end;

  update public.laurem_data_governance_findings f
  set status='resolved',
      resolved_by='system',
      resolved_at=clock_timestamp(),
      resolution_note='No longer detected by the governance scan.',
      updated_at=clock_timestamp()
  where f.status in ('open','acknowledged','held')
    and f.finding_type='orphan'
    and f.last_detected_at < clock_timestamp() - interval '1 minute';

  return jsonb_build_object(
    'ok',true,
    'scanned_at',clock_timestamp(),
    'finding_count',(select count(*) from public.laurem_data_governance_findings where status in ('open','acknowledged','held')),
    'critical_count',(select count(*) from public.laurem_data_governance_findings where severity='critical' and status in ('open','acknowledged','held'))
  );
end;
$$;

revoke all on function public.laurem_data_governance_scan() from public, anon, authenticated;