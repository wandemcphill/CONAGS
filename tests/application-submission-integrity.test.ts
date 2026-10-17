import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS application submission integrity', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_application_submission_integrity.sql'),
    'utf8',
  );
  const route = readFileSync(resolve(process.cwd(), 'app/api/applications/route.ts'), 'utf8');

  it('binds the submitted role to the invitation role', () => {
    expect(migration).toContain('INVITATION_ROLE_MISMATCH');
    expect(migration).toContain("lower(btrim(invite_row.role)) <> lower(payload_role)");
  });

  it('requires affirmative candidate consent at the database boundary', () => {
    expect(migration).toContain('CONSENT_REQUIRED');
    expect(migration).toContain("lower(coalesce(p_payload->>'consent', 'false')) = 'true'");
    expect(route).toContain('You must provide consent before submitting the application.');
  });

  it('keeps the new validation scoped to the CONAGS namespace', () => {
    expect(migration).toContain('public.laurem_recruitment_invites');
    expect(migration).toContain('public.laurem_recruitment_applications');
    expect(migration).not.toMatch(/public\.recruitment_/i);
  });
});
