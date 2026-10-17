-- CONAGS employment documents: private staff delivery, online review, acknowledgement and electronic signature.
create extension if not exists pgcrypto;

alter table public.laurem_recruitment_contracts
  add column if not exists acceptance_method text,
  add column if not exists acceptance_signature_data text,
  add column if not exists acceptance_attestation text;

create table if not exists public.laurem_staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  category text not null check (category in ('contract','job_description','offer_letter','policy','handbook','payslip','compliance','other')),
  title text not null,
  description text,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  storage_path text,
  content_text text,
  document_sha256 text not null,
  source_type text not null check (source_type in ('manual','job_description','contract','onboarding')),
  source_key text,
  status text not null default 'issued' check (status in ('issued','superseded','revoked')),
  requires_signature boolean not null default false,
  signature_status text not null default 'not_required' check (signature_status in ('not_required','pending','signed','declined')),
  signature_method text,
  signature_name text,
  signature_data text,
  signature_attestation text,
  signed_at timestamptz,
  signed_ip inet,
  signed_user_agent text,
  issuer_name text not null default 'Dezou Maurice',
  issuer_title text not null default 'Manager',
  employer_name text not null default 'Conags Care Ltd',
  issued_by_actor text not null,
  issued_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  viewed_count integer not null default 0,
  downloaded_at timestamptz,
  superseded_at timestamptz,
  superseded_by uuid references public.laurem_staff_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((storage_path is not null) <> (content_text is not null)),
  check (length(btrim(title)) between 1 and 240)
);

create unique index if not exists laurem_staff_documents_source_idx
  on public.laurem_staff_documents(staff_id, source_type, source_key)
  where source_key is not null;
create index if not exists laurem_staff_documents_staff_idx
  on public.laurem_staff_documents(staff_id, status, issued_at desc);
create index if not exists laurem_staff_documents_signature_idx
  on public.laurem_staff_documents(staff_id, signature_status);

