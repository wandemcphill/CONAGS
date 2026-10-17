create or replace function consume_recruitment_contract_token(
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
declare
  token_row recruitment_contract_tokens;
  contract_row recruitment_contracts;
  now_ts timestamptz := now();
begin
  if p_action not in ('accept', 'decline') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACTION');
  end if;

  select * into token_row
  from recruitment_contract_tokens
  where token_hash = p_token_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_NOT_FOUND');
  end if;

  if token_row.expires_at is not null and token_row.expires_at <= now_ts then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_EXPIRED');
  end if;

  if token_row.used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_USED');
  end if;

  select * into contract_row
  from recruitment_contracts
  where id = token_row.contract_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CONTRACT_NOT_FOUND');
  end if;

  if contract_row.status not in ('issued', 'viewed') then
    return jsonb_build_object('ok', false, 'code', 'CONTRACT_UNAVAILABLE');
  end if;

  if p_action = 'accept' then
    if nullif(trim(coalesce(p_accepted_by_name, '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
    end if;

    update recruitment_contracts
    set status = 'accepted',
        accepted_at = now_ts,
        accepted_by_name = trim(p_accepted_by_name),
        accepted_ip = p_ip,
        acceptance_user_agent = p_user_agent,
        viewed_at = coalesce(contract_row.viewed_at, now_ts),
        updated_at = now_ts
    where id = contract_row.id;
  else
    update recruitment_contracts
    set status = 'declined',
        declined_at = now_ts,
        decline_reason = nullif(trim(coalesce(p_decline_reason, '')), ''),
        viewed_at = coalesce(contract_row.viewed_at, now_ts),
        updated_at = now_ts
    where id = contract_row.id;
  end if;

  update recruitment_contract_tokens
  set used_at = now_ts
  where id = token_row.id
    and used_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_CONSUMPTION_RACE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_action = 'accept' then 'accepted' else 'declined' end,
    'contract_id', contract_row.id,
    'token_id', token_row.id
  );
end;
$$;

revoke all on function consume_recruitment_contract_token(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function consume_recruitment_contract_token(text,text,text,text,text,text) to service_role;
