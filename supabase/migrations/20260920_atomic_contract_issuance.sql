-- Atomically issue a CONAGS employment contract and rotate its acceptance token.
-- The route remains responsible for application/role eligibility and email delivery.

create or replace function public.laurem_issue_recruitment_contract_with_token(
  p_contract_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.laurem_recruitment_contracts%rowtype;
  v_token public.laurem_recruitment_contract_tokens%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_token_hash), '') is null then
    raise exception 'CONTRACT_TOKEN_REQUIRED';
  end if;

  if nullif(btrim(p_actor), '') is null then
    raise exception 'CONTRACT_ISSUER_REQUIRED';
  end if;

  select *
    into v_contract
  from public.laurem_recruitment_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;

  if v_contract.accepted_at is not null or v_contract.status = 'accepted' then
    raise exception 'CONTRACT_ALREADY_ACCEPTED';
  end if;

  if v_contract.status not in ('draft','issued','viewed') then
    raise exception 'CONTRACT_NOT_ISSUABLE';
  end if;

  update public.laurem_recruitment_contracts
  set status = 'issued',
      issued_at = v_now,
      updated_at = v_now
  where id = v_contract.id
  returning * into v_contract;

  update public.laurem_recruitment_contract_tokens
  set used_at = v_now
  where contract_id = v_contract.id
    and used_at is null;

  insert into public.laurem_recruitment_contract_tokens(
    contract_id,
    token_hash,
    expires_at,
    used_at,
    created_at
  )
  values (
    v_contract.id,
    p_token_hash,
    p_expires_at,
    null,
    v_now
  )
  returning * into v_token;

  return jsonb_build_object(
    'contract', to_jsonb(v_contract),
    'token_id', v_token.id
  );
end;
$$;

revoke all on function public.laurem_issue_recruitment_contract_with_token(uuid,text,timestamptz,text)
  from public, anon, authenticated;

grant execute on function public.laurem_issue_recruitment_contract_with_token(uuid,text,timestamptz,text)
  to service_role;
