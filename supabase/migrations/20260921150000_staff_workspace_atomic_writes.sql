-- Mega-Build 22: make staff onboarding acknowledgement a single ownership-checked transaction.
-- Forward-only migration.

create or replace function public.laurem_acknowledge_staff_onboarding_task(
  p_staff_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  package_row public.laurem_staff_onboarding_packages%rowtype;
  task_row public.laurem_staff_onboarding_tasks%rowtype;
  staff_email text;
  now_value timestamptz := clock_timestamp();
  required_count integer;
  required_done integer;
  acknowledgement_count integer;
  acknowledgement_done integer;
  package_complete boolean;
  updated_package public.laurem_staff_onboarding_packages;
  updated_task public.laurem_staff_onboarding_tasks;
begin
  select sp.email
    into staff_email
  from public.laurem_staff_profiles sp
  where sp.id = p_staff_id
    and sp.employment_status = 'active'
    and sp.activated_at is not null;

  if not found then
    raise exception 'STAFF_NOT_ELIGIBLE';
  end if;

  select *
    into package_row
  from public.laurem_staff_onboarding_packages
  where staff_id = p_staff_id
  for update;

  if not found then
    raise exception 'ONBOARDING_PACKAGE_NOT_FOUND';
  end if;

  select *
    into task_row
  from public.laurem_staff_onboarding_tasks
  where id = p_task_id
    and package_id = package_row.id
  for update;

  if not found then
    raise exception 'ONBOARDING_TASK_NOT_FOUND';
  end if;

  if not task_row.acknowledgement_required then
    raise exception 'ACKNOWLEDGEMENT_NOT_REQUIRED';
  end if;

  if task_row.acknowledged_at is not null then
    raise exception 'TASK_ALREADY_ACKNOWLEDGED';
  end if;

  update public.laurem_staff_onboarding_tasks
  set acknowledged_at = now_value,
      acknowledged_by = p_staff_id,
      updated_at = now_value
  where id = task_row.id
    and package_id = package_row.id
    and acknowledged_at is null
  returning * into updated_task;

  if not found then
    raise exception 'TASK_ALREADY_ACKNOWLEDGED';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where not required
         or status in ('completed','waived')
    )::integer,
    count(*) filter (
      where acknowledgement_required
    )::integer,
    count(*) filter (
      where not acknowledgement_required
         or acknowledged_at is not null
    )::integer
  into required_count, required_done, acknowledgement_count, acknowledgement_done
  from public.laurem_staff_onboarding_tasks
  where package_id = package_row.id;

  package_complete :=
    required_count > 0
    and required_done = required_count
    and acknowledgement_done = required_count;

  update public.laurem_staff_onboarding_packages
  set status = case when package_complete then 'complete' else 'in_progress' end,
      completed_at = case when package_complete then now_value else null end,
      updated_at = now_value
  where id = package_row.id
    and staff_id = p_staff_id
  returning * into updated_package;

  if not found then
    raise exception 'ONBOARDING_PACKAGE_UPDATE_FAILED';
  end if;

  perform public.laurem_record_audit_event(
    p_lifecycle_area := 'onboarding',
    p_entity_type := 'staff_onboarding_task',
    p_entity_id := updated_task.id,
    p_staff_id := p_staff_id,
    p_actor_type := 'staff',
    p_actor := coalesce(staff_email, p_staff_id::text),
    p_action := 'onboarding_task_acknowledged',
    p_previous_state := 'unacknowledged',
    p_new_state := 'acknowledged',
    p_source_table := 'laurem_staff_onboarding_tasks',
    p_metadata := jsonb_build_object(
      'package_id', package_row.id,
      'package_status', updated_package.status
    )
  );

  return jsonb_build_object(
    'ok', true,
    'task', to_jsonb(updated_task),
    'package', to_jsonb(updated_package)
  );
end;
$function$;

revoke all on function public.laurem_acknowledge_staff_onboarding_task(uuid,uuid) from public, anon, authenticated;
grant execute on function public.laurem_acknowledge_staff_onboarding_task(uuid,uuid) to service_role;
