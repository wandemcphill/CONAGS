create extension if not exists btree_gist;

-- Leave requests cannot overlap while they are pending or approved.
alter table staff_leave_requests
  drop constraint if exists staff_leave_requests_dates_nonoverlap;

alter table staff_leave_requests
  add constraint staff_leave_requests_dates_nonoverlap
  exclude using gist (
    staff_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'));

-- A staff member cannot be assigned to a scheduled/confirmed shift that overlaps
-- approved leave. The trigger closes the cross-table integrity gap that a simple
-- application-level overlap check cannot guarantee under concurrent requests.
create or replace function laurem_assert_assignment_not_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('scheduled', 'confirmed') then
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

drop trigger if exists trg_staff_assignment_leave_guard on staff_assignments;
create trigger trg_staff_assignment_leave_guard
before insert or update on staff_assignments
for each row execute function laurem_assert_assignment_not_on_leave();

-- Leave approval must not be able to race a new assignment into an inconsistent
-- state. PostgreSQL advisory locking serialises leave approval and assignment
-- creation/update for the same staff member.
create or replace function laurem_assert_leave_approval_not_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    perform pg_advisory_xact_lock(hashtextextended('laurem-workforce:' || new.staff_id::text, 0));

    if exists (
      select 1
      from staff_assignments a
      where a.staff_id = new.staff_id
        and a.status in ('scheduled', 'confirmed')
        and a.scheduled_start < ((new.end_date + 1)::timestamp at time zone 'UTC')
        and a.scheduled_end >= (new.start_date::timestamp at time zone 'UTC')
    ) then
      raise exception 'LEAVE_CONFLICTS_WITH_SCHEDULED_ASSIGNMENT';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_leave_assignment_guard on staff_leave_requests;
create trigger trg_staff_leave_assignment_guard
before insert or update on staff_leave_requests
for each row execute function laurem_assert_leave_approval_not_on_assignment();

-- Serialise assignment creation/update with leave approval for the same staff id.
create or replace function laurem_assignment_workforce_lock()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('laurem-workforce:' || new.staff_id::text, 0));
  return new;
end;
$$;

drop trigger if exists trg_staff_assignment_workforce_lock on staff_assignments;
create trigger trg_staff_assignment_workforce_lock
before insert or update on staff_assignments
for each row execute function laurem_assignment_workforce_lock();

-- Leave lifecycle is intentionally narrow. Historical rejected/cancelled requests
-- are immutable except through a new request.
create or replace function laurem_enforce_leave_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status <> new.status then
    if not (
      (old.status = 'pending' and new.status in ('approved', 'rejected', 'cancelled'))
      or (old.status = 'approved' and new.status = 'cancelled')
    ) then
      raise exception 'INVALID_LEAVE_STATUS_TRANSITION';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_leave_transition on staff_leave_requests;
create trigger trg_staff_leave_transition
before update on staff_leave_requests
for each row execute function laurem_enforce_leave_transition();

-- Payroll periods become immutable to operational changes once processing starts.
-- Open -> processing -> closed is the only supported state machine.
create or replace function laurem_enforce_payroll_period_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'open' and new.status <> 'processing' then
    raise exception 'INVALID_PAYROLL_PERIOD_TRANSITION';
  end if;
  if old.status = 'processing' and new.status <> 'closed' then
    raise exception 'INVALID_PAYROLL_PERIOD_TRANSITION';
  end if;
  if old.status = 'closed' then
    raise exception 'PAYROLL_PERIOD_IS_CLOSED';
  end if;

  if new.status = 'processing' then
    if exists (
      select 1
      from payroll_entries e
      where e.payroll_period_id = new.id
        and (e.hourly_rate is null or e.gross_amount is null)
    ) then
      raise exception 'PAYROLL_PERIOD_HAS_INCOMPLETE_ENTRIES';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payroll_period_transition on payroll_periods;
create trigger trg_payroll_period_transition
before update of status on payroll_periods
for each row execute function laurem_enforce_payroll_period_transition();

-- Only payroll entries in an open period may be recalculated or changed.
create or replace function laurem_guard_payroll_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  period_status text;
begin
  select status into period_status
  from payroll_periods
  where id = coalesce(new.payroll_period_id, old.payroll_period_id);

  if period_status is null then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND';
  end if;
  if period_status <> 'open' then
    raise exception 'PAYROLL_PERIOD_IS_LOCKED';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_payroll_entry_mutation_guard on payroll_entries;
create trigger trg_payroll_entry_mutation_guard
before insert or update or delete on payroll_entries
for each row execute function laurem_guard_payroll_entry_mutation();

-- Once a payroll period exists, timesheets in that period are locked at processing.
-- This keeps payroll reproducible and stops post-generation edits changing the source
-- numbers behind a payroll result.
create or replace function laurem_guard_timesheet_payroll_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  work_day date;
  period_status text;
begin
  work_day := coalesce(new.work_date, old.work_date);

  select p.status into period_status
  from payroll_periods p
  where work_day between p.period_start and p.period_end
  order by p.created_at desc
  limit 1;

  if period_status in ('processing', 'closed') then
    raise exception 'TIMESHEET_PAYROLL_PERIOD_LOCKED';
  end if;

  if tg_op = 'UPDATE' and old.status in ('approved', 'paid') then
    if row(old.staff_id, old.assignment_id, old.work_date, old.clock_in, old.clock_out, old.break_minutes, old.total_hours, old.status, old.notes)
       is distinct from
       row(new.staff_id, new.assignment_id, new.work_date, new.clock_in, new.clock_out, new.break_minutes, new.total_hours, new.status, new.notes) then
      raise exception 'APPROVED_TIMESHEET_IS_IMMUTABLE';
    end if;
  end if;

  if tg_op = 'DELETE' and old.status in ('approved', 'paid') then
    raise exception 'APPROVED_TIMESHEET_IS_IMMUTABLE';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_timesheet_payroll_lock on staff_timesheets;
create trigger trg_timesheet_payroll_lock
before insert or update or delete on staff_timesheets
for each row execute function laurem_guard_timesheet_payroll_lock();

-- Timesheet status progression is controlled in the database as well as the API.
create or replace function laurem_enforce_timesheet_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status <> new.status then
    if not (
      (old.status = 'draft' and new.status = 'submitted')
      or (old.status = 'submitted' and new.status in ('approved', 'rejected'))
      or (old.status = 'approved' and new.status = 'paid')
      or (old.status = 'rejected' and new.status = 'submitted')
    ) then
      raise exception 'INVALID_TIMESHEET_STATUS_TRANSITION';
    end if;
  end if;

  if new.status in ('approved', 'paid') and (new.total_hours is null or new.total_hours <= 0) then
    raise exception 'TIMESHEET_MUST_HAVE_POSITIVE_HOURS';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_timesheet_transition on staff_timesheets;
create trigger trg_timesheet_transition
before update on staff_timesheets
for each row execute function laurem_enforce_timesheet_transition();

-- Audit fields for leave/timesheet/payroll lifecycle changes.
alter table workforce_audit_events
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create index if not exists workforce_audit_events_entity_idx
  on workforce_audit_events(entity_type, entity_id, created_at desc);

-- Deny direct client access remains in force. SECURITY DEFINER functions above are
-- trigger-only database functions and are not exposed to anon/authenticated callers.
revoke all on function laurem_assert_assignment_not_on_leave() from public, anon, authenticated;
revoke all on function laurem_assert_leave_approval_not_on_assignment() from public, anon, authenticated;
revoke all on function laurem_assignment_workforce_lock() from public, anon, authenticated;
revoke all on function laurem_enforce_leave_transition() from public, anon, authenticated;
revoke all on function laurem_enforce_payroll_period_transition() from public, anon, authenticated;
revoke all on function laurem_guard_payroll_entry_mutation() from public, anon, authenticated;
revoke all on function laurem_guard_timesheet_payroll_lock() from public, anon, authenticated;
revoke all on function laurem_enforce_timesheet_transition() from public, anon, authenticated;
