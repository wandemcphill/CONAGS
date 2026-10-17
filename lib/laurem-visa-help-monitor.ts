export type VisaHelpMonitorSeverity = 'normal' | 'attention' | 'urgent';

export type VisaHelpMonitor = {
  severity: VisaHelpMonitorSeverity;
  daysToVisaExpiry: number | null;
  daysToNextRequiredTaskDue: number | null;
  overdueRequiredTasks: number;
  openRequiredTasks: number;
  nextAction: string;
  flags: string[];
};

function daysUntilDate(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return Math.floor((target - today) / 86400000);
}

function daysUntilTimestamp(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - now.getTime()) / 86400000);
}

export function monitorVisaHelpCase(input: {
  now?: Date;
  status?: string | null;
  currentVisaEndDate?: string | null;
  tasks?: Array<{
    title: string;
    required: boolean;
    status: 'open' | 'submitted' | 'verified' | 'rejected' | 'cancelled';
    dueAt?: string | null;
    due_at?: string | null;
    visibility?: 'staff' | 'internal';
  }>;
  legalTeamRequested?: boolean;
  recommendationDecision?: 'provisional' | 'requires_legal_review' | 'not_switchable' | null;
  legalReviewCompleted?: boolean;
}): VisaHelpMonitor {
  const now = input.now || new Date();
  const tasks = (input.tasks || []).filter(task => (task.visibility || 'staff') === 'staff' && task.required && task.status !== 'cancelled');
  const openRequiredTasks = tasks.filter(task => task.status !== 'verified').length;
  const overdueRequiredTasks = tasks.filter(task => {
    const due = daysUntilTimestamp(task.dueAt || task.due_at, now);
    return task.status !== 'verified' && due !== null && due < 0;
  }).length;
  const dueDays = tasks
    .map(task => task.status === 'verified' ? null : daysUntilTimestamp(task.dueAt || task.due_at, now))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[0] ?? null;
  const daysToVisaExpiry = daysUntilDate(input.currentVisaEndDate, now);

  const flags: string[] = [];
  if (daysToVisaExpiry !== null && daysToVisaExpiry < 0) flags.push('Current visa recorded as expired');
  else if (daysToVisaExpiry !== null && daysToVisaExpiry <= 7) flags.push('Current visa expires within 7 days');
  else if (daysToVisaExpiry !== null && daysToVisaExpiry <= 30) flags.push('Current visa expires within 30 days');
  else if (daysToVisaExpiry !== null && daysToVisaExpiry <= 60) flags.push('Current visa expires within 60 days');

  if (overdueRequiredTasks > 0) flags.push(overdueRequiredTasks + ' required case request' + (overdueRequiredTasks === 1 ? ' is' : 's are') + ' overdue');
  if (openRequiredTasks > 0 && !flags.some(flag => flag.includes('overdue'))) flags.push(openRequiredTasks + ' required case request' + (openRequiredTasks === 1 ? ' remains open' : 's remain open'));

  const needsLegalReview = Boolean(input.legalTeamRequested) || input.recommendationDecision === 'requires_legal_review' || input.recommendationDecision === 'not_switchable';
  if (needsLegalReview && !input.legalReviewCompleted) flags.push('Legal/support review remains open');

  let severity: VisaHelpMonitorSeverity = 'normal';
  if ((daysToVisaExpiry !== null && daysToVisaExpiry < 0) || overdueRequiredTasks > 0 || (daysToVisaExpiry !== null && daysToVisaExpiry <= 7)) {
    severity = 'urgent';
  } else if ((daysToVisaExpiry !== null && daysToVisaExpiry <= 30) || openRequiredTasks > 0 || (dueDays !== null && dueDays <= 7) || (needsLegalReview && !input.legalReviewCompleted)) {
    severity = 'attention';
  }

  let nextAction = 'No immediate deadline detected.';
  if (overdueRequiredTasks > 0) {
    const overdueTask = tasks.find(task => task.status !== 'verified' && daysUntilTimestamp(task.dueAt, now) !== null && (daysUntilTimestamp(task.dueAt, now) as number) < 0);
    nextAction = 'Resolve overdue request: ' + (overdueTask?.title || 'required case request') + '.';
  } else if (daysToVisaExpiry !== null && daysToVisaExpiry <= 7) {
    nextAction = 'Resolve the immigration case before the recorded current visa expiry date.';
  } else if (needsLegalReview && !input.legalReviewCompleted) {
    nextAction = 'Complete the internal legal/support review.';
  } else if (openRequiredTasks > 0) {
    const nextTask = tasks.find(task => task.status !== 'verified');
    nextAction = 'Complete the outstanding request: ' + (nextTask?.title || 'required case request') + '.';
  } else if (dueDays !== null && dueDays <= 30) {
    const dueTask = tasks.find(task => task.status !== 'verified' && daysUntilTimestamp(task.dueAt, now) !== null && (daysUntilTimestamp(task.dueAt, now) as number) === dueDays);
    nextAction = 'Review the upcoming request deadline' + (dueTask?.title ? ': ' + dueTask.title : '') + '.';
  } else if (daysToVisaExpiry !== null && daysToVisaExpiry <= 30) {
    nextAction = 'Review the immigration case before the current visa expiry date.';
  }

  return {
    severity,
    daysToVisaExpiry,
    daysToNextRequiredTaskDue: dueDays,
    overdueRequiredTasks,
    openRequiredTasks,
    nextAction,
    flags,
  };
}