create table if not exists public.laurem_staff_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.laurem_staff_documents(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  event_type text not null check (event_type in ('created','issued','viewed','downloaded','signed','declined','superseded','revoked')),
  actor_type text not null check (actor_type in ('admin','staff','system')),
  actor text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists laurem_staff_document_events_document_idx
  on public.laurem_staff_document_events(document_id, created_at desc);
create index if not exists laurem_staff_document_events_staff_idx
  on public.laurem_staff_document_events(staff_id, created_at desc);

alter table public.laurem_staff_documents enable row level security;
alter table public.laurem_staff_document_events enable row level security;
revoke all on public.laurem_staff_documents, public.laurem_staff_document_events from anon, authenticated;

create or replace function public.laurem_sign_staff_document(
  p_document_id uuid,
  p_staff_id uuid,
  p_signed_name text,
  p_signature_data text default null,
  p_attestation text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.laurem_staff_documents%rowtype;
  v_staff public.laurem_staff_profiles%rowtype;
  v_now timestamptz := clock_timestamp();
  v_ip inet;
begin
  select * into v_staff
  from public.laurem_staff_profiles
  where id = p_staff_id
  for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.employment_status not in ('pending','active') then raise exception 'STAFF_NOT_ELIGIBLE'; end if;

  select * into v_doc
  from public.laurem_staff_documents
  where id = p_document_id
    and staff_id = p_staff_id
  for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_doc.status <> 'issued' then raise exception 'DOCUMENT_UNAVAILABLE'; end if;
  if not v_doc.requires_signature then raise exception 'SIGNATURE_NOT_REQUIRED'; end if;
  if v_doc.signature_status = 'signed' then raise exception 'DOCUMENT_ALREADY_SIGNED'; end if;
  if v_doc.signature_status <> 'pending' then raise exception 'DOCUMENT_NOT_SIGNABLE'; end if;
  if nullif(btrim(coalesce(p_signed_name,'')), '') is null then raise exception 'NAME_REQUIRED'; end if;
  if length(btrim(p_signed_name)) > 240 then raise exception 'NAME_TOO_LONG'; end if;
  if nullif(btrim(coalesce(p_attestation,'')), '') is null then raise exception 'ATTESTATION_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_attestation,'')), '') <> 'I confirm that I have read this document, understand it, and agree to sign it electronically.' then raise exception 'ATTESTATION_INVALID'; end if;

  begin
    v_ip := nullif(btrim(coalesce(p_ip,'')), '')::inet;
  exception when others then
    v_ip := null;
  end;

  update public.laurem_staff_documents
  set signature_status = 'signed',
      signature_method = case when nullif(btrim(coalesce(p_signature_data,'')), '') is null then 'typed_name' else 'typed_name_and_drawn_signature' end,
      signature_name = btrim(p_signed_name),
      signature_data = nullif(btrim(coalesce(p_signature_data,'')), ''),
      signature_attestation = btrim(p_attestation),
      signed_at = v_now,
      signed_ip = v_ip,
      signed_user_agent = p_user_agent,
      updated_at = v_now
  where id = v_doc.id
  returning * into v_doc;

  insert into public.laurem_staff_document_events(document_id, staff_id, event_type, actor_type, actor, metadata)
  values (
    v_doc.id, p_staff_id, 'signed', 'staff', btrim(p_signed_name),
    jsonb_build_object('signature_method', v_doc.signature_method, 'document_sha256', v_doc.document_sha256, 'signed_at', v_now)
  );

  return jsonb_build_object('document', to_jsonb(v_doc));
end;
$$;

revoke all on function public.laurem_sign_staff_document(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.laurem_sign_staff_document(uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.laurem_attach_accepted_contract_document(
  p_staff_id uuid,
  p_application_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.laurem_staff_profiles%rowtype;
  v_contract public.laurem_recruitment_contracts%rowtype;
  v_doc public.laurem_staff_documents%rowtype;
  v_now timestamptz := clock_timestamp();
  v_source_key text;
begin
  select * into v_staff
  from public.laurem_staff_profiles
  where id = p_staff_id and application_id = p_application_id
  for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;

  select * into v_contract
  from public.laurem_recruitment_contracts
  where application_id = p_application_id and status = 'accepted' and accepted_at is not null
  order by accepted_at desc limit 1;
  if not found then raise exception 'ACCEPTED_CONTRACT_REQUIRED'; end if;

  v_source_key := v_contract.id::text;
  select * into v_doc
  from public.laurem_staff_documents
  where staff_id = p_staff_id and source_type = 'contract' and source_key = v_source_key
  for update;
  if found then return jsonb_build_object('document', to_jsonb(v_doc), 'already_exists', true); end if;

  insert into public.laurem_staff_documents(
    staff_id, category, title, description, mime_type, content_text, document_sha256,
    source_type, source_key, status, requires_signature, signature_status,
    signature_method, signature_name, signature_attestation, signed_at, signed_ip,
    signed_user_agent, issuer_name, issuer_title, employer_name, issued_by_actor, issued_at
  )
  values (
    p_staff_id, 'contract', 'Employment Contract',
    'Final employment contract accepted electronically before staff portal activation.',
    'text/plain', v_contract.contract_content,
    encode(digest(convert_to(v_contract.contract_content, 'utf8'), 'sha256'), 'hex'),
    'contract', v_source_key, 'issued', false, 'signed',
    coalesce(v_contract.acceptance_method, 'candidate_online_acceptance'),
    v_contract.accepted_by_name,
    coalesce(v_contract.acceptance_attestation, 'Electronic acceptance recorded by the CONAGS platform.'),
    v_contract.accepted_at, v_contract.accepted_ip, v_contract.acceptance_user_agent,
    'Dezou Maurice', 'Manager', 'Conags Care Ltd',
    coalesce(nullif(btrim(p_actor), ''), 'CONAGS platform'),
    coalesce(v_contract.issued_at, v_now)
  )
  returning * into v_doc;

  insert into public.laurem_staff_document_events(document_id, staff_id, event_type, actor_type, actor, metadata)
  values (
    v_doc.id, p_staff_id, 'created', 'system',
    coalesce(nullif(btrim(p_actor), ''), 'CONAGS platform'),
    jsonb_build_object('source_type','contract','contract_id',v_contract.id,'document_sha256',v_doc.document_sha256)
  );

  return jsonb_build_object('document', to_jsonb(v_doc), 'already_exists', false);
end;
$$;

revoke all on function public.laurem_attach_accepted_contract_document(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.laurem_attach_accepted_contract_document(uuid,uuid,text) to service_role;


create or replace function public.laurem_consume_recruitment_contract_token_v2(
  p_token_hash text,
  p_action text,
  p_accepted_by_name text default null,
  p_decline_reason text default null,
  p_ip text default null,
  p_user_agent text default null,
  p_signature_data text default null,
  p_attestation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.laurem_recruitment_contract_tokens%rowtype;
  contract_row public.laurem_recruitment_contracts%rowtype;
  now_ts timestamptz := clock_timestamp();
begin
  if p_action not in ('accept','decline') then
    return jsonb_build_object('ok',false,'code','INVALID_ACTION');
  end if;

  select * into token_row
  from public.laurem_recruitment_contract_tokens
  where token_hash = p_token_hash
  for update;
  if not found then return jsonb_build_object('ok',false,'code','TOKEN_NOT_FOUND'); end if;
  if token_row.expires_at is not null and token_row.expires_at <= now_ts then return jsonb_build_object('ok',false,'code','TOKEN_EXPIRED'); end if;
  if token_row.used_at is not null then return jsonb_build_object('ok',false,'code','TOKEN_USED'); end if;

  select * into contract_row
  from public.laurem_recruitment_contracts
  where id = token_row.contract_id
  for update;
  if not found then return jsonb_build_object('ok',false,'code','CONTRACT_NOT_FOUND'); end if;
  if contract_row.status not in ('issued','viewed') then return jsonb_build_object('ok',false,'code','CONTRACT_UNAVAILABLE'); end if;

  if p_action = 'accept' then
    if nullif(trim(coalesce(p_accepted_by_name,'')), '') is null then
      return jsonb_build_object('ok',false,'code','NAME_REQUIRED');
    end if;
    if nullif(trim(coalesce(p_attestation,'')), '') is null then
      return jsonb_build_object('ok',false,'code','ATTESTATION_REQUIRED');
    end if;
    if trim(p_attestation) <> 'I confirm that I have read and understood this employment contract and agree to sign it electronically.' then
      return jsonb_build_object('ok',false,'code','ATTESTATION_INVALID');
    end if;

    update public.laurem_recruitment_contracts
    set status='accepted',
        accepted_at=now_ts,
        accepted_by_name=trim(p_accepted_by_name),
        accepted_ip=nullif(trim(coalesce(p_ip,'')),'')::inet,
        acceptance_user_agent=p_user_agent,
        acceptance_method=case when nullif(trim(coalesce(p_signature_data,'')),'') is null then 'typed_name' else 'typed_name_and_drawn_signature' end,
        acceptance_signature_data=nullif(trim(coalesce(p_signature_data,'')),''),
        acceptance_attestation=trim(p_attestation),
        viewed_at=coalesce(contract_row.viewed_at,now_ts),
        updated_at=now_ts
    where id=contract_row.id;
  else
    update public.laurem_recruitment_contracts
    set status='declined',
        declined_at=now_ts,
        decline_reason=nullif(trim(coalesce(p_decline_reason,'')),''),
        viewed_at=coalesce(contract_row.viewed_at,now_ts),
        updated_at=now_ts
    where id=contract_row.id;
  end if;

  update public.laurem_recruitment_contract_tokens
  set used_at=now_ts
  where id=token_row.id and used_at is null;
  if not found then return jsonb_build_object('ok',false,'code','TOKEN_CONSUMPTION_RACE'); end if;

  return jsonb_build_object('ok',true,'status',case when p_action='accept' then 'accepted' else 'declined' end,'contract_id',contract_row.id,'token_id',token_row.id);
exception when invalid_text_representation then
  return jsonb_build_object('ok',false,'code','INVALID_IP');
end;
$$;

revoke all on function public.laurem_consume_recruitment_contract_token_v2(text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.laurem_consume_recruitment_contract_token_v2(text,text,text,text,text,text,text,text) to service_role;
