-- Job Descriptions are mandatory e-sign documents.
-- Repair legacy staff Job Description rows issued before this policy was enforced
-- and make the signing RPC accept those legacy rows.

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

  if v_doc.signature_status = 'signed' then
    return jsonb_build_object('document', to_jsonb(v_doc), 'already_signed', true);
  end if;

  if v_doc.category = 'job_description' and not v_doc.requires_signature then
    update public.laurem_staff_documents
    set requires_signature = true,
        signature_status = case when signature_status = 'not_required' then 'pending' else signature_status end,
        updated_at = v_now
    where id = v_doc.id
    returning * into v_doc;
  end if;

  if not v_doc.requires_signature then raise exception 'SIGNATURE_NOT_REQUIRED'; end if;
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

  return jsonb_build_object('document', to_jsonb(v_doc), 'already_signed', false);
end;
$$;

revoke all on function public.laurem_sign_staff_document(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.laurem_sign_staff_document(uuid,uuid,text,text,text,text,text) to service_role;
