-- CONAGS: fix composite-return handling in contract-time Staff Portal preparation.
CREATE OR REPLACE FUNCTION public.laurem_prepare_staff_portal_after_contract_atomic(
  p_application_id uuid,
  p_actor text default 'contract_acceptance'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  app_row public.laurem_recruitment_applications%rowtype;
  contract_row public.laurem_recruitment_contracts%rowtype;
  staff_row public.laurem_staff_profiles%rowtype;
  existing boolean := false;
  employee_number_value text;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  select * into app_row from public.laurem_recruitment_applications where id=p_application_id for update;
  if not found then raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND'; end if;

  if app_row.status not in ('Offer','Onboarding','Hired') then
    raise exception using errcode='P0001', message='APPLICATION_STATE_BLOCKED',
      detail=format('Application status %s cannot receive Staff Portal provisioning.',app_row.status);
  end if;

  select * into contract_row
    from public.laurem_recruitment_contracts
   where application_id=p_application_id and status='accepted' and accepted_at is not null
   order by accepted_at desc limit 1 for update;
  if not found then raise exception using errcode='P0001', message='CONTRACT_REQUIRED'; end if;

  if public.laurem_normalize_role(contract_row.job_title) is distinct from public.laurem_normalize_role(app_row.role_applied) then
    raise exception using errcode='P0001', message='CONTRACT_ROLE_MISMATCH';
  end if;

  select * into staff_row
    from public.laurem_staff_profiles
   where application_id=p_application_id
   order by created_at asc limit 1 for update;
  existing:=found;

  if not existing then
    employee_number_value := 'LAU-' || extract(year from current_date)::int || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.laurem_staff_profiles(
      application_id, employee_number, full_name, email, phone, job_title,
      employment_status, start_date, location, nmc_number, right_to_work_verified,
      dbs_verified, contract_id
    ) values (
      p_application_id,
      employee_number_value,
      trim(coalesce(app_row.full_name,'')),
      lower(trim(coalesce(app_row.email,''))),
      app_row.phone,
      app_row.role_applied,
      'pending',
      coalesce(contract_row.start_date, app_row.start_date),
      null,
      nullif(trim(coalesce(app_row.application_data->>'nmc_number','')), ''),
      false,
      false,
      contract_row.id
    ) returning * into staff_row;
  else
    if staff_row.contract_id is not null and staff_row.contract_id <> contract_row.id then
      raise exception using errcode='P0001', message='STAFF_CONTRACT_MISMATCH';
    end if;
    if staff_row.contract_id is null then
      update public.laurem_staff_profiles
         set contract_id=contract_row.id, updated_at=clock_timestamp()
       where id=staff_row.id
       returning * into staff_row;
    end if;
    if staff_row.employment_status not in ('pending','active') then
      raise exception using errcode='P0001', message='STAFF_PORTAL_STATE_BLOCKED';
    end if;
  end if;

  if app_row.status='Offer' then
    perform public.laurem_transition_application_status(
      p_application_id,'Onboarding',p_actor,
      'Employment contract accepted. Pending Staff Portal identity provisioned; hiring remains a separate lifecycle step.',
      false,null
    );
    app_row.status:='Onboarding';
  end if;

  return jsonb_build_object(
    'ok',true,
    'created_staff',not existing,
    'staff_id',staff_row.id,
    'employee_number',staff_row.employee_number,
    'laurem_id',coalesce(staff_row.laurem_id,staff_row.employee_number),
    'contract_id',contract_row.id,
    'application_status',app_row.status,
    'employment_status',staff_row.employment_status
  );
end;
$function$;

revoke all on function public.laurem_prepare_staff_portal_after_contract_atomic(uuid,text) from public, anon, authenticated;
grant execute on function public.laurem_prepare_staff_portal_after_contract_atomic(uuid,text) to service_role;
