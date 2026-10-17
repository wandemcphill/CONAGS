import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS hired employment package and activation', () => {
  it('routes Onboarding → Hired through the atomic portal provisioning boundary', () => {
    const source = readFileSync('app/api/admin/applications/hire/route.ts', 'utf8');
    expect(source).toContain("client.rpc('laurem_hire_application_atomic'");
    expect(source).toContain('makeActivationToken');
    expect(source).toContain('hashActivationToken(rawActivationToken)');
    expect(source).toContain('sendLauremStaffActivation');
    expect(source).toContain('provisionLauremStaffPortal(id, session.email)');
    expect(source).not.toContain("p_to_status: 'Hired'");
  });

  it('redirects reused activation links to staff login', () => {
    const route = readFileSync('app/api/staff/auth/activate/route.ts', 'utf8');
    const form = readFileSync('app/staff/activate/ActivationForm.tsx', 'utf8');
    const login = readFileSync('app/staff/login/page.tsx', 'utf8');
    expect(route).toContain('ACTIVATION_USED');
    expect(route).toContain('/staff/login?activation=used');
    expect(form).toContain("router.replace('/staff/login?activation=used')");
    expect(form).toContain("router.replace('/staff?activated=1')");
    expect(login).toContain('That activation link has already been used.');
  });

  it('keeps activation and employment documents out of onboarding preparation', () => {
    const source = readFileSync('app/api/admin/onboarding/route.ts', 'utf8');
    expect(source).not.toContain('provisionLauremStaffPortal');
    expect(source).toContain('activationDeferredUntilHired');
    expect(source).toContain('employmentDocumentsIssuedAtHired');
  });

  it('contains the atomic hire package migration and keeps it service-role only', () => {
    const sql = readFileSync('supabase/migrations/20260920_hire_employment_package_activation.sql', 'utf8');
    expect(sql).toContain('laurem_issue_staff_employment_document_package');
    expect(sql).toContain("employment_status in ('pending','active')");
    expect(sql).toContain("status='accepted'");
    expect(sql).toContain('revoke all on function public.laurem_issue_staff_employment_document_package');
    expect(sql).toContain('grant execute on function public.laurem_issue_staff_employment_document_package');
  });

  it('enforces atomic hire rollback and prevents invalid manual activation', () => {
    const atomic = readFileSync('supabase/migrations/20260925120000_atomic_hire_portal_provisioning.sql', 'utf8');
    const workforce = readFileSync('app/api/admin/workforce/staff/[staffId]/route.ts', 'utf8');

    expect(atomic).toContain('laurem_hire_application_atomic');
    expect(atomic).toContain('laurem_staff_activation_status_guard');
    expect(atomic).toContain('laurem_staff_internal_mailboxes_handle_namespace_key');
    expect(atomic).toContain("    'Hired',\n    p_actor,");
    expect(atomic).toContain('STAFF_PORTAL_STATE_BLOCKED');
    expect(workforce).toContain("client.rpc('laurem_change_staff_employment_status'");
    expect(workforce).toContain('STAFF_ACTIVATION_REQUIRED');
    expect(workforce).toContain('one-time activation link');
  });
});