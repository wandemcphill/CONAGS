import { lauremCompany, supportsInternationalNurseRecruitment } from '@/lib/laurem-company-config';

export const recruitmentConfig = {
  statusFlow: [
    'Enquiry',
    'Invited',
    'Application',
    'Screening',
    'Interview',
    'Second Interview',
    'Documents',
    'Sponsorship',
    'Offer',
    'Onboarding',
    'Hired',
    'Rejected',
    'Withdrawn',
  ] as const,
  candidatePathways: [
    { id: 'uk', label: 'UK applicant', description: 'I already live in the UK and will provide evidence of my right to work.' },
    { id: 'international', label: 'International applicant', description: 'I am applying from outside the UK and may require sponsorship and relocation support.' },
  ] as const,
  registrationFields: {
    nurse: ['NMC number', 'RCN number', 'Nursing band / grade', 'Registration evidence'],
    care: ['Relevant care experience', 'Mandatory training evidence'],
  },
} as const;

export type RecruitmentStatus = (typeof recruitmentConfig.statusFlow)[number];
export type RecruitmentPathway = (typeof recruitmentConfig.candidatePathways)[number]['id'];

export function pathwaySupportsRole(pathway: RecruitmentPathway, role: string): boolean {
  if (pathway === 'international') return supportsInternationalNurseRecruitment(role);
  return true;
}

export function requiresSponsorshipReview(pathway: RecruitmentPathway, role: string): boolean {
  return pathway === 'international' && supportsInternationalNurseRecruitment(role);
}

export function publicRecruitmentEmail(): string {
  return lauremCompany.publicEmails.recruitment;
}
