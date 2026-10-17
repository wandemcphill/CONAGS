import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Regression contract for the complete visa-support operational handoff.
// The suite intentionally stays source-contract based so it is safe in CI without production credentials.
describe('CONAGS visa sponsorship operations contract', () => {
  it('exposes readiness to both staff and admin workflows', () => {
    const staffApi = readFileSync('app/api/staff/visa-sponsorship/route.ts', 'utf8');
    const adminApi = readFileSync('app/api/admin/workforce/staff/[staffId]/visa-sponsorship/route.ts', 'utf8');
    const staffPage = readFileSync('app/staff/visa-sponsorship/page.tsx', 'utf8');
    const adminPage = readFileSync('app/admin/workforce/[staffId]/visa-sponsorship/page.tsx', 'utf8');

    expect(staffApi).toContain('buildLauremVisaReadiness');
    expect(adminApi).toContain('buildLauremVisaReadiness');
    expect(staffPage).toContain('Case readiness');
    expect(adminPage).toContain('Operational readiness');
  });

  it('fails closed before SMS preparation/submission when packet readiness is incomplete', () => {
    const route = readFileSync('app/api/admin/workforce/staff/[staffId]/visa-sponsorship/route.ts', 'utf8');
    expect(route).toContain('canAdvanceLauremVisaToSmsSubmission');
    expect(route).toContain("'The visa case is not ready for SMS preparation/submission.'");
    expect(route).toContain('readiness,');
  });

  it('prevents CoS upload from bypassing SMS progression', () => {
    const lifecycle = readFileSync('lib/laurem-visa-lifecycle.ts', 'utf8');
    const upload = readFileSync('app/api/admin/workforce/staff/[staffId]/documents/route.ts', 'utf8');

    expect(lifecycle).toContain("status === 'submitted_to_sms' || status === 'cos_pending' || status === 'cos_assigned'");
    expect(upload).toContain('assertLauremVisaCoSAssignment(currentStatus)');
    expect(upload).toContain("nextStatus = 'cos_assigned'");
  });
});
