import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Mega-Build 27 staff home architecture', () => {
  it('keeps Home as a thin data-orchestration boundary', () => {
    const page = readFileSync('app/staff/page.tsx', 'utf8');
    const dashboard = readFileSync('components/StaffHomeDashboard.tsx', 'utf8');
    expect(page).toContain("fetch('/api/staff/workforce-dashboard'");
    expect(page).toContain("body.payroll?.entries");
    expect(page).toContain("operationalState?.status");
    expect(page).toContain("router.push('/staff/attendance')");
    expect(page).toContain("router.push('/staff/timesheets')");
    expect(page).toContain("router.push('/staff/payroll')");
    expect(page).toContain('/api/staff/workspace-summary');
    expect(page).toContain('StaffHomeDashboard');
    expect(page).not.toContain('const card:');
    expect(page).not.toContain('const btn =');
    expect(dashboard).toContain('MY DAY');
    expect(dashboard).toContain('Certificate of Sponsorship');
    expect(dashboard).toContain('Request leave');
    expect(dashboard).toContain('Employment record');
    expect(dashboard).toContain('My Week');
  });

  it('moves Home presentation onto shared portal primitives and responsive classes', () => {
    const dashboard = readFileSync('components/StaffHomeDashboard.tsx', 'utf8');
    const css = readFileSync('app/globals.css', 'utf8');
    expect(dashboard).toContain('<StaffPage');
    expect(dashboard).toContain('<StaffPanel');
    expect(dashboard).toContain('<StaffAction');
    expect(dashboard).not.toContain('style={{');
    expect(css).toContain('.staff-page--home');
    expect(css).toContain('.staff-home-command');
    expect(css).toContain('@media(max-width:600px)');
  });
});
