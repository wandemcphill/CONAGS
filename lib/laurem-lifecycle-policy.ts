export const LAUREM_APPLICATION_STATUSES = [
  'Enquiry', 'Invited', 'Application', 'Screening', 'Interview',
  'Second Interview', 'Documents', 'Sponsorship', 'Offer', 'Onboarding',
  'Hired', 'Rejected', 'Withdrawn',
] as const;

export type LauremApplicationStatus = (typeof LAUREM_APPLICATION_STATUSES)[number];
export const LAUREM_APPLICATION_TERMINAL_STATES = ['Rejected', 'Withdrawn'] as const;

export const LAUREM_APPLICATION_TRANSITIONS: Record<LauremApplicationStatus, readonly LauremApplicationStatus[]> = {
  Enquiry: ['Invited', 'Rejected', 'Withdrawn'],
  Invited: ['Application', 'Rejected', 'Withdrawn'],
  Application: ['Screening', 'Rejected', 'Withdrawn'],
  Screening: ['Interview', 'Documents', 'Rejected', 'Withdrawn'],
  Interview: ['Second Interview', 'Documents', 'Offer', 'Rejected', 'Withdrawn'],
  'Second Interview': ['Documents', 'Offer', 'Rejected', 'Withdrawn'],
  Documents: ['Sponsorship', 'Offer', 'Onboarding', 'Rejected', 'Withdrawn'],
  Sponsorship: ['Offer', 'Rejected', 'Withdrawn'],
  Offer: ['Onboarding', 'Rejected', 'Withdrawn'],
  Onboarding: ['Hired', 'Rejected', 'Withdrawn'],
  Hired: [],
  Rejected: [],
  Withdrawn: [],
};

export const LAUREM_STAFF_EMPLOYMENT_STATUSES = ['pending', 'active', 'suspended', 'leaver'] as const;
export type LauremStaffEmploymentStatus = (typeof LAUREM_STAFF_EMPLOYMENT_STATUSES)[number];

export const LAUREM_STAFF_EMPLOYMENT_TRANSITIONS: Record<LauremStaffEmploymentStatus, readonly LauremStaffEmploymentStatus[]> = {
  pending: ['active'],
  active: ['suspended', 'leaver'],
  suspended: ['active', 'leaver'],
  leaver: [],
};

export function isLauremApplicationStatus(value: string): value is LauremApplicationStatus {
  return (LAUREM_APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function isLauremStaffEmploymentStatus(value: string): value is LauremStaffEmploymentStatus {
  return (LAUREM_STAFF_EMPLOYMENT_STATUSES as readonly string[]).includes(value);
}

export function isLauremApplicationTransitionAllowed(from: string, to: string, options: { override?: boolean } = {}) {
  if (!isLauremApplicationStatus(from) || !isLauremApplicationStatus(to)) return false;
  if (from === to) return true;
  if (LAUREM_APPLICATION_TRANSITIONS[from].includes(to)) return true;
  return options.override === true && (LAUREM_APPLICATION_TERMINAL_STATES as readonly string[]).includes(from);
}

export function isLauremStaffEmploymentTransitionAllowed(from: string, to: string) {
  if (!isLauremStaffEmploymentStatus(from) || !isLauremStaffEmploymentStatus(to)) return false;
  if (from === to) return true;
  return LAUREM_STAFF_EMPLOYMENT_TRANSITIONS[from].includes(to);
}

export const LAUREM_STAFF_LIFECYCLE_REPAIR_ACTION =
  'Re-run the gated admin onboarding flow; it is idempotent and can recreate or bind the workforce identity for eligible historical records.';
