import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff employment documents', () => {
  it('defines private staff document storage and atomic signing', () => {
    const sql = readFileSync('supabase/migrations/20260920_staff_employment_documents.sql', 'utf8');
    expect(sql).toContain('create table if not exists public.laurem_staff_documents');
    expect(sql).toContain('laurem_sign_staff_document');
    expect(sql).toContain('laurem_attach_accepted_contract_document');
    expect(sql).toContain('revoke all on public.laurem_staff_documents, public.laurem_staff_document_events from anon, authenticated');
  });

  it('hardens the private document storage bucket', () => {
    const sql = readFileSync('supabase/migrations/20260920_staff_document_storage.sql', 'utf8');
    expect(sql).toContain("'laurem-private-documents'");
    expect(sql).toContain('false');
    expect(sql).toContain('10485760');
    expect(sql).toContain('application/pdf');
  });

  it('connects admin issuance to private staff records and email notification', () => {
    const source = readFileSync('app/api/admin/workforce/staff/[staffId]/documents/route.ts', 'utf8');
    expect(source).toContain('readAdminSession(request)');
    expect(source).toContain("from('staff_documents')");
    expect(source).toContain('laurem-private-documents');
    expect(source).toContain('sendLauremEmail');
    expect(source).toContain('lauremCompany.documentIssuer.name');
    expect(source).toContain("const requiresSignature = category === 'job_description' || template === 'job_description' || clean(form.get('requiresSignature')) === 'true';");
    const signingMigration = readFileSync('supabase/migrations/20260924_job_description_signature_hardening.sql', 'utf8');
    expect(signingMigration).toContain("v_doc.category = 'job_description' and not v_doc.requires_signature");
    expect(signingMigration).toContain("signature_status = case when signature_status = 'not_required' then 'pending' else signature_status end");
  });

  it('requires online staff signature rather than a download workflow', () => {
    const page = readFileSync('app/staff/documents/[id]/page.tsx', 'utf8');
    expect(page).toContain('Sign document electronically');
    expect(page).toContain('documentApiPath');
    expect(page).toContain('/api/staff/documents/');
    expect(page).toContain('encodeURIComponent(id)');
    expect(page).toContain('canvas');
    expect(page).toContain('/api/staff/documents/${encodeURIComponent(id)}/download');
    const downloadRoute = readFileSync('app/api/staff/documents/[id]/download/route.ts', 'utf8');
    expect(downloadRoute).toContain("event_type: 'downloaded'");
    expect(downloadRoute).toContain("'laurem-private-documents'");
    expect(downloadRoute).toContain('Content-Disposition');
    expect(downloadRoute).toContain('downloaded_at');
    const previewRoute = readFileSync('app/api/staff/documents/[id]/route.ts', 'utf8');
    expect(previewRoute).toContain("document.category === 'visa_sponsorship'");
    expect(previewRoute).toContain("['cos_assigned', 'completed'].includes(visaCase.status)");
    expect(previewRoute).toContain('The Certificate of Sponsorship is not active yet.');
    expect(previewRoute).toContain("const { data, error } = await client.rpc('laurem_sign_staff_document'");
    const contract = readFileSync('app/contracts/accept/[token]/page.tsx', 'utf8');
    expect(contract).toContain('Sign contract electronically');
    expect(contract).toContain('signatureData');
  });

  it('defers employment document issuance until the Hired transition', () => {
    const onboarding = readFileSync('app/api/admin/onboarding/route.ts', 'utf8');
    expect(onboarding).toContain('activationDeferredUntilHired');
    expect(onboarding).toContain('activation_token_hash: null');
    expect(onboarding).not.toContain('provisionLauremStaffPortal');

    const hireRoute = readFileSync('app/api/admin/applications/hire/route.ts', 'utf8');
    expect(hireRoute).toContain('laurem_hire_application_atomic');
    expect(hireRoute).toContain('provisionLauremStaffPortal');
  });

  it('keeps the configured employer signatory consistent', () => {
    const company = readFileSync('lib/laurem-company-config.ts', 'utf8');
    expect(company).toContain("name: 'Dezou Maurice'");
    expect(company).toContain("title: 'Manager'");
    const contract = readFileSync('lib/laurem-contract.ts', 'utf8');
    expect(contract).toContain('Name: Dezou Maurice');
    const nurse = readFileSync('lib/laurem-international-nurse-contract.ts', 'utf8');
    expect(nurse).toContain('Name: Dezou Maurice');
  });
});
