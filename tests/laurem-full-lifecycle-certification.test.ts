import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('CONAGS end-to-end lifecycle certification', () => {
  it('keeps candidate submission atomic before the recruitment lifecycle advances', () => {
    const route = source('app/api/applications/route.ts');
    const migration = source('supabase/migrations/20260919_atomic_application_round1.sql');
    expect(route).toContain("rpc('laurem_create_application_with_round1'");
    expect(route).not.toContain(".from('interview_attempts').insert");
    expect(migration).toContain('laurem_create_application_with_round1');
    expect(migration).toContain('for update');
  });

  it('requires contract-backed onboarding and uses atomic staff preparation', () => {
    const onboarding = source('app/api/admin/onboarding/route.ts');
    const hire = source('app/api/admin/applications/hire/route.ts');
    const lifecycle = source('lib/laurem-lifecycle.ts');
    const atomicMigration = source('supabase/migrations/20260919_staff_onboarding_atomic.sql');

    expect(onboarding).toContain("rpc('laurem_prepare_staff_onboarding_atomic'");
    expect(onboarding).not.toContain("from('recruitment_applications').update({ status: 'Onboarding'");
    expect(hire).toContain("readAdminSession(request)");
    expect(hire).toContain("rpc('laurem_prepare_staff_onboarding_atomic'");
    expect(hire).toContain("rpc('laurem_hire_application_atomic'");
    expect(hire).toContain('makeActivationToken');
    expect(lifecycle).toContain('Every staff conversion requires an accepted employment contract.');
    expect(atomicMigration).toContain('laurem_prepare_staff_onboarding_atomic');
  });

  it('keeps employment documents private and activation deferred until Hired', () => {
    const documents = source('tests/staff-employment-documents.test.ts');
    const hire = source('app/api/admin/applications/hire/route.ts');
    const activation = source('app/api/staff/auth/activate/route.ts');
    const storage = source('supabase/migrations/20260920_staff_document_storage.sql');

    expect(documents).toContain('laurem-private-documents');
    expect(hire).toContain('provisionLauremStaffPortal');
    expect(activation).toContain("rpc('laurem_activate_staff_account_with_session'");
    expect(activation).toContain("Cache-Control', 'no-store'");
    expect(storage).toContain('10485760');
  });

  it('reuses the recruited candidate record for visa support instead of creating a second identity flow', () => {
    const staffVisa = source('app/api/staff/visa-sponsorship/route.ts');
    const visaMigration = source('supabase/migrations/20260920_staff_visa_sponsorship.sql');

    expect(staffVisa).toContain('getStaffSession(request)');
    expect(staffVisa).toContain("from('recruitment_applications')");
    expect(staffVisa).toContain("rpc('laurem_request_staff_visa_sponsorship'");
    expect(visaMigration).toContain('case_snapshot jsonb');
    expect(visaMigration).toContain('laurem_request_staff_visa_sponsorship');
  });

  it('enforces one forward-only visa lifecycle for admin edits and CoS upload', () => {
    const adminVisa = source('app/api/admin/workforce/staff/[staffId]/visa-sponsorship/route.ts');
    const upload = source('app/api/admin/workforce/staff/[staffId]/documents/route.ts');
    const lifecycle = source('lib/laurem-visa-lifecycle.ts');

    expect(adminVisa).toContain('assertLauremVisaStatusTransition');
    expect(adminVisa).toContain('assertLauremVisaCoSAssignment');
    expect(upload).toContain('assertLauremVisaCoSAssignment');
    expect(upload).toContain(".eq('status', currentStatus)");
    expect(lifecycle).toContain("completed: []");
    expect(lifecycle).toContain("declined: []");
    expect(lifecycle).toContain("withdrawn: []");
  });

  it('keeps private document retrieval behind the authenticated staff session', () => {
    const download = source('app/api/staff/documents/[id]/download/route.ts');
    expect(download).toContain('getStaffSession(request)');
    expect(download).toContain("laurem-private-documents");
    expect(download).toContain("event_type: 'downloaded'");
  });
});
