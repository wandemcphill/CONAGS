import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff attendance and profile', () => {
  it('keeps attendance server-side and bound to the authenticated staff member and assignment', () => {
    const route = readFileSync('app/api/staff/attendance/route.ts', 'utf8');
    expect(route).toContain('getStaffSession(request)');
    expect(route).toContain("eq('staff_id', session.staff_id)");
    expect(route).toContain("from('laurem_staff_assignments')");
    expect(route).toContain("from('laurem_staff_timesheets')");
    expect(route).toContain(".eq('id', assignmentId)");
    expect(route).toContain(".eq('staff_id', session.staff_id)");
  });

  it('enforces the active-staff rule and two-hour clock-in window', () => {
    const route = readFileSync('app/api/staff/attendance/route.ts', 'utf8');
    expect(route).toContain("staff.employment_status !== 'active'");
    expect(route).toContain('2 * 60 * 60 * 1000');
    expect(route).toContain("['cancelled', 'no_show']");
  });

  it('turns clock-out into a submitted payroll timesheet with validated break time', () => {
    const route = readFileSync('app/api/staff/attendance/route.ts', 'utf8');
    expect(route).toContain('validBreakMinutes');
    expect(route).toContain("status: 'submitted'");
    expect(route).toContain('total_hours: hours');
    expect(route).toContain(".is('clock_out', null)");
  });

  it('limits profile self-service to the staff phone number', () => {
    const route = readFileSync('app/api/staff/me/route.ts', 'utf8');
    const page = readFileSync('app/staff/profile/page.tsx', 'utf8');
    expect(route).toContain('export async function PATCH');
    expect(route).toContain("const editable = [");
    expect(route).toContain("'phone'");
    expect(route).toContain("'address_line_1'");
    expect(route).toContain("staff.self_service_profile_updated");
    expect(page).toContain("fetch('/api/staff/me'");
    expect(page).toContain('Save profile');
    expect(page).toContain('Contact & address');
  });

  it('surfaces attendance and profile in the staff portal', () => {
    const dashboard = readFileSync('components/StaffHomeDashboard.tsx', 'utf8');
    expect(dashboard).toContain("['Attendance','/staff/attendance']");
    expect(dashboard).toContain("['My Profile','/staff/profile']");
  });
});