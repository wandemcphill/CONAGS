create or replace function public.laurem_guard_assignment_attendance_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('laurem-workforce:' || new.staff_id::text, 0));

  if new.status in ('cancelled', 'no_show')
     and old.status is distinct from new.status
     and exists (
       select 1
       from public.laurem_staff_timesheets t
       where t.assignment_id = new.id
         and (
           t.clock_in is not null
           or t.status in ('submitted', 'approved', 'paid')
         )
     ) then
    raise exception 'ASSIGNMENT_HAS_ATTENDANCE_OR_TIMESHEET';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_laurem_assignment_attendance_guard on public.laurem_staff_assignments;
create trigger trg_laurem_assignment_attendance_guard
before update of status on public.laurem_staff_assignments
for each row execute function public.laurem_guard_assignment_attendance_mutation();

create or replace function public.laurem_assert_timesheet_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row record;
begin
  if tg_op = 'UPDATE'
     and old.assignment_id is not null
     and new.assignment_id is null
     and new.status in ('submitted', 'approved', 'paid') then
    raise exception 'SUBMITTED_ASSIGNED_TIMESHEET_CANNOT_BE_DETACHED';
  end if;

  if new.assignment_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('laurem-workforce:' || new.staff_id::text, 0));

  select id, staff_id, scheduled_start, scheduled_end, status
  into assignment_row
  from public.laurem_staff_assignments
  where id = new.assignment_id
  for share;

  if not found then
    raise exception 'ASSIGNMENT_NOT_FOUND_FOR_TIMESHEET';
  end if;

  if assignment_row.staff_id <> new.staff_id then
    raise exception 'TIMESHEET_ASSIGNMENT_STAFF_MISMATCH';
  end if;

  if assignment_row.status in ('cancelled', 'no_show') then
    raise exception 'TIMESHEET_ASSIGNMENT_NOT_ACTIVE';
  end if;

  if new.clock_in is not null
     and new.work_date <> (new.clock_in at time zone 'Europe/London')::date then
    raise exception 'TIMESHEET_WORK_DATE_MISMATCH';
  end if;

  if new.clock_in is not null
     and new.clock_in < assignment_row.scheduled_start - interval '2 hours' then
    raise exception 'TIMESHEET_CLOCK_IN_TOO_EARLY';
  end if;

  if new.clock_in is not null
     and new.clock_out is not null
     and new.clock_out <= new.clock_in then
    raise exception 'TIMESHEET_CLOCK_ORDER_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_laurem_timesheet_assignment_integrity on public.laurem_staff_timesheets;
create trigger trg_laurem_timesheet_assignment_integrity
before insert or update on public.laurem_staff_timesheets
for each row execute function public.laurem_assert_timesheet_assignment_integrity();

create or replace function public.laurem_lock_timesheet_payroll_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  period_id uuid;
  work_day date;
begin
  work_day := coalesce(new.work_date, old.work_date);

  select p.id
  into period_id
  from public.laurem_payroll_periods p
  where work_day between p.period_start and p.period_end
  order by p.created_at desc
  limit 1;

  if period_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('laurem-payroll:' || period_id::text, 0));
  end if;

  return coalesce(new, old);
end;
$;

drop trigger if exists trg_laurem_timesheet_payroll_serialization on public.laurem_staff_timesheets;
create trigger trg_laurem_timesheet_payroll_serialization
before insert or update or delete on public.laurem_staff_timesheets
for each row execute function public.laurem_lock_timesheet_payroll_period();

create or replace function public.laurem_validate_payroll_processing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'processing' then
    perform pg_advisory_xact_lock(hashtextextended('laurem-payroll:' || new.id::text, 0));

    if exists (
      select 1
      from public.laurem_payroll_entries e
      where e.payroll_period_id = new.id
        and (
          e.hourly_rate is null
          or e.gross_amount is null
          or e.gross_amount is distinct from round(e.approved_hours * e.hourly_rate, 2)
        )
    ) then
      raise exception 'PAYROLL_ENTRIES_INVALID';
    end if;

    if exists (
      with approved as (
        select t.staff_id, round(sum(coalesce(t.total_hours, 0)), 2) as approved_hours
        from public.laurem_staff_timesheets t
        where t.status = 'approved'
          and t.work_date between new.period_start and new.period_end
        group by t.staff_id
      ),
      entries as (
        select e.staff_id, round(sum(coalesce(e.approved_hours, 0)), 2) as approved_hours
        from public.laurem_payroll_entries e
        where e.payroll_period_id = new.id
        group by e.staff_id
      )
      select 1
      from approved
      full outer join entries using (staff_id)
      where coalesce(approved.approved_hours, 0) <> coalesce(entries.approved_hours, 0)
    ) then
      raise exception 'PAYROLL_ENTRIES_OUT_OF_DATE';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_laurem_payroll_processing_validation on public.laurem_payroll_periods;
create trigger trg_laurem_payroll_processing_validation
before update of status on public.laurem_payroll_periods
for each row execute function public.laurem_validate_payroll_processing();

revoke all on function public.laurem_guard_assignment_attendance_mutation() from public, anon, authenticated;
revoke all on function public.laurem_lock_timesheet_payroll_period() from public, anon, authenticated;
revoke all on function public.laurem_assert_timesheet_assignment_integrity() from public, anon, authenticated;
revoke all on function public.laurem_validate_payroll_processing() from public, anon, authenticated;
