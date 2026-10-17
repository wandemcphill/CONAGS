export type LauremHandbookAudience =
  | 'sponsored_hca'
  | 'international_nurse';

export const lauremHandbookConfig = {
  sponsoredHca: {
    audience: 'sponsored_hca' as const,
    title: 'Conags Sponsored Healthcare Assistant Handbook',
    documentPath: 'docs/handbooks/laurem-sponsored-hca-handbook.md',
    immigrationNotice:
      'New overseas entry clearance sponsorship for care worker and senior care worker roles is closed from 22 July 2025. In-country sponsorship remains subject to the transitional immigration rules.',
    requiredAcknowledgements: [
      'handbook',
      'employment_contract',
      'safeguarding',
      'mandatory_training',
      'right_to_work',
      'pvG_or_applicable_disclosure',
    ] as const,
  },
  internationalNurse: {
    audience: 'international_nurse' as const,
    title: 'Conags Overseas Registered Nurse Handbook',
    documentPath: 'docs/handbooks/laurem-overseas-nurse-handbook.md',
    welcomePackagePath: 'docs/handbooks/laurem-overseas-nurse-welcome-package.md',
    requiredAcknowledgements: [
      'handbook',
      'welcome_package',
      'employment_contract',
      'sponsorship_information',
      'nmc_pathway',
      'safeguarding',
      'mandatory_training',
      'right_to_work',
    ] as const,
    welcomePackage: {
      preArrival: true,
      airportArrival: true,
      accommodation: true,
      payrollAndBanking: true,
      nationalInsuranceSignposting: true,
      ukviAndRightToWork: true,
      gpAndHealthcare: true,
      localOrientation: true,
      nmcSupport: true,
      clinicalInduction: true,
      buddyOrMentor: true,
      familySupport: true,
      communitySupport: true,
      antiExploitationGuidance: true,
      firstThirtyDaysChecklist: true,
    },
  },
} as const;

export function getLauremHandbookForAudience(audience: LauremHandbookAudience) {
  return audience === 'international_nurse'
    ? lauremHandbookConfig.internationalNurse
    : lauremHandbookConfig.sponsoredHca;
}
