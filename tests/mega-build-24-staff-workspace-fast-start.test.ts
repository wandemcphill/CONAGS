import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Mega-Build 24 staff workspace fast start', () => {
  it('provides an authenticated bootstrap endpoint with server-authoritative workforce state', () => {
    const route = readFileSync('app/api/staff/workspace-summary/route.ts', 'utf8');
    const page = readFileSync('app/staff/page.tsx', 'utf8');
    expect(route).toContain('getStaffSession');
    expect(route).toContain('session.staff_id');
    expect(route).toContain('buildStaffOperationalSnapshot');
    expect(route).toContain('buildWorkforceReadiness');
    expect(route).toContain('laurem_staff_profiles');
    expect(route).toContain('laurem_staff_assignments');
    expect(route).toContain('laurem_staff_timesheets');
    expect(route).toContain('laurem_staff_leave_requests');
    expect(route).toContain('laurem_payroll_entries');
    expect(page).toContain('/api/staff/workspace-summary');
    expect(page).toContain('workspaceBootstrap');
  });
});
