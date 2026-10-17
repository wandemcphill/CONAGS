-- Prevent duplicate payroll timesheets for the same staff assignment.
-- Manual timesheets without an assignment remain permitted.
create unique index if not exists laurem_staff_timesheets_assignment_unique
on public.laurem_staff_timesheets (staff_id, assignment_id)
where assignment_id is not null;
