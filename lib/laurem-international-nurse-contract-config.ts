export const lauremInternationalNurseContractConfig = {
  contractType: 'international_nurse' as const,
  title: 'International Registered Nurse Contract of Employment',
  jurisdiction: 'Scotland, United Kingdom',
  defaultWeeklyHours: 37.5,
  defaultAnnualSalaryBenchmark: 34544,
  defaultVisaRoute: 'Health and Care Worker visa',
  repaymentPrinciples: ['transparency', 'proportionate costs', 'timing', 'flexibility'] as const,
  excludedRecruitmentCosts: [
    'agency/recruitment fees charged by the employer',
    'Immigration Skills Charge',
    'sponsor licence fee',
    'Certificate of Sponsorship cost',
    'interview/recruitment process costs',
  ] as const,
  sourceNotes: [
    'UK written statement requirements',
    'Scottish Code of Practice for international recruitment of health and social care personnel',
    'Health and Care Worker / Skilled Worker sponsorship requirements',
    'NMC overseas registration requirements',
  ] as const,
} as const;

export type InternationalNurseContractConfig = typeof lauremInternationalNurseContractConfig;
