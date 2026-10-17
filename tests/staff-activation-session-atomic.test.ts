import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff activation/session atomicity', () => {
  it('moves activation and session creation into one database transaction', () => {
    const route = readFileSync('app/api/staff/auth/activate/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260919_staff_activation_session_atomic.sql', 'utf8');

    expect(route).toContain("laurem_activate_staff_account_with_session");
    expect(route).toContain("p_session_token_hash");
    expect(route).toContain("p_session_expires_at");
    expect(route).toContain("p_expected_session_version");
    expect(route).not.toContain(".from('staff_portal_sessions').insert");

    expect(migration).toContain("create or replace function public.laurem_activate_staff_account_with_session");
    expect(migration).toContain("from public.laurem_staff_profiles");
    expect(migration).toContain("for update");
    expect(migration).toContain("insert into public.laurem_staff_portal_sessions");
    expect(migration).toContain("staff.activation.completed");
    expect(migration).toContain("session_created");
    expect(migration).toContain("p_expected_session_version");
    expect(migration).toContain("revoke all on function");
  });

  it('keeps the activation boundary single-use and fail-closed', () => {
    const migration = readFileSync('supabase/migrations/20260919_staff_activation_session_atomic.sql', 'utf8');

    expect(migration).toContain("raise exception 'ACTIVATION_INVALID'");
    expect(migration).toContain("raise exception 'ACTIVATION_EXPIRED'");
    expect(migration).toContain("raise exception 'ACTIVATION_USED'");
    expect(migration).toContain("raise exception 'ACTIVATION_CHANGED'");
    expect(migration).toContain("activation_token_hash = p_token_hash");
  });
});
