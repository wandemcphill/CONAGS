export type WorkforceReadinessLevel = 'ready' | 'attention' | 'blocked';

export type WorkforceReadinessLane = {
  key: 'assignment' | 'attendance' | 'timesheet' | 'leave' | 'payroll';
  level: WorkforceReadinessLevel;
  label: string;
  detail: string;
  count: number;
};

export type WorkforceReadiness = {
  overall: WorkforceReadinessLevel;
  activeStaff: boolean;
  lanes: WorkforceReadinessLane[];
  nextAction: string | null;
};

export function buildWorkforceReadiness(input: {
  active: boolean;
  scheduledAssignments: number;
  openAttendance: number;
  overdueAttendance: number;
  submittedTimesheets: number;
  rejectedTimesheets: number;
  pendingLeave: number;
  payrollEntryMissingRate: number;
  payrollEntryDraft: number;
}): WorkforceReadiness {
  const lanes: WorkforceReadinessLane[] = [
    {
      key: 'assignment',
      level: !input.active ? 'blocked' : 'ready',
      label: 'Assignments',
      detail: !input.active
        ? 'Staff is not active and cannot hold new scheduled or confirmed assignments.'
        : input.scheduledAssignments > 0
          ? String(input.scheduledAssignments) + ' upcoming scheduled/confirmed assignment(s).'
          : 'No upcoming scheduled or confirmed assignment.',
      count: input.scheduledAssignments,
    },
    {
      key: 'attendance',
      level: input.overdueAttendance > 0 ? 'blocked' : input.openAttendance > 0 ? 'attention' : 'ready',
      label: 'Attendance',
      detail: input.overdueAttendance > 0
        ? String(input.overdueAttendance) + ' open attendance record(s) have passed their assignment end time.'
        : input.openAttendance > 0
          ? String(input.openAttendance) + ' attendance record(s) are currently open.'
          : 'No open attendance exception.',
      count: input.openAttendance,
    },
    {
      key: 'timesheet',
      level: input.rejectedTimesheets > 0 ? 'blocked' : input.submittedTimesheets > 0 ? 'attention' : 'ready',
      label: 'Timesheets',
      detail: input.rejectedTimesheets > 0
        ? String(input.rejectedTimesheets) + ' rejected timesheet(s) require staff correction and resubmission.'
        : input.submittedTimesheets > 0
          ? String(input.submittedTimesheets) + ' submitted timesheet(s) await review.'
          : 'No timesheets awaiting review.',
      count: input.submittedTimesheets + input.rejectedTimesheets,
    },
    {
      key: 'leave',
      level: input.pendingLeave > 0 ? 'attention' : 'ready',
      label: 'Leave',
      detail: input.pendingLeave > 0
        ? String(input.pendingLeave) + ' leave request(s) await review.'
        : 'No leave requests awaiting review.',
      count: input.pendingLeave,
    },
    {
      key: 'payroll',
      level: input.payrollEntryMissingRate > 0 ? 'blocked' : input.payrollEntryDraft > 0 ? 'attention' : 'ready',
      label: 'Payroll',
      detail: input.payrollEntryMissingRate > 0
        ? String(input.payrollEntryMissingRate) + ' payroll entr' + (input.payrollEntryMissingRate === 1 ? 'y is' : 'ies are') + ' missing a valid rate/amount.'
        : input.payrollEntryDraft > 0
          ? String(input.payrollEntryDraft) + ' payroll entr' + (input.payrollEntryDraft === 1 ? 'y is' : 'ies are') + ' still in draft.'
          : 'No payroll entry exceptions detected.',
      count: input.payrollEntryMissingRate + input.payrollEntryDraft,
    },
  ];

  const overall: WorkforceReadinessLevel =
    lanes.some((lane) => lane.level === 'blocked') ? 'blocked' :
    lanes.some((lane) => lane.level === 'attention') ? 'attention' : 'ready';

  const nextAction = lanes.find((lane) => lane.level === 'blocked')?.detail
    || lanes.find((lane) => lane.level === 'attention')?.detail
    || null;

  return { overall, activeStaff: input.active, lanes, nextAction };
}
