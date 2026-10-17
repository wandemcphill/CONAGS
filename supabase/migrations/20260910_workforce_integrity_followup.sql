create extension if not exists btree_gist;

-- The payroll period is a date range, so exact-pair uniqueness is not enough.
alter table payroll_periods
  drop constraint if exists payroll_periods_dates_nonoverlap;

alter table payroll_periods
  add constraint payroll_periods_dates_nonoverlap
  exclude using gist (
    daterange(period_start, period_end, '[]') with &&
  );

-- Recreate the assignment guard with the same per-staff advisory lock used by
-- leave approval. The lock must be acquired before checking leave, otherwise
-- concurrent leave approval and assignment creation can both pass their checks.
create or replace function laurem_assert_assignment_not_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('scheduled', 'confirmed') then
    perform pg_advisory_xact_lock(hashtextextended('laurem-workforce:' || new.staff_id::text, 0));

    if exists (
      select 1
      from staff_leave_requests l
      where l.staff_id = new.staff_id
        and l.status = 'approved'
        and l.start_date <= (new.scheduled_end at time zone 'UTC')::date
        and l.end_date >= (new.scheduled_start at time zone 'UTC')::date
    ) then
      raise exception 'ASSIGNMENT_CONFLICTS_WITH_APPROVED_LEAVE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_assignment_workforce_lock on staff_assignments;

revoke all on function laurem_assert_assignment_not_on_leave() from public, anon, authenticated;
