import { describe, expect, it } from 'vitest';
import {
  LauremLifecycleError,
  assertLauremContractRole,
  assertLauremStaffContractBinding,
} from '@/lib/laurem-lifecycle';
import {
  isLauremApplicationTransitionAllowed,
  isLauremStaffEmploymentTransitionAllowed,
} from '@/lib/laurem-lifecycle-policy';

describe('CONAGS lifecycle policy', () => {
  it('accepts matching canonical application and contract roles', () => {
    expect(() => assertLauremContractRole(
      { id: 'a', role_applied: 'Registered Nurse - International Recruitment' },
      { id: 'c', status: 'accepted', job_title: 'Registered Nurse' },
    )).not.toThrow();
  });

  it('rejects mismatched application and contract roles', () => {
    expect(() => assertLauremContractRole(
      { id: 'a', role_applied: 'Support Worker' },
      { id: 'c', status: 'accepted', job_title: 'Registered Nurse' },
    )).toThrowError(LauremLifecycleError);
  });

  it('allows an unbound legacy staff profile to be bound to the accepted contract', () => {
    expect(() => assertLauremStaffContractBinding(
      { id: 's', contract_id: null },
      { id: 'c', status: 'accepted', job_title: 'Support Worker' },
    )).not.toThrow();
  });

  it('rejects a staff profile bound to a different contract', () => {
    expect(() => assertLauremStaffContractBinding(
      { id: 's', contract_id: 'old-contract' },
      { id: 'new-contract', status: 'accepted', job_title: 'Support Worker' },
    )).toThrowError(LauremLifecycleError);
  });

  it('uses one shared application and staff status policy', () => {
    expect(isLauremApplicationTransitionAllowed('Offer', 'Onboarding')).toBe(true);
    expect(isLauremApplicationTransitionAllowed('Rejected', 'Offer')).toBe(false);
    expect(isLauremApplicationTransitionAllowed('Rejected', 'Offer', { override: true })).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('pending', 'active')).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('leaver', 'active')).toBe(false);
  });
});
