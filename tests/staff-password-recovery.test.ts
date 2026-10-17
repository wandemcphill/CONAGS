import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

describe('CONAGS staff password recovery parity', () => {
  it('provides a rate-limited, non-enumerating reset flow', () => {
    const route = readFileSync('app/api/staff/auth/password-reset/route.ts', 'utf8');
    const login = readFileSync('app/staff/login/page.tsx', 'utf8');
    const migration = readFileSync('supabase/migrations/20260919_staff_password_reset.sql', 'utf8');
    const atomicMigration = readFileSync('supabase/migrations/20260919_staff_password_reset_atomic.sql', 'utf8');
    const issuanceMigration = readFileSync('supabase/migrations/20260919_staff_password_reset_issuance_atomic.sql', 'utf8');

    expect(route).toContain('GENERIC_MESSAGE');
    expect(route).toContain('staff-password-reset-ip');
    expect(route).toContain('staff-password-reset-email:');
    expect(route).toContain('laurem_complete_staff_password_reset');
    expect(route).toContain('staff-password-reset-complete-ip:');
    expect(route).toContain('staff-password-reset-token:');
    expect(route).not.toContain("consumeThrottle(client, 'staff-password-reset-complete'");
    expect(route).toContain('laurem_issue_staff_password_reset');
    expect(route).not.toContain(".from('staff_password_reset_tokens').update");
    expect(route).not.toContain(".from('staff_password_reset_tokens').insert");
    expect(issuanceMigration).toContain('consumed_at');
    expect(login).toContain('/staff/password-reset');
    expect(migration).toContain('laurem_staff_password_reset_tokens');
    expect(migration).toContain('enable row level security');
    expect(atomicMigration).toContain('laurem_complete_staff_password_reset');
    expect(atomicMigration).toContain('for update');
    expect(atomicMigration).toContain('session_version');
    expect(issuanceMigration).toContain('for update');
    expect(issuanceMigration).toContain('staff_password_reset_tokens');
    expect(issuanceMigration).toContain('grant execute on function public.laurem_issue_staff_password_reset');
  });

  it('keeps the password reset UI available from the private staff portal', () => {
    expect(existsSync('app/staff/password-reset/page.tsx')).toBe(true);
    expect(readFileSync('app/staff/password-reset/page.tsx', 'utf8')).toContain('Change password');
  });
});
