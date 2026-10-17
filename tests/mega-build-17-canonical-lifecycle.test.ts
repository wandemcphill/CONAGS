import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LAUREM_APPLICATION_TERMINAL_STATES,
  isLauremApplicationTransitionAllowed,
  isLauremStaffEmploymentTransitionAllowed,
} from '@/lib/laurem-lifecycle-policy';

describe('CONAGS canonical lifecycle policy', () => {
  it('allows the canonical employment sequence and same-state idempotency', () => {
    expect(isLauremApplicationTransitionAllowed('Offer', 'Onboarding')).toBe(true);
    expect(isLauremApplicationTransitionAllowed('Onboarding', 'Hired')).toBe(true);
    expect(isLauremApplicationTransitionAllowed('Hired', 'Hired')).toBe(true);
    expect(isLauremApplicationTransitionAllowed('Hired', 'Onboarding')).toBe(false);
  });

  it('requires explicit override for terminal-state re-entry', () => {
    expect(isLauremApplicationTransitionAllowed('Rejected', 'Offer')).toBe(false);
    expect(isLauremApplicationTransitionAllowed('Rejected', 'Offer', { override: true })).toBe(true);
    expect(LAUREM_APPLICATION_TERMINAL_STATES).toEqual(['Rejected', 'Withdrawn']);
  });

  it('keeps staff employment transitions explicit and non-reentrant', () => {
    expect(isLauremStaffEmploymentTransitionAllowed('pending', 'active')).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('active', 'suspended')).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('leaver', 'active')).toBe(false);
    expect(isLauremStaffEmploymentTransitionAllowed('active', 'pending')).toBe(false);
  });

  it('defines the database policy boundary and all four guarded transitions', () => {
    const migration = readFileSync('supabase/migrations/20260921002000_canonical_lifecycle_policy.sql', 'utf8');
    expect(migration).toContain('laurem_evaluate_staff_lifecycle');
    for (const transition of ['prepare_onboarding', 'mark_hired', 'portal_provision', 'portal_activate']) {
      expect(migration).toContain(transition);
    }
    expect(migration).toContain('laurem_normalize_role');
    expect(migration).toContain('set search_path = public');
  });

  it('keeps the main route entry points on the same policy boundary', () => {
    const hire = readFileSync('app/api/admin/applications/hire/route.ts', 'utf8');
    const provision = readFileSync('lib/laurem-staff-provision.ts', 'utf8');
    const activationMigration = readFileSync('supabase/migrations/20260921002000_canonical_lifecycle_policy.sql', 'utf8');
    const staffAdmin = readFileSync('app/api/admin/workforce/staff/route.ts', 'utf8');
    expect(hire).toContain('validateLauremStaffTransition');
    expect(provision).toContain("laurem_evaluate_staff_lifecycle");
    expect(activationMigration).toContain("'portal_activate'");
    expect(staffAdmin).toContain('isLauremStaffEmploymentStatus');
    expect(staffAdmin).toContain("client.rpc('laurem_change_staff_employment_status'");
  });
});