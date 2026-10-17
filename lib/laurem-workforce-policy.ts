export const LEAVE_TYPES = ['annual', 'sick', 'family', 'unpaid', 'other'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['cancelled'],
  rejected: [],
  cancelled: [],
};

export const TIMESHEET_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['paid'],
  rejected: ['submitted'],
  paid: [],
};

export const PAYROLL_PERIOD_TRANSITIONS: Record<string, readonly string[]> = {
  open: ['processing'],
  processing: ['closed'],
  closed: [],
};

export function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function inclusiveCalendarDays(start: string, end: string): number | null {
  if (!isDateOnly(start) || !isDateOnly(end)) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Number(((b - a) / 86_400_000 + 1).toFixed(2));
}

export function transitionAllowed(
  transitions: Record<string, readonly string[]>,
  current: string,
  next: string,
) {
  return transitions[current]?.includes(next) ?? false;
}

export function isMutableTimesheetStatus(status: string) {
  return status === 'draft' || status === 'submitted' || status === 'rejected';
}

export function isLockedPayrollStatus(status: string) {
  return status === 'processing' || status === 'closed';
}
