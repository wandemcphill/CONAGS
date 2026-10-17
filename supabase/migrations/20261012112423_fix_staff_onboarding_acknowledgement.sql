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
  required_count integer := 0;
  required_done integer := 0;
  required_progress integer := 0;
  package_complete boolean := false;
  package_has_progress boolean := false;
  did_new_acknowledgement boolean := false;
  updated_package public.laurem_staff_onboarding_packages;
  updated_task public.laurem_staff_onboarding_tasks;
begin
  -- Pending, activated staff must be able to finish onboarding before becoming active.
  select sp.email
    into staff_email
  from public.laurem_staff_profiles sp
  where sp.id = p_staff_id
    and sp.employment_status in ('pending', 'active')
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

  if task_row.status = 'waived' then
    raise exception 'TASK_ALREADY_COMPLETED';
  end if;

  -- Idempotently repair older acknowledgements that were timestamped but not completed.
  did_new_acknowledgement := task_row.acknowledged_at is null;

  if did_new_acknowledgement
    or task_row.status <> 'completed'
    or task_row.completed_at is null then
    update public.laurem_staff_onboarding_tasks
    set status = 'completed',
        acknowledged_at = coalesce(acknowledged_at, now_value),
        acknowledged_by = coalesce(acknowledged_by, staff_email, p_staff_id::text),
        completed_at = coalesce(completed_at, now_value),
        completed_by = coalesce(completed_by, staff_email, p_staff_id::text),
        updated_at = now_value
    where id = task_row.id
      and package_id = package_row.id
    returning * into updated_task;

    if not found then
      raise exception 'ONBOARDING_TASK_UPDATE_FAILED';
    end if;
  else
    updated_task := task_row;
  end if;

  -- Progress is calculated from required tasks only, matching the portal's status logic.
  select
    count(*) filter (where t.required)::integer,
    count(*) filter (
      where t.required
        and t.status in ('completed', 'waived')
        and (not t.acknowledgement_required or t.acknowledged_at is not null)
    )::integer,
    count(*) filter (
      where t.required
        and (t.status in ('completed', 'waived') or t.acknowledged_at is not null)
    )::integer
  into required_count, required_done, required_progress
  from public.laurem_staff_onboarding_tasks t
  where t.package_id = package_row.id;

  package_complete := required_done = required_count;
  package_has_progress := required_progress > 0;

  update public.laurem_staff_onboarding_packages
  set status = case
        when package_complete then 'complete'
        when package_has_progress then 'in_progress'
        else 'pending'
      end,
      completed_at = case
        when package_complete then coalesce(completed_at, now_value)
        else null
      end,
      updated_at = now_value
  where id = package_row.id
    and staff_id = p_staff_id
  returning * into updated_package;

  if not found then
    raise exception 'ONBOARDING_PACKAGE_UPDATE_FAILED';
  end if;

  if did_new_acknowledgement then
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'task', to_jsonb(updated_task),
    'package', to_jsonb(updated_package)
  );
end;
$function$;

revoke all on function public.laurem_acknowledge_staff_onboarding_task(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.laurem_acknowledge_staff_onboarding_task(uuid, uuid)
  to service_role;
notify pgrst, 'reload schema';
