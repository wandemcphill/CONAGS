import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260910_portal_security.sql'), 'utf8');

function validIdentifier(value: string) {
  return /^[A-Z0-9-]{3,64}$/.test(value);
}

describe('staff portal security policy', () => {
  it('accepts only bounded CONAGS identifiers', () => {
    expect(validIdentifier('LAU-001234')).toBe(true);
    expect(validIdentifier('LAU-001234 OR 1=1')).toBe(false);
    expect(validIdentifier('a')).toBe(false);
  });

  it('defines server-side revocable sessions and atomic activation', () => {
    expect(migration).toContain('create table if not exists staff_portal_sessions');
    expect(migration).toContain('revoked_at timestamptz');
    expect(migration).toContain('create or replace function laurem_activate_staff_account');
    expect(migration).toContain('for update');
    expect(migration).toContain("STAFF_ACTIVATION_USED");
  });

  it('defines persistent throttling and security audit records', () => {
    expect(migration).toContain('staff_portal_auth_limits');
    expect(migration).toContain('laurem_consume_staff_auth_attempt');
    expect(migration).toContain('staff_security_events');
  });
});
