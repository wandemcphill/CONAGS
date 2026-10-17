import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS empty production baseline guard', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_namespace_baseline_guard.sql'),
    'utf8',
  );

  it('checks the complete CONAGS-owned namespace', () => {
    expect(migration).toContain('public.laurem_recruitment_invites');
    expect(migration).toContain('public.laurem_recruitment_applications');
    expect(migration).toContain('public.laurem_recruitment_interviews');
    expect(migration).toContain('public.laurem_staff_profiles');
    expect(migration).toContain('public.laurem_staff_messages');
    expect(migration).toContain('public.laurem_notification_deliveries');
    expect(migration).toContain('public.laurem_legacy_contract_signatures');
    expect(migration).toContain("LAUREM_EMPTY_BASELINE_VIOLATION");
  });

  it('does not mutate BIMED/shared recruitment tables', () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.recruitment_/i);
    expect(migration).not.toMatch(/update\s+public\.recruitment_/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.recruitment_/i);
    expect(migration).not.toMatch(/truncate\s+.*public\.recruitment_/i);
  });
});
