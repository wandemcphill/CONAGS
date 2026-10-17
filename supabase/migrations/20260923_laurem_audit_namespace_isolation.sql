-- Restore the CONAGS audit boundary from the shared Supabase project.
--
-- BIMED keeps its own recruitment_* and recruitment_staff_audit_log data.
-- CONAGS must never ingest those events into laurem_audit_events.

drop trigger if exists trg_recruitment_audit_log_to_canonical_audit
  on public.recruitment_audit_log;

drop trigger if exists trg_staff_audit_to_canonical_audit
  on public.recruitment_staff_audit_log;

drop function if exists public.laurem_sync_recruitment_audit_log();
drop function if exists public.laurem_sync_staff_audit_log();

delete from public.laurem_audit_events
where source_table in ('recruitment_audit_log', 'recruitment_staff_audit_log');

create or replace function public.laurem_record_audit_event(
  p_lifecycle_area text,
  p_entity_type text,
  p_entity_id uuid,
  p_application_id uuid,
  p_staff_id uuid,
  p_actor_type text,
  p_actor text,
  p_action text,
  p_previous_state text,
  p_new_state text,
  p_reason text,
  p_source_table text,
  p_source_event_id uuid,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_id uuid;
  normalized_source_table text := nullif(trim(p_source_table), '');
begin
  if nullif(trim(p_lifecycle_area), '') is null then
    raise exception 'AUDIT_LIFECYCLE_AREA_REQUIRED';
  end if;

  if nullif(trim(p_actor), '') is null then
    raise exception 'AUDIT_ACTOR_REQUIRED';
  end if;

  if nullif(trim(p_action), '') is null then
    raise exception 'AUDIT_ACTION_REQUIRED';
  end if;

  if normalized_source_table is not null
     and normalized_source_table !~ '^laurem_[a-z0-9_]+$' then
    raise exception 'LAUREM_AUDIT_SOURCE_OUTSIDE_NAMESPACE'
      using detail = normalized_source_table;
  end if;

  insert into public.laurem_audit_events (
    lifecycle_area,
    entity_type,
    entity_id,
    application_id,
    staff_id,
    actor_type,
    actor,
    action,
    previous_state,
    new_state,
    reason,
    source_table,
    source_event_id,
    metadata,
    occurred_at
  )
  values (
    trim(p_lifecycle_area),
    nullif(trim(p_entity_type), ''),
    p_entity_id,
    p_application_id,
    p_staff_id,
    coalesce(nullif(trim(p_actor_type), ''), 'unknown'),
    trim(p_actor),
    trim(p_action),
    nullif(trim(p_previous_state), ''),
    nullif(trim(p_new_state), ''),
    nullif(left(trim(coalesce(p_reason, '')), 2000), ''),
    normalized_source_table,
    p_source_event_id,
    coalesce(p_metadata, '{}'::jsonb),
    clock_timestamp()
  )
  on conflict (source_table, source_event_id)
  do update set
    lifecycle_area = excluded.lifecycle_area,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    application_id = excluded.application_id,
    staff_id = excluded.staff_id,
    actor_type = excluded.actor_type,
    actor = excluded.actor,
    action = excluded.action,
    previous_state = excluded.previous_state,
    new_state = excluded.new_state,
    reason = excluded.reason,
    metadata = excluded.metadata,
    occurred_at = excluded.occurred_at
  returning id into audit_id;

  return audit_id;
end;
$$;

revoke all on function public.laurem_record_audit_event(
  text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,uuid,jsonb
) from public, anon, authenticated;

grant execute on function public.laurem_record_audit_event(
  text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,uuid,jsonb
) to service_role;
