import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path:string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('CONAGS recruitment parity workflow', () => {
  it('keeps Candidate 360 admin-only and comprehensive', () => {
    const route = read('app/api/admin/applications/[id]/route.ts');
    const page = read('app/admin/applications/[id]/page.tsx');
    expect(route).toContain('readAdminSession(request)');
    expect(route).toContain('recruitment_status_history');
    expect(route).toContain('recruitment_contracts');
    expect(route).toContain('recruitment_evidence_reviews');
    expect(page).toContain('The private token itself is never displayed here.');
    expect(page).toContain('CONAGS CANDIDATE 360');
    expect(page).toContain('Documents & evidence');
    expect(page).toContain('Readiness gate');
    expect(page).toContain('Lifecycle & audit history');
  });

  it('emails first interviews and handles reschedule/cancellation', () => {
    const route = read('app/api/admin/interviews/route.ts');
    expect(route).toContain("import { sendLauremEmail } from '@/lib/laurem-email';");
    expect(route).toContain("event:'scheduled'");
    expect(route).toContain("const event=status==='Cancelled'?'cancelled':'rescheduled'");
    expect(route).toContain("event});");
    expect(route).toContain('Request payload is too large.');
    expect(route).toContain('Invalid JSON.');
  });

  it('creates second-stage invitations safely and prevents duplicate active links', () => {
    const route = read('app/api/admin/second-interviews/route.ts');
    const migration = read('supabase/migrations/20260910_laurem_atomic_second_interview_invitation.sql');
    expect(route).toContain("An active second-stage invitation already exists for this candidate.");
    expect(route).toContain("client.rpc('laurem_create_second_interview_invitation'");
    expect(route).toContain("status:409");
    expect(route).toContain("const pathway=app.living_in_uk==='No'?'international':'uk';");
    expect(route).toContain('second-interview:reissue:${invitation.id}');
    expect(migration).toContain('for update');
    expect(migration).toContain("raise exception 'active_second_interview_exists'");
    expect(migration).toContain('revoke all on function public.laurem_create_second_interview_invitation');
    expect(migration).toContain('from public, anon, authenticated');
  });

  it('hardens candidate document upload validation', () => {
    const route = read('app/api/documents/route.ts');
    expect(route).toContain('const MAX_FILE_BYTES = 10 * 1024 * 1024;');
    expect(route).toContain('extensionFor');
    expect(route).toContain('signatureMatches');
    expect(route).toContain('File extension does not match the declared document type.');
    expect(route).toContain('The uploaded file does not match its declared document type.');
    expect(route).toContain('upsert: false');
  });

  it('limits bulk invitations and reuses the canonical invitation helper', () => {
    const route = read('app/api/admin/invites/bulk/route.ts');
    const page = read('components/AdminBulkInvites.tsx');
    expect(route).toContain('const MAX_INVITES = 25;');
    expect(route).toContain('createAndSendLauremInvite');
    expect(page).toContain('name,email,role');
    expect(page).toContain('Maximum 25 candidates per run.');
  });

  it('does not expose CONAGS security-definer functions to public API roles', () => {
    const migration = read('supabase/migrations/20260910_laurem_security_definer_revoke_public_execute.sql');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('laurem_activate_staff_account');
    expect(migration).toContain('laurem_transition_application_status');
  });
});
