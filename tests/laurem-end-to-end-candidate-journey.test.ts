import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

async function read(relativePath: string) {
  return fs.readFile(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('CONAGS end-to-end candidate journey', () => {
  it('connects application submission to Interview 1', async () => {
    const applicationPage = await read('app/apply/[token]/page.tsx');
    const applicationApi = await read('app/api/applications/route.ts');
    expect(applicationPage).toContain("current=\"application\"");
    expect(applicationPage).toContain('Interview 1');
    expect(applicationApi).toContain('round1_assessment_invitation');
  });

  it('connects Interview 1 to Interview 2 with explicit stage language', async () => {
    const interviewPage = await read('app/interview/[token]/page.tsx');
    const secondPage = await read('app/second-interview/[token]/page.tsx');
    expect(interviewPage).toContain('INTERVIEW 1');
    expect(interviewPage).toContain("current=\"interview1\"");
    expect(secondPage).toContain('INTERVIEW 2');
    expect(secondPage).toContain("current=\"interview2\"");
  });

  it('issues one secure offer package with the contract, Job Description, Handbook and onboarding preparation', async () => {
    const contractAdminApi = await read('app/api/admin/contracts/route.ts');
    const acceptanceApi = await read('app/api/contracts/accept/route.ts');
    const documentApi = await read('app/api/candidate-documents/route.ts');
    const migration = await read('supabase/migrations/20260921200000_candidate_document_pack.sql');
    const offerPackageMigration = await read('supabase/migrations/20260922120000_offer_document_pack_at_issue.sql');
    expect(contractAdminApi).toContain('laurem_issue_candidate_document_pack');
    expect(contractAdminApi).toContain('documentPackLink');
    expect(contractAdminApi).toContain('Your CONAGS employment offer package is ready');
    expect(acceptanceApi).toContain("eq('status', 'pending')");
    expect(acceptanceApi).toContain('normally issued together with the contract');
    expect(acceptanceApi).toContain("p_to_status: 'Onboarding'");
    expect(documentApi).toContain('laurem_sign_candidate_document');
    expect(documentApi).toContain('readiness: readiness.items');
    expect(migration).toContain('laurem_issue_candidate_document_pack');
    expect(migration).toContain('laurem_sign_candidate_document');
    expect(offerPackageMigration).toContain("status in ('accepted','issued','viewed')");
  });

  it('prevents the three employment documents from being requested again during onboarding', async () => {
    const onboarding = await read('lib/laurem-onboarding.ts');
    expect(onboarding).not.toContain("task_key: 'employment_contract'");
    expect(onboarding).not.toContain("task_key: 'hca_handbook'");
    expect(onboarding).not.toContain("task_key: 'overseas_nurse_handbook'");
    const page = await read('app/onboarding/[token]/page.tsx');
    expect(page).toContain('will not be asked to sign those three documents again');
  });

  it('carries signed pre-hire documents into the staff record at hire', async () => {
    const hireApi = await read('app/api/admin/applications/hire/route.ts');
    const migration = await read('supabase/migrations/20260921201500_attach_signed_candidate_documents_to_staff.sql');
    expect(hireApi).toContain('laurem_hire_application_atomic');
    expect(migration).toContain('candidate-document:');
    expect(migration).toContain("signature_status = 'signed'");
  });

  it('lands an activated employee in the CONAGS Staff Portal home', async () => {
    const activation = await read('app/staff/activate/ActivationForm.tsx');
    const staffHome = await read('app/staff/page.tsx');
    expect(activation).toContain("router.replace('/staff?activated=1')");
    expect(staffHome).toContain('CONAGS CARE · STAFF PORTAL');
    expect(staffHome).toContain('Welcome, {staff.full_name}');
  });

  it('provides downloadable signed candidate documents', async () => {
    const page = await read('app/candidate-documents/[token]/page.tsx');
    const route = await read('app/api/candidate-documents/download/route.ts');
    expect(page).toContain('Download designed signed copy');
    expect(page).toContain('/api/candidate-documents/download?token=');
    expect(route).toContain('Content-Disposition');
    expect(route).toContain('signed copy');
  });
});
