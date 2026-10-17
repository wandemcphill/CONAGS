-- CONAGS HR & Workforce Administration fields: manager linkage, emergency contacts, compliance tracking
alter table public.laurem_staff_profiles
  add column if not exists manager_id uuid references public.laurem_staff_profiles(id) on delete set null,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists nmc_status text check (nmc_status is null or nmc_status in ('fully_registered', 'registration_in_progress', 'verification_pending', 'restricted_not_cleared', 'not_applicable')),
  add column if not exists nmc_expiry_date date,
  add column if not exists right_to_work_pathway text check (right_to_work_pathway is null or right_to_work_pathway in ('uk', 'overseas', 'sponsorship', 'unknown')),
  add column if not exists right_to_work_expiry_date date,
  add column if not exists right_to_work_notes text,
  add column if not exists dbs_pvg_status text check (dbs_pvg_status is null or dbs_pvg_status in ('verified', 'pending', 'expired', 'under_review', 'not_applicable')),
  add column if not exists dbs_pvg_check_date date,
  add column if not exists dbs_pvg_expiry_date date;

create index if not exists laurem_staff_profiles_manager_idx on public.laurem_staff_profiles(manager_id);
create index if not exists laurem_staff_profiles_search_idx on public.laurem_staff_profiles(employment_status, location, job_title);


create index if not exists laurem_staff_profiles_rtw_pathway_idx on public.laurem_staff_profiles(right_to_work_pathway);

-- Backfill the authoritative pathway from existing recruitment/visa records.
-- Unknown remains explicit when the source record does not establish a pathway.
update public.laurem_staff_profiles s
set right_to_work_pathway = case
  when exists (
    select 1
    from public.laurem_staff_visa_cases v
    where v.staff_id = s.id
      and v.pathway in ('visa_switch', 'international_sponsorship')
      and v.status not in ('declined', 'withdrawn')
  ) then 'sponsorship'
  when lower(coalesce(a.application_data->>'pathway', '')) = 'uk' then 'uk'
  when lower(coalesce(a.application_data->>'pathway', '')) = 'international' then 'overseas'
  else 'unknown'
end
from public.laurem_recruitment_applications a
where s.application_id = a.id;

-- Atomic HR profile mutation: update the authoritative field set and its canonical audit record
-- in the same database transaction.
create or replace function public.laurem_hr_update_staff_profile(
  p_staff_id uuid,
  p_action text,
  p_actor text,
  p_reason text default null,
  p_changes jsonb default '{}'::jsonb
)
returns public.laurem_staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.laurem_staff_profiles;
  v_new public.laurem_staff_profiles;
  v_manager_id uuid;
  v_rtw_pathway text;
  v_nmc_status text;
  v_dbs_status text;
begin
  if nullif(btrim(coalesce(p_actor, '')), '') is null then
    raise exception 'HR_ACTOR_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_action, '')), '') is null then
    raise exception 'HR_ACTION_REQUIRED';
  end if;

  select * into v_old
  from public.laurem_staff_profiles
  where id = p_staff_id
  for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  p_changes := coalesce(p_changes, '{}'::jsonb);

  if p_changes ? 'manager_id' then
    if nullif(btrim(coalesce(p_changes->>'manager_id', '')), '') is null then
      v_manager_id := null;
    else
      v_manager_id := (p_changes->>'manager_id')::uuid;
      if v_manager_id = p_staff_id then
        raise exception 'MANAGER_SELF_REFERENCE';
      end if;
      if not exists (
        select 1
        from public.laurem_staff_profiles manager_row
        where manager_row.id = v_manager_id
          and manager_row.employment_status in ('pending', 'active')
      ) then
        raise exception 'MANAGER_NOT_FOUND_OR_INACTIVE';
      end if;
    end if;
  end if;

  if p_changes ? 'job_title'
     and nullif(btrim(coalesce(p_changes->>'job_title', '')), '') is null then
    raise exception 'JOB_TITLE_REQUIRED';
  end if;

  if p_changes ? 'right_to_work_pathway' then
    v_rtw_pathway := nullif(lower(btrim(coalesce(p_changes->>'right_to_work_pathway', ''))), '');
    if v_rtw_pathway is not null and v_rtw_pathway not in ('uk', 'overseas', 'sponsorship', 'unknown') then
      raise exception 'INVALID_RIGHT_TO_WORK_PATHWAY';
    end if;
  end if;

  if p_changes ? 'nmc_status' then
    v_nmc_status := nullif(lower(btrim(coalesce(p_changes->>'nmc_status', ''))), '');
    if v_nmc_status is not null and v_nmc_status not in ('fully_registered', 'registration_in_progress', 'verification_pending', 'restricted_not_cleared', 'not_applicable') then
      raise exception 'INVALID_NMC_STATUS';
    end if;
  end if;

  if p_changes ? 'dbs_pvg_status' then
    v_dbs_status := nullif(lower(btrim(coalesce(p_changes->>'dbs_pvg_status', ''))), '');
    if v_dbs_status is not null and v_dbs_status not in ('verified', 'pending', 'expired', 'under_review', 'not_applicable') then
      raise exception 'INVALID_DBS_PVG_STATUS';
    end if;
  end if;

  begin
    update public.laurem_staff_profiles
    set
      job_title = case when p_changes ? 'job_title' then btrim(p_changes->>'job_title') else job_title end,
      location = case when p_changes ? 'location' then nullif(btrim(p_changes->>'location'), '') else location end,
      manager_id = case when p_changes ? 'manager_id' then v_manager_id else manager_id end,
      start_date = case when p_changes ? 'start_date' then nullif(btrim(p_changes->>'start_date'), '')::date else start_date end,
      end_date = case when p_changes ? 'end_date' then nullif(btrim(p_changes->>'end_date'), '')::date else end_date end,
      right_to_work_pathway = case when p_changes ? 'right_to_work_pathway' then v_rtw_pathway else right_to_work_pathway end,
      right_to_work_verified = case when p_changes ? 'right_to_work_verified' then (p_changes->>'right_to_work_verified')::boolean else right_to_work_verified end,
      right_to_work_expiry_date = case when p_changes ? 'right_to_work_expiry_date' then nullif(btrim(p_changes->>'right_to_work_expiry_date'), '')::date else right_to_work_expiry_date end,
      right_to_work_notes = case when p_changes ? 'right_to_work_notes' then nullif(btrim(p_changes->>'right_to_work_notes'), '') else right_to_work_notes end,
      dbs_verified = case when p_changes ? 'dbs_verified' then (p_changes->>'dbs_verified')::boolean else dbs_verified end,
      dbs_pvg_status = case when p_changes ? 'dbs_pvg_status' then v_dbs_status else dbs_pvg_status end,
      dbs_pvg_check_date = case when p_changes ? 'dbs_pvg_check_date' then nullif(btrim(p_changes->>'dbs_pvg_check_date'), '')::date else dbs_pvg_check_date end,
      dbs_pvg_expiry_date = case when p_changes ? 'dbs_pvg_expiry_date' then nullif(btrim(p_changes->>'dbs_pvg_expiry_date'), '')::date else dbs_pvg_expiry_date end,
      nmc_number = case when p_changes ? 'nmc_number' then nullif(btrim(p_changes->>'nmc_number'), '') else nmc_number end,
      nmc_status = case when p_changes ? 'nmc_status' then v_nmc_status else nmc_status end,
      nmc_expiry_date = case when p_changes ? 'nmc_expiry_date' then nullif(btrim(p_changes->>'nmc_expiry_date'), '')::date else nmc_expiry_date end,
      emergency_contact_name = case when p_changes ? 'emergency_contact_name' then nullif(btrim(p_changes->>'emergency_contact_name'), '') else emergency_contact_name end,
      emergency_contact_phone = case when p_changes ? 'emergency_contact_phone' then nullif(btrim(p_changes->>'emergency_contact_phone'), '') else emergency_contact_phone end,
      emergency_contact_relationship = case when p_changes ? 'emergency_contact_relationship' then nullif(btrim(p_changes->>'emergency_contact_relationship'), '') else emergency_contact_relationship end,
      updated_at = clock_timestamp()
    where id = p_staff_id
    returning * into v_new;
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception 'INVALID_HR_FIELD_VALUE';
  end;

  perform public.laurem_record_audit_event(
    'workforce',
    'staff',
    v_new.id,
    v_new.application_id,
    v_new.id,
    'admin',
    btrim(p_actor),
    p_action,
    jsonb_build_object(
      'job_title', v_old.job_title,
      'location', v_old.location,
      'manager_id', v_old.manager_id,
      'right_to_work_pathway', v_old.right_to_work_pathway,
      'right_to_work_verified', v_old.right_to_work_verified,
      'dbs_verified', v_old.dbs_verified,
      'dbs_pvg_status', v_old.dbs_pvg_status,
      'nmc_number', v_old.nmc_number,
      'nmc_status', v_old.nmc_status,
      'nmc_expiry_date', v_old.nmc_expiry_date
    )::text,
    jsonb_build_object(
      'job_title', v_new.job_title,
      'location', v_new.location,
      'manager_id', v_new.manager_id,
      'right_to_work_pathway', v_new.right_to_work_pathway,
      'right_to_work_verified', v_new.right_to_work_verified,
      'dbs_verified', v_new.dbs_verified,
      'dbs_pvg_status', v_new.dbs_pvg_status,
      'nmc_number', v_new.nmc_number,
      'nmc_status', v_new.nmc_status,
      'nmc_expiry_date', v_new.nmc_expiry_date
    )::text,
    nullif(btrim(coalesce(p_reason, '')), ''),
    null,
    null,
    jsonb_build_object('action', p_action, 'changed_fields', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(p_changes) as k))
  );

  return v_new;
