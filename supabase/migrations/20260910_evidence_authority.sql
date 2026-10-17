create extension if not exists pgcrypto;

alter table recruitment_evidence_reviews
  add column if not exists expires_at timestamptz;

create index if not exists recruitment_evidence_reviews_expiry_idx
  on recruitment_evidence_reviews(expires_at)
  where status = 'approved' and expires_at is not null;

drop function if exists laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb);

create or replace function laurem_record_evidence_review(
  p_application_id uuid,
  p_evidence_type text,
  p_document_id uuid,
  p_status text,
  p_actor text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_readiness_item_key text default null,
  p_expires_at timestamptz default null
)
returns recruitment_evidence_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row recruitment_evidence_reviews;
  result_row recruitment_evidence_reviews;
  checklist_status text;
begin
  if nullif(trim(coalesce(p_evidence_type, '')), '') is null then
    raise exception using errcode='P0001', message='EVIDENCE_TYPE_REQUIRED';
  end if;
  if p_status not in ('pending','approved','rejected','waived','expired','superseded') then
    raise exception using errcode='P0001', message='INVALID_EVIDENCE_STATUS';
  end if;
  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception using errcode='P0001', message='EVIDENCE_ACTOR_REQUIRED';
  end if;
  if p_status = 'approved' and p_expires_at is not null and p_expires_at <= now() then
    raise exception using errcode='P0001', message='EVIDENCE_EXPIRY_MUST_BE_FUTURE';
  end if;
  if p_document_id is not null and not exists (
    select 1 from recruitment_documents d
    where d.id = p_document_id and d.application_id = p_application_id
  ) then
    raise exception using errcode='P0001', message='EVIDENCE_DOCUMENT_APPLICATION_MISMATCH';
  end if;

  select * into current_row
  from recruitment_evidence_reviews
  where application_id = p_application_id
    and evidence_type = p_evidence_type
    and status in ('pending','approved','waived')
  order by created_at desc
  limit 1
  for update;

  if current_row.id is not null
     and current_row.status = p_status
     and current_row.document_id is not distinct from p_document_id
     and current_row.expires_at is not distinct from p_expires_at then
    return current_row;
  end if;

  if current_row.id is not null then
    update recruitment_evidence_reviews
      set status = 'superseded', updated_at = now()
    where id = current_row.id;
    insert into recruitment_evidence_audit(application_id, evidence_review_id, action, actor, previous_status, new_status, note)
      values (p_application_id, current_row.id, 'superseded', p_actor, current_row.status, 'superseded', p_note);
  end if;

  insert into recruitment_evidence_reviews(
    application_id, evidence_type, document_id, status, reviewed_by, reviewed_at,
    review_note, metadata, expires_at
  ) values (
    p_application_id,
    nullif(trim(p_evidence_type), ''),
    p_document_id,
    p_status,
    case when p_status in ('approved','rejected','waived','expired','superseded') then p_actor else null end,
    case when p_status in ('approved','rejected','waived','expired','superseded') then now() else null end,
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    p_expires_at
  ) returning * into result_row;

  insert into recruitment_evidence_audit(application_id, evidence_review_id, action, actor, previous_status, new_status, note)
    values (p_application_id, result_row.id, 'status_changed', p_actor, current_row.status, p_status, p_note);

  if p_document_id is not null and p_status in ('pending','approved','rejected') then
    update recruitment_documents
      set status = case when p_status = 'approved' then 'approved' when p_status = 'rejected' then 'rejected' else 'pending' end,
          reviewed_by = case when p_status = 'pending' then null else p_actor end,
          reviewed_at = case when p_status = 'pending' then null else now() end,
          review_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_document_id and application_id = p_application_id;
  end if;

  if p_document_id is not null and p_status = 'approved' then
    update recruitment_documents
      set superseded_at = null, superseded_by = null
    where id = p_document_id and application_id = p_application_id;
  end if;

  if p_readiness_item_key is not null then
    checklist_status := case when p_status = 'approved' then 'completed' when p_status = 'waived' then 'waived' else 'pending' end;
    update recruitment_onboarding_checklist
      set status = checklist_status,
          completed_at = case when checklist_status in ('completed','waived') then now() else null end,
          completed_by = case when checklist_status in ('completed','waived') then p_actor else null end,
          notes = nullif(trim(coalesce(p_note, '')), ''),
          updated_at = now()
    where application_id = p_application_id and item_key = p_readiness_item_key;
  end if;

  return result_row;
end;
$$;

revoke all on function laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb,text,timestamptz) from public, anon, authenticated;
grant execute on function laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb,text,timestamptz) to service_role;

create or replace function laurem_supersede_previous_candidate_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare previous_document recruitment_documents;
begin
  select * into previous_document
  from recruitment_documents
  where application_id = new.application_id
    and document_type = new.document_type
    and id <> new.id
    and superseded_at is null
  order by uploaded_at desc
  limit 1
  for update;

  if previous_document.id is not null then
    update recruitment_documents
      set superseded_at = now(), superseded_by = new.id
    where id = previous_document.id;

    update recruitment_evidence_reviews
      set status = 'superseded', updated_at = now()
    where document_id = previous_document.id
      and status in ('pending','approved','waived');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_candidate_document_replacement on recruitment_documents;
create trigger trg_candidate_document_replacement
after insert on recruitment_documents
for each row execute function laurem_supersede_previous_candidate_document();

revoke all on function laurem_supersede_previous_candidate_document() from public, anon, authenticated;
