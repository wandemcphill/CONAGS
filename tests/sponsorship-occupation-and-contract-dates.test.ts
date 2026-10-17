import { describe, expect, it } from 'vitest';
import { getLauremSponsorshipOccupation } from '@/lib/laurem-sponsorship-occupation';
import {
  enforceMinimumLauremContractStartDate,
  calculateThreeYearContractEndDate,
} from '@/lib/laurem-contract-dates';
import { renderLauremContract } from '@/lib/laurem-contract';

describe('CONAGS sponsorship occupation mapping', () => {
  it.each([
    ['Healthcare Assistant', '6131', 'Nursing auxiliaries and assistants'],
    ['Support Worker', '6135', 'Care workers and home carers'],
    ['Senior Support Worker', '6136', 'Senior care workers'],
    ['Registered Nurse', '2237', 'Other registered nursing professionals'],
    ['Physiotherapist', '2221', 'Physiotherapists'],
  ])('maps %s to SOC %s', (role, code, title) => {
    expect(getLauremSponsorshipOccupation(role)).toMatchObject({ code, title });
  });

  it('does not expose one universal occupation code', () => {
    const codes = [
      'Healthcare Assistant',
      'Support Worker',
      'Senior Support Worker',
      'Registered Nurse',
      'Physiotherapist',
    ].map((role) => getLauremSponsorshipOccupation(role)?.code);
    expect(new Set(codes).size).toBe(5);
  });
});

describe('CONAGS contract start date policy', () => {
  it('enforces 23 November 2026 as the minimum contract start date', () => {
    expect(enforceMinimumLauremContractStartDate(null)).toBe('2026-11-23');
    expect(enforceMinimumLauremContractStartDate('2026-11-22')).toBe('2026-11-23');
    expect(enforceMinimumLauremContractStartDate('2026-11-23')).toBe('2026-11-23');
    expect(enforceMinimumLauremContractStartDate('2027-01-11')).toBe('2027-01-11');
  });

  it('uses the enforced start date when calculating the sponsored three-year term', () => {
    const startDate = enforceMinimumLauremContractStartDate(null);
    expect(calculateThreeYearContractEndDate(startDate)).toBe('2029-11-23');
  });

  it('prints a clearly labelled start date and role-specific SOC code in the contract', () => {
    const content = renderLauremContract({
      employeeName: 'Test Employee',
      jobTitle: 'Support Worker',
      startDate: '2026-11-23',
      sponsorshipOccupationCode: '6135',
      sponsorshipOccupationTitle: 'Care workers and home carers',
    });
    expect(content).toContain('Start date: 23 November 2026');
    expect(content).toContain('Sponsorship occupation code: 6135 (Care workers and home carers).');
  });
});
