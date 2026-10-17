import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Mega-Build 21 staff account lifecycle', () => {
  it('introduces a durable one-time activation marker and atomic issuance path', () => {
    const migration = readFileSync('supabase/migrations/20260921124500_staff_portal_account_lifecycle_hardening.sql', 'utf8');
    expect(migration).toContain('activation_used_at timestamptz');
    expect(migration).toContain('laurem_issue_staff_activation_token');
    expect(migration).toContain("staff.activation.issued");
    expect(migration).toContain("'reissued', was_previous_activation_used");
  });

  it('retains the activation hash so a reused link can resolve to the used state', () => {
    const migration = readFileSync('supabase/migrations/20260921124500_staff_portal_account_lifecycle_hardening.sql', 'utf8');
    expect(migration).toContain("activation_used_at = now_value");
    expect(migration).toContain("raise exception 'ACTIVATION_USED'");
    expect(migration).not.toContain('activation_token_hash = null');
  });

  it('allows activated pending and active staff accounts to use the portal', () => {
    const auth = readFileSync('lib/laurem-staff-auth.ts', 'utf8');
    const login = readFileSync('app/api/staff/auth/login/route.ts', 'utf8');
    // Activated pending candidates must be able to sign in to complete onboarding; hiring remains separate.
    expect(auth).toContain("!['pending', 'active'].includes(staff.employment_status)");
    expect(auth).toContain('!staff.activated_at');
    expect(auth).toContain('!staff.password_hash');
    expect(login).toContain("!['pending', 'active'].includes(staff.employment_status)");
    expect(login).not.toContain("staff.employment_status !== 'active'");
    expect(login).toContain('!staff.activated_at');
    expect(login).toContain('!staff.password_hash');
  });

  it('uses the production portal URL as the activation-email fallback', () => {
    const email = readFileSync('lib/laurem-staff-email.ts', 'utf8');
    expect(email).toContain("process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com'");
    expect(email).not.toContain("process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'");
  });


  it('prevents admin promotion of a never-activated pending account', () => {
    const route = readFileSync('app/api/admin/workforce/staff/route.ts', 'utf8');
    expect(route).toContain('isLauremStaffEmploymentStatus');
    expect(route).toContain("client.rpc('laurem_change_staff_employment_status'");
    expect(route).toContain("p_next_status: nextStatus");
    expect(route).not.toContain("employment_status = 'active'");
  });

  it('provides a controlled activation recovery path for an activated pending Onboarding account', () => {
    const route = readFileSync('app/api/admin/workforce/staff/account/route.ts', 'utf8');
    expect(route).toContain("action !== 'reissue_activation'");
    expect(route).toContain('reason.length < 5');
    expect(route).toContain('provisionLauremStaffPortal');
    expect(route).toContain('laurem_recover_activated_pending_onboarding_staff_portal');
    expect(route).toContain("application.status !== 'Onboarding'");
    expect(route).toContain('previousActivationRevoked: true');
    expect(route).toContain("employmentStatusPreserved: 'pending'");
    expect(route).toContain('activation_reissued');
    expect(route).toContain('p_token_hash: hashActivationToken(rawToken)');
    expect(route).not.toContain('activation: { url:');
  });

  it('repairs a stale Onboarding pending account through the canonical atomic hire boundary', () => {
    const provision = readFileSync('lib/laurem-staff-provision.ts', 'utf8');
    expect(provision).toContain('completePendingLauremHireAndIssueActivation');
    expect(provision).toContain("applicationId,");
    expect(provision).toContain("client.rpc('laurem_hire_application_atomic'");
    expect(provision).toContain("staff.employment_status !== 'pending'");
    expect(provision).toContain('staff.activated_at');
    expect(provision).toContain('staff.password_hash');
    expect(provision).toContain('sendLauremStaffActivation');
  });

  it('invalidates all persisted sessions when credentials change', () => {
    const migration = readFileSync('supabase/migrations/20260921124500_staff_portal_account_lifecycle_hardening.sql', 'utf8');
    expect(migration).toContain('laurem_change_staff_password');
    expect(migration).toContain("event_type,");
    expect(migration).toContain("'staff.password.changed'");
    expect(migration).toContain("set revoked_at = now_value");
    expect(migration).toContain("set consumed_at = now_value");
  });

  it('extends release readiness to the new staff account-control RPCs', () => {
    const migration = readFileSync('supabase/migrations/20260921133000_staff_release_readiness_contract.sql', 'utf8');
    expect(migration).toContain('laurem_issue_staff_activation_token');
    expect(migration).toContain('laurem_change_staff_password');
    expect(migration).toContain('required_function_count');
    expect(migration).toContain("set search_path = ''");
  });

  it('exposes an authenticated password-change surface', () => {
    const route = readFileSync('app/api/staff/auth/change-password/route.ts', 'utf8');
    const page = readFileSync('app/staff/change-password/page.tsx', 'utf8');
    expect(route).toContain('getStaffSession');
    expect(route).toContain('verifyPassword');
    expect(route).toContain('laurem_change_staff_password');
    expect(route).toContain('clearStaffSession');
    expect(page).toContain('/api/staff/auth/change-password');
    expect(page).toContain('currentPassword');
    expect(page).toContain('confirmPassword');
  });
});
