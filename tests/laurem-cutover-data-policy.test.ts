import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS production cutover data policy', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_empty_cutover_cleanup.sql'),
    'utf8',
  );

  it('never mutates the shared/BIMED source tables', () => {
    expect(migration).not.toMatch(/from public\.recruitment_/i);
    expect(migration).not.toMatch(/update public\.recruitment_/i);
    expect(migration).not.toMatch(/delete from public\.recruitment_/i);
    expect(migration).not.toMatch(/truncate.*public\.recruitment_/i);
  });

  it('clears only the CONAGS physical namespace at cutover', () => {
    expect(migration).toContain('delete from public.laurem_recruitment_invites;');
    expect(migration).toContain('delete from public.laurem_recruitment_applications;');
    expect(migration).toContain('delete from public.laurem_recruitment_interviews;');
    expect(migration).toContain('delete from public.laurem_recruitment_second_interviews;');
    expect(migration).toContain('delete from public.laurem_legacy_contract_signatures;');
  });
});