end;
$$;

revoke all on function public.laurem_hr_update_staff_profile(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.laurem_hr_update_staff_profile(uuid, text, text, text, jsonb) to service_role;

-- Atomic employment-status transition plus session/token revocation and canonical audit.
create or replace function public.laurem_change_staff_employment_status(
  p_staff_id uuid,
  p_next_status text,
  p_actor text,
  p_reason text,
  p_end_date date default null
)
returns public.laurem_staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.laurem_staff_profiles;
  v_new public.laurem_staff_profiles;
  v_now timestamptz := clock_timestamp();
  v_allowed boolean := false;
begin
  if nullif(btrim(coalesce(p_actor, '')), '') is null then
    raise exception 'HR_ACTOR_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'HR_REASON_REQUIRED';
  end if;
  if p_next_status not in ('pending', 'active', 'suspended', 'leaver') then
    raise exception 'INVALID_EMPLOYMENT_STATUS';
  end if;

  select * into v_old
  from public.laurem_staff_profiles
  where id = p_staff_id
  for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if p_next_status = v_old.employment_status then raise exception 'STAFF_ALREADY_IN_STATUS'; end if;

  v_allowed :=
    (v_old.employment_status = 'pending' and p_next_status = 'active')
    or (v_old.employment_status = 'active' and p_next_status in ('suspended', 'leaver'))
    or (v_old.employment_status = 'suspended' and p_next_status in ('active', 'leaver'));

  if not v_allowed then
    raise exception 'EMPLOYMENT_TRANSITION_NOT_ALLOWED';
  end if;

  if v_old.employment_status = 'pending' and p_next_status = 'active'
     and (v_old.activated_at is null or v_old.password_hash is null) then
    raise exception 'STAFF_ACTIVATION_REQUIRED';
  end if;

  if p_next_status = 'leaver' and p_end_date is null then
    raise exception 'LEAVER_END_DATE_REQUIRED';
  end if;

  update public.laurem_staff_profiles
  set employment_status = p_next_status,
      end_date = case when p_next_status = 'leaver' then p_end_date else null end,
      session_version = coalesce(session_version, 1) + 1,
      updated_at = v_now
  where id = p_staff_id
  returning * into v_new;

  update public.laurem_staff_portal_sessions
  set revoked_at = v_now
  where staff_id = p_staff_id
    and revoked_at is null;

  update public.laurem_staff_password_reset_tokens
  set consumed_at = v_now
  where staff_id = p_staff_id
    and consumed_at is null;

  perform public.laurem_record_audit_event(
    'staff_account',
    'staff_profile',
    v_new.id,
    v_new.application_id,
    v_new.id,
    'admin',
    btrim(p_actor),
    'employment_status_changed',
    v_old.employment_status,
    v_new.employment_status,
    btrim(p_reason),
    null,
    null,
    jsonb_build_object('endDate', p_end_date)
  );

  return v_new;
end;
$$;

revoke all on function public.laurem_change_staff_employment_status(uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function public.laurem_change_staff_employment_status(uuid, text, text, text, date) to service_role;
