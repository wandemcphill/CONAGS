create extension if not exists pgcrypto;

alter table recruitment_documents
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references recruitment_documents(id) on delete set null,
  add column if not exists checksum_sha256 text;

alter table recruitment_document_requests
  add column if not exists required_for_readiness boolean not null default false,
  add column if not exists readiness_item_key text,
  add column if not exists expires_at timestamptz;

create table if not exists recruitment_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  evidence_type text not null,
  document_id uuid references recruitment_documents(id) on delete set null,
  status text not null check (status in ('pending','approved','rejected','waived','expired','superseded')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_evidence_reviews_application_idx
  on recruitment_evidence_reviews(application_id, evidence_type, created_at desc);

create unique index if not exists recruitment_evidence_reviews_active_type_idx
  on recruitment_evidence_reviews(application_id, evidence_type)
  where status in ('pending','approved','waived');

create table if not exists recruitment_evidence_audit (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  evidence_review_id uuid references recruitment_evidence_reviews(id) on delete set null,
  action text not null,
  actor text not null,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_evidence_audit_application_idx
  on recruitment_evidence_audit(application_id, created_at desc);

create or replace function laurem_record_evidence_review(
  p_application_id uuid,
  p_evidence_type text,
  p_document_id uuid,
  p_status text,
  p_actor text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns recruitment_evidence_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row recruitment_evidence_reviews;
  result_row recruitment_evidence_reviews;
begin
  if p_status not in ('pending','approved','rejected','waived','expired','superseded') then
    raise exception using errcode='P0001', message='INVALID_EVIDENCE_STATUS';
  end if;
  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception using errcode='P0001', message='EVIDENCE_ACTOR_REQUIRED';
  end if;

  select * into current_row
  from recruitment_evidence_reviews
  where application_id = p_application_id
    and evidence_type = p_evidence_type
    and status in ('pending','approved','waived')
  order by created_at desc
  limit 1
  for update;

  if current_row.id is not null and current_row.status = 'approved' and p_status = 'approved' and current_row.document_id = p_document_id then
    return current_row;
  end if;

  if current_row.id is not null and p_status in ('approved','waived','pending') then
    update recruitment_evidence_reviews
      set status = 'superseded', updated_at = now()
    where id = current_row.id;
    insert into recruitment_evidence_audit(application_id, evidence_review_id, action, actor, previous_status, new_status, note)
      values (p_application_id, current_row.id, 'superseded', p_actor, current_row.status, 'superseded', p_note);
  end if;

  insert into recruitment_evidence_reviews(
    application_id, evidence_type, document_id, status, reviewed_by, reviewed_at, review_note, metadata
  ) values (
    p_application_id,
    p_evidence_type,
    p_document_id,
    p_status,
    case when p_status in ('approved','rejected','waived') then p_actor else null end,
    case when p_status in ('approved','rejected','waived') then now() else null end,
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into result_row;

  insert into recruitment_evidence_audit(application_id, evidence_review_id, action, actor, previous_status, new_status, note)
    values (p_application_id, result_row.id, 'status_changed', p_actor, current_row.status, p_status, p_note);

  return result_row;
end;
$$;

revoke all on function laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb) to service_role;

alter table recruitment_evidence_reviews enable row level security;
alter table recruitment_evidence_audit enable row level security;
revoke all on recruitment_evidence_reviews, recruitment_evidence_audit from anon, authenticated;
