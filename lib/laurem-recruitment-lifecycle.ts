export const LAUREM_RECRUITMENT_STATUSES = [
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
] as const;

export type LauremRecruitmentStatus = typeof LAUREM_RECRUITMENT_STATUSES[number];

export function isLauremRecruitmentStatus(value: string): value is LauremRecruitmentStatus {
  return (LAUREM_RECRUITMENT_STATUSES as readonly string[]).includes(value);
}