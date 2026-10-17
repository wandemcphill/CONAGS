import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(path, 'utf8');

describe('staff request centre', () => {
  it('uses one authenticated read surface and keeps source workflows authoritative', () => {
    const page = source('app/staff/requests/page.tsx');
    const route = source('app/api/staff/requests/route.ts');
    const shell = source('components/StaffShell.tsx');
    const palette = source('components/StaffCommandPalette.tsx');

    expect(page).toContain("fetch('/api/staff/requests'");
    expect(page).toContain('The source workflow remains the authoritative place');

    for (const table of [
      "from('laurem_staff_leave_requests')",
      "from('laurem_staff_rota_requests')",
      "from('laurem_staff_compliance_cases')",
      "from('laurem_staff_visa_cases')",
      "from('laurem_staff_visa_help_cases')",
      "from('laurem_staff_visa_help_tasks')",
      "from('laurem_staff_documents')",
    ]) expect(route).toContain(table);

    expect(route).toContain("eq('staff_id', session.staff_id)");
    expect(route).toContain("eq('visibility', 'staff')");
    expect(route).toContain("from('laurem_staff_visa_help_milestones')");
    expect(route).toContain("Cache-Control");

    for (const href of [
      '/staff/leave',
      '/staff/availability',
      '/staff/compliance',
      '/staff/documents',
      '/staff/visa-help',
      '/staff/visa-sponsorship',
    ]) expect(page).toContain(href);

    expect(page).toContain('My Requests');
    expect(page).toContain('Action needed');
    expect(page).toContain('In review');
    expect(shell).toContain("href:'/staff/requests'");
    expect(shell).toContain("label:'My Requests'");
    expect(palette).toContain("href:'/staff/requests'");
  });

  it('does not duplicate write APIs or call Visa Help monitoring through the request centre', () => {
    const page = source('app/staff/requests/page.tsx');
    const route = source('app/api/staff/requests/route.ts');

    expect(page).not.toContain("method: 'POST'");
    expect(page).not.toContain("method:'POST'");
    expect(page).not.toContain("fetch('/api/staff/visa-help'");
    expect(page).not.toContain("fetch('/api/staff/visa-sponsorship'");
    expect(route).not.toContain('monitorVisaHelpCase(');
    expect(route).not.toContain('ensureVisaHelpMilestones(');
    expect(route).toContain('milestoneCount');
  });
});
