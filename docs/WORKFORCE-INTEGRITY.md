# Workforce integrity

The workforce module uses explicit lifecycle policies for leave, timesheets and payroll periods. Cross-table constraints and database functions protect scheduling, leave and payroll boundaries; API routes remain responsible for authentication, authorization, validation and user-facing conflict messages.


## Operational readiness

The workforce operations acceptance layer is read-only and derives its status from the canonical workforce records. It covers five lanes:

- assignments
- attendance
- timesheets
- leave
- payroll

A lane is **blocked** only for conditions that require correction before the next operational step, **attention** for a review queue, and **ready** when no exception is detected.

The same readiness contract powers both:

- `/api/staff/workforce-readiness`
- `/api/admin/workforce/readiness`

Attendance clock-in/out and staff leave submission also write workforce audit events so the operational timeline records the staff-side action, not only subsequent admin review.
