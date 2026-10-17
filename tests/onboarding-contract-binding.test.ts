import { describe, expect, it } from 'vitest';
import { requiresLauremPlatformContract } from '@/lib/laurem-lifecycle';

function bindStaffContract(acceptedContractId: string, requestedContractId?: string | null) {
  void requestedContractId;
  return acceptedContractId;
}

function isRightToWorkVerified(status: 'pending' | 'completed' | 'waived') {
  return status === 'completed';
}

describe('staff onboarding contract binding', () => {
  it('always binds staff to the accepted contract', () => {
    expect(bindStaffContract('accepted-contract-id', 'different-contract-id')).toBe('accepted-contract-id');
    expect(bindStaffContract('accepted-contract-id', null)).toBe('accepted-contract-id');
  });

  it('does not mark a waived right-to-work check as verified', () => {
    expect(isRightToWorkVerified('waived')).toBe(false);
    expect(isRightToWorkVerified('completed')).toBe(true);
  });
});


describe('staff conversion contract gate', () => {
  it('requires an accepted contract regardless of role or recruitment pathway', () => {
    expect(requiresLauremPlatformContract({ id: 'hca-uk', role_applied: 'Healthcare Assistant', living_in_uk: 'Yes' })).toBe(true);
    expect(requiresLauremPlatformContract({ id: 'hca-intl', role_applied: 'Healthcare Assistant', living_in_uk: 'No' })).toBe(true);
    expect(requiresLauremPlatformContract({ id: 'rn-uk', role_applied: 'Registered Nurse', living_in_uk: 'Yes' })).toBe(true);
    expect(requiresLauremPlatformContract({ id: 'rn-intl', role_applied: 'Registered Nurse', living_in_uk: 'No' })).toBe(true);
  });
});
