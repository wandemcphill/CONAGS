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
     and new.clock_in > assignment_row.scheduled_end then
    raise exception 'TIMESHEET_CLOCK_IN_AFTER_ASSIGNMENT';
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

revoke all on function public.laurem_assert_timesheet_assignment_integrity() from public, anon, authenticated;