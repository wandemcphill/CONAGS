import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source-contract checks remain credential-free so CI can certify the operational surface safely.
describe('CONAGS workforce operations acceptance contract', () => {
  it('exposes the shared readiness contract to staff and admin', () => {
    const staffApi = readFileSync('app/api/staff/workforce-readiness/route.ts', 'utf8');
    const adminApi = readFileSync('app/api/admin/workforce/readiness/route.ts', 'utf8');
    const staffPage = readFileSync('app/staff/page.tsx', 'utf8');
    const staffDashboard = readFileSync('components/StaffHomeDashboard.tsx', 'utf8');
    const adminPage = readFileSync('app/admin/workforce/page.tsx', 'utf8');

    expect(staffApi).toContain('buildWorkforceReadiness');
    expect(adminApi).toContain('buildWorkforceReadiness');
    expect(staffPage).toContain('/api/staff/workforce-dashboard');
    expect(staffPage).not.toContain("fetch('/api/staff/workforce-readiness'");
    expect(staffDashboard).toContain("Today's workforce state");
    expect(adminPage).toContain('/api/admin/workforce/readiness');
    expect(adminPage).toContain('WORKFORCE ACCEPTANCE');
  });

  it('records attendance clock-in and clock-out audit events', () => {
    const route = readFileSync('app/api/staff/attendance/route.ts', 'utf8');
    expect(route).toContain("event_type: 'attendance.clocked_in'");
    expect(route).toContain("event_type: 'attendance.clocked_out'");
    expect(route).toContain("entity_type: 'timesheet'");
  });

  it('records leave submission in the workforce audit trail', () => {
    const route = readFileSync('app/api/staff/leave/route.ts', 'utf8');
    expect(route).toContain("event_type: 'leave.submitted'");
    expect(route).toContain("entity_type: 'leave_request'");
  });

  it('keeps the acceptance surface read-only', () => {
    const staffApi = readFileSync('app/api/staff/workforce-readiness/route.ts', 'utf8');
    const adminApi = readFileSync('app/api/admin/workforce/readiness/route.ts', 'utf8');
    expect(staffApi).not.toContain(".update(");
    expect(staffApi).not.toContain(".insert(");
    expect(staffApi).not.toContain(".delete(");
    expect(adminApi).not.toContain(".update(");
    expect(adminApi).not.toContain(".insert(");
    expect(adminApi).not.toContain(".delete(");
  });
});
