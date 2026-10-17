import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Mega-Build 26 staff My Week hub', () => {
  it('uses the authenticated workforce dashboard as the single source for the cross-module week view', () => {
    const page = readFileSync('app/staff/week/page.tsx', 'utf8');
    expect(page).toContain("fetch('/api/staff/workforce-dashboard'");
    expect(page).toContain('My Week');
    expect(page).toContain('weekKeys');
    expect(page).toContain('/staff/timesheets');
    expect(page).toContain('/staff/leave');
    expect(page).toContain('/staff/payroll');
    expect(page).toContain('/staff/documents');
    expect(page).toContain('/staff/attendance');
    expect(page).not.toContain("from('laurem_");
  });

  it('keeps the workspace discoverable from shell and quick navigation', () => {
    const shell = readFileSync('components/StaffShell.tsx', 'utf8');
    const palette = readFileSync('components/StaffCommandPalette.tsx', 'utf8');
    expect(shell).toContain("{href:'/staff/week',label:'My Week',short:'Week'}");
    expect(shell).toContain('staff-mobile-week');
    expect(palette).toContain("{href:'/staff/week',label:'My Week'");
  });
});
