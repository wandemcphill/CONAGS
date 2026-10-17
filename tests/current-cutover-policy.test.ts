import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('current CONAGS cutover policy', () => {
  const cleanup = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_empty_cutover_cleanup.sql'),
    'utf8',
  );
  const guard = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_namespace_baseline_guard.sql'),
    'utf8',
  );
  const architecture = readFileSync(
    resolve(process.cwd(), 'docs/SHARED-SUPABASE-ARCHITECTURE.md'),
    'utf8',
  );

  it('keeps the current cutover cleanup scoped to CONAGS-owned tables', () => {
    expect(cleanup).not.toMatch(/\b(from|into|update|delete\s+from|truncate)\s+public\.recruitment_/i);
    expect(cleanup).toContain('delete from public.laurem_recruitment_applications;');
    expect(cleanup).toContain('delete from public.laurem_staff_profiles;');
    expect(cleanup).toContain('delete from public.laurem_notification_deliveries;');
  });

  it('requires the complete CONAGS namespace to be empty at first launch', () => {
    expect(guard).toContain('LAUREM_EMPTY_BASELINE_VIOLATION');
    expect(guard).toContain('public.laurem_recruitment_invites');
    expect(guard).toContain('public.laurem_recruitment_applications');
    expect(guard).toContain('public.laurem_staff_profiles');
    expect(guard).toContain('public.laurem_staff_leave_requests');
    expect(guard).toContain('public.laurem_payroll_entries');
    expect(guard).toContain('public.laurem_notification_deliveries');
  });

  it('documents the historical migration as non-importable legacy SQL', () => {
    expect(architecture).toContain('historical isolation migration contains legacy bootstrap-copy SQL');
    expect(architecture).toContain('must not be repurposed as a data-import mechanism');
    expect(architecture).toContain('CONAGS starts with zero application/recruitment/workforce rows');
  });
});
