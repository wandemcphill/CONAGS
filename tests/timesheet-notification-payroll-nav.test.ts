import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('timesheet review notifications', () => {
  it('notifies staff when admin approves or rejects a timesheet', () => {
    const source = readFileSync('app/api/admin/workforce/timesheets/route.ts', 'utf8');
    expect(source).toContain("createLauremStaffNotification");
    expect(source).toContain("requestedStatus === 'approved' || requestedStatus === 'rejected'");
    expect(source).toContain("category: 'timesheet'");
    expect(source).toContain("actionUrl: '/staff/timesheets'");
  });

  it('handles duplicate assignment timesheets defensively', () => {
    const staffRoute = readFileSync('app/api/staff/timesheets/route.ts', 'utf8');
    const attendanceRoute = readFileSync('app/api/staff/attendance/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260920_staff_timesheet_assignment_guard.sql', 'utf8');
    expect(staffRoute).toContain("error?.code === '23505'");
    expect(attendanceRoute).toContain("error?.code === '23505'");
    expect(attendanceRoute).toContain("timeZone: 'Europe/London'");
    expect(migration).toContain('unique index');
    expect(migration).toContain('(staff_id, assignment_id)');
    expect(migration).toContain('where assignment_id is not null');
  });

  it('keeps payroll available from the main staff workspace', () => {
    const source = readFileSync('components/StaffHomeDashboard.tsx', 'utf8');
    expect(source).toContain("['Payroll','/staff/payroll']");
    expect(source).toContain("['Attendance','/staff/attendance']");
    expect(source).toContain("['My Profile','/staff/profile']");
  });
});