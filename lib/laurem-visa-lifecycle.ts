export const LAUREM_VISA_STATUSES = [
  'requested',
  'admin_review',
  'awaiting_payment',
  'preparing_sms',
  'submitted_to_sms',
  'cos_pending',
  'cos_assigned',
  'completed',
  'declined',
  'withdrawn',
] as const;

export type LauremVisaStatus = (typeof LAUREM_VISA_STATUSES)[number];

const NEXT_VISA_STATUSES: Record<LauremVisaStatus, readonly LauremVisaStatus[]> = {
  requested: ['admin_review', 'awaiting_payment', 'preparing_sms', 'declined', 'withdrawn'],
  admin_review: ['awaiting_payment', 'preparing_sms', 'declined', 'withdrawn'],
  awaiting_payment: ['preparing_sms', 'declined', 'withdrawn'],
  preparing_sms: ['submitted_to_sms', 'declined', 'withdrawn'],
  submitted_to_sms: ['cos_pending', 'cos_assigned', 'declined', 'withdrawn'],
  cos_pending: ['cos_assigned', 'declined', 'withdrawn'],
  cos_assigned: ['completed', 'declined', 'withdrawn'],
  completed: [],
  declined: [],
  withdrawn: [],
};

export class LauremVisaLifecycleError extends Error {
  constructor(public readonly from: LauremVisaStatus, public readonly to: LauremVisaStatus) {
    super(`Invalid CONAGS visa case transition: ${from} -> ${to}.`);
    this.name = 'LauremVisaLifecycleError';
  }
}

export function isLauremVisaStatus(value: string): value is LauremVisaStatus {
  return (LAUREM_VISA_STATUSES as readonly string[]).includes(value);
}

export function canTransitionLauremVisaCase(from: LauremVisaStatus, to: LauremVisaStatus): boolean {
  return from === to || NEXT_VISA_STATUSES[from].includes(to);
}

export function isLauremVisaTerminalStatus(status: LauremVisaStatus) {
  return status === 'completed' || status === 'declined' || status === 'withdrawn';
}

export function canAssignLauremVisaCoS(status: LauremVisaStatus) {
  return status === 'awaiting_payment' || status === 'preparing_sms' || status === 'submitted_to_sms' || status === 'cos_pending' || status === 'cos_assigned';
}

export function assertLauremVisaCoSAssignment(status: LauremVisaStatus) {
  if (!canAssignLauremVisaCoS(status)) {
    throw new LauremVisaLifecycleError(status, 'cos_assigned');
  }
}

export function assertLauremVisaStatusTransition(from: LauremVisaStatus, to: LauremVisaStatus) {
  if (!canTransitionLauremVisaCase(from, to)) throw new LauremVisaLifecycleError(from, to);
}
