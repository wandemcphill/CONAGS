-- CONAGS offer-package cutover: Job Description + Handbook are issued with the contract, before signature.
create or replace function public.laurem_issue_candidate_document_pack(
  p_application_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_job_description text,
  p_job_description_sha256 text,
  p_handbook_title text,
  p_handbook_content text,
  p_handbook_sha256 text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  app_row public.laurem_recruitment_applications%rowtype;
  contract_row public.laurem_recruitment_contracts%rowtype;
  pack_row public.laurem_candidate_document_packs%rowtype;
  job_doc public.laurem_candidate_documents%rowtype;
  handbook_doc public.laurem_candidate_documents%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  if nullif(btrim(coalesce(p_token_hash,'')), '') is null then
    raise exception 'DOCUMENT_PACK_TOKEN_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_actor,'')), '') is null then
    raise exception 'DOCUMENT_PACK_ACTOR_REQUIRED';
  end if;

  if p_expires_at <= now_value then
    raise exception 'DOCUMENT_PACK_EXPIRY_INVALID';
  end if;

  if nullif(btrim(coalesce(p_job_description,'')), '') is null
     or nullif(btrim(coalesce(p_handbook_content,'')), '') is null then
    raise exception 'DOCUMENT_PACK_CONTENT_REQUIRED';
  end if;

  select *
    into app_row
    from public.laurem_recruitment_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  select *
    into contract_row
    from public.laurem_recruitment_contracts
   where application_id = p_application_id
     and status in ('accepted','issued','viewed')
     and (status in ('issued','viewed') or accepted_at is not null)
   order by accepted_at desc
   limit 1
   for update;

  if not found then
    raise exception 'ISSUED_OR_ACCEPTED_CONTRACT_REQUIRED';
  end if;

  if lower(btrim(coalesce(contract_row.job_title,''))) <> lower(btrim(coalesce(app_row.role_applied,''))) then
    raise exception 'CONTRACT_ROLE_MISMATCH';
  end if;

  update public.laurem_candidate_document_packs
     set status = case
       when status = 'pending' then 'revoked'
       else status
     end,
     updated_at = now_value
   where application_id = p_application_id
     and status = 'pending';

  insert into public.laurem_candidate_document_packs(
    application_id,
    token_hash,
    status,
    expires_at,
    created_by_actor,
    created_at,
    updated_at
  )
  values(
    p_application_id,
    p_token_hash,
    'pending',
    p_expires_at,
    p_actor,
    now_value,
    now_value
  )
  returning * into pack_row;

  insert into public.laurem_candidate_documents(
    pack_id,
    application_id,
    document_type,
    title,
    content_text,
    document_sha256
  )
  values(
    pack_row.id,
    p_application_id,
    'job_description',
    btrim(coalesce(nullif(app_row.role_applied, ''), 'Job')) || ' Job Description',
    p_job_description,
    p_job_description_sha256
  )
  returning * into job_doc;

  insert into public.laurem_candidate_documents(
    pack_id,
    application_id,
    document_type,
    title,
    content_text,
    document_sha256
  )
  values(
    pack_row.id,
    p_application_id,
    'handbook',
    btrim(p_handbook_title),
    p_handbook_content,
    p_handbook_sha256
  )
  returning * into handbook_doc;

  insert into public.laurem_candidate_document_events(
    pack_id, document_id, application_id, event_type, actor_type, actor, metadata
  )
  values
    (
      pack_row.id, job_doc.id, p_application_id, 'created', 'system', p_actor,
      jsonb_build_object('document_type','job_description','document_sha256',job_doc.document_sha256)
    ),
    (
      pack_row.id, handbook_doc.id, p_application_id, 'created', 'system', p_actor,
      jsonb_build_object('document_type','handbook','document_sha256',handbook_doc.document_sha256)
    );

  return jsonb_build_object(
    'pack', to_jsonb(pack_row),
    'job_description', to_jsonb(job_doc),
    'handbook', to_jsonb(handbook_doc)
  );
end;
$func$;

create or replace function public.laurem_sign_candidate_document(
  p_token_hash text,
  p_document_id uuid,
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
as $func$
declare
  pack_row public.laurem_candidate_document_packs%rowtype;
  doc_row public.laurem_candidate_documents%rowtype;
  pending_count integer;
  now_value timestamptz := clock_timestamp();
  ip_value inet;
begin
  select *
    into pack_row
    from public.laurem_candidate_document_packs
   where token_hash = p_token_hash
   for update;

  if not found then
    raise exception 'DOCUMENT_PACK_NOT_FOUND';
  end if;

  if pack_row.expires_at <= now_value and pack_row.status = 'pending' then
    update public.laurem_candidate_document_packs
       set status = 'expired', updated_at = now_value
     where id = pack_row.id;
    raise exception 'DOCUMENT_PACK_EXPIRED';
  end if;

  if pack_row.status in ('revoked','expired') then
    raise exception 'DOCUMENT_PACK_UNAVAILABLE';
  end if;

  select *
    into doc_row
    from public.laurem_candidate_documents
   where id = p_document_id
     and pack_id = pack_row.id
   for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if doc_row.signature_status = 'signed' then
    return jsonb_build_object(
      'ok', true,
      'already_signed', true,
      'pack_status', pack_row.status,
      'document', to_jsonb(doc_row)
    );
  end if;

  if doc_row.signature_status <> 'pending' then
    raise exception 'DOCUMENT_NOT_SIGNABLE';
  end if;

  if nullif(btrim(coalesce(p_signed_name,'')), '') is null then
    raise exception 'NAME_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_attestation,'')), '') is null then
    raise exception 'ATTESTATION_REQUIRED';
  end if;

  if btrim(p_attestation) <> 'I confirm that I have read this document, understand it, and agree to sign it electronically.' then
    raise exception 'ATTESTATION_INVALID';
  end if;

  begin
    ip_value := nullif(btrim(coalesce(p_ip,'')), '')::inet;
  exception when others then
    ip_value := null;
  end;

  update public.laurem_candidate_documents
     set signature_status = 'signed',
         signature_method = case
           when nullif(btrim(coalesce(p_signature_data,'')), '') is null then 'typed_name'
           else 'typed_name_and_drawn_signature'
         end,
         signature_name = btrim(p_signed_name),
         signature_data = nullif(btrim(coalesce(p_signature_data,'')), ''),
         signature_attestation = btrim(p_attestation),
         signed_at = now_value,
         signed_ip = ip_value,
         signed_user_agent = p_user_agent,
         updated_at = now_value
   where id = doc_row.id
  returning * into doc_row;

  insert into public.laurem_candidate_document_events(
    pack_id, document_id, application_id, event_type, actor_type, actor, metadata
  )
  values(
    pack_row.id,
    doc_row.id,
    pack_row.application_id,
    'signed',
    'candidate',
    btrim(p_signed_name),
    jsonb_build_object(
      'document_type', doc_row.document_type,
      'document_sha256', doc_row.document_sha256,
      'signed_at', now_value
    )
  );

  select count(*)
    into pending_count
    from public.laurem_candidate_documents
   where pack_id = pack_row.id
     and signature_status = 'pending';

  if pending_count = 0 then
    update public.laurem_candidate_document_packs
       set status = 'completed',
           completed_at = now_value,
           updated_at = now_value
     where id = pack_row.id
    returning * into pack_row;

    insert into public.laurem_candidate_document_events(
      pack_id, document_id, application_id, event_type, actor_type, actor, metadata
    )
    values(
      pack_row.id,
      null,
      pack_row.application_id,
      'completed',
      'candidate',
      btrim(p_signed_name),
      jsonb_build_object('completed_at', now_value)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_signed', false,
    'pack_status', pack_row.status,
    'document', to_jsonb(doc_row)
  );
end;
$func$;

revoke all on function public.laurem_issue_candidate_document_pack(
  uuid,text,timestamptz,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.laurem_issue_candidate_document_pack(
  uuid,text,timestamptz,text,text,text,text,text,text
) to service_role;

revoke all on function public.laurem_sign_candidate_document(
  text,uuid,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.laurem_sign_candidate_document(
  text,uuid,text,text,text,text,text
) to service_role;
