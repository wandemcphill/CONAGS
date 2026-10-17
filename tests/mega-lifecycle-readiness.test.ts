import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('CONAGS mega lifecycle readiness contract', () => {
  it('keeps recruitment status changes behind the atomic lifecycle RPC', () => {
    const route = read('app/api/admin/applications/route.ts');
    const lifecycle = read('lib/laurem-recruitment-lifecycle.ts');

    expect(route).toContain("isLauremRecruitmentStatus(status)");
    expect(lifecycle).toContain('LAUREM_RECRUITMENT_STATUSES');

    for (const status of [
      'Enquiry', 'Invited', 'Application', 'Screening', 'Interview',
      'Second Interview', 'Documents', 'Sponsorship', 'Offer',
      'Onboarding', 'Hired', 'Rejected', 'Withdrawn',
    ]) {
      expect(lifecycle).toContain("'" + status + "'");
    }

    expect(route).toContain("client.rpc('laurem_transition_application_status'");
    expect(route).toContain("if(status==='Interview')");
    expect(route).toContain("from('interview_attempts')");
  });

  it('keeps accepted-contract protection in the hiring path', () => {
    const route = read('app/api/admin/contracts/route.ts');
    expect(route).toContain("readAdminSession(request)");
    expect(route).toContain("from('recruitment_contracts')");
    expect(route).toContain("existingContract?.status === 'accepted'");
    expect(route).toContain('cannot overwrite the accepted record');
  });

  it('keeps the staff sponsorship workspace authenticated and atomic', () => {
    const route = read('app/api/staff/visa-sponsorship/route.ts');
    expect(route).toContain('getStaffSession(request)');
    expect(route).toContain("db().rpc('laurem_request_staff_visa_sponsorship'");
    expect(route).toContain("['visa_switch','international_sponsorship']");
    expect(route).toContain("from('laurem_staff_visa_cases')");
    expect(route).toContain("from('laurem_staff_visa_case_events')");
  });

  it('keeps every core staff workforce surface session-bound', () => {
    const routes = [
      'app/api/staff/availability/route.ts',
      'app/api/staff/shifts/route.ts',
      'app/api/staff/timesheets/route.ts',
      'app/api/staff/leave/route.ts',
      'app/api/staff/payroll/route.ts',
      'app/api/staff/documents/route.ts',
      'app/api/staff/onboarding/route.ts',
      'app/api/staff/messages/route.ts',
      'app/api/staff/notifications/route.ts',
      'app/api/staff/visa-sponsorship/route.ts',
    ];
    for (const path of routes) {
      expect(read(path), path).toContain('getStaffSession(');
    }
  });

  it('keeps the production health contract aware of the newest employment lifecycle tables', () => {
    const source = read('lib/laurem-release-health.ts');
    for (const table of [
      'staff_documents', 'staff_document_events', 'staff_visa_cases',
      'staff_visa_invoices', 'staff_visa_case_events',
    ]) {
      expect(source).toContain("'" + table + "'");
    }
    expect(source).toContain(".select('id', { head: true, count: 'exact' })");
    expect(source).toContain("REQUIRED_PRIVATE_BUCKET = 'laurem-private-documents'");
    expect(source).toContain("REQUIRED_PRIVATE_BUCKETS");
    expect(source).toContain("laurem-staff-photos");
    expect(source).toContain("interview-recordings");

  });

  it('keeps the admin health endpoint authenticated and non-cacheable', () => {
    const route = read('app/api/admin/system/health/route.ts');
    expect(route).toContain('readAdminSession(request)');
    expect(route).toContain('status: health.ok ? 200 : 503');
    expect(route).toContain("'cache-control': 'no-store'");
  });
});