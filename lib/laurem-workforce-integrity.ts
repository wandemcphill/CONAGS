export type WorkforceAssignment = {
  id: string;
  staff_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
};

export type AssignedTimesheetInput = {
  assignmentId?: string | null;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
};

export type TimesheetAssignmentValidation =
  | { ok: true }
  | { ok: false; error: string };

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['scheduled', 'confirmed', 'completed']);

function londonDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date);
}

export function validateAssignedTimesheet(
  assignment: WorkforceAssignment,
  input: AssignedTimesheetInput,
): TimesheetAssignmentValidation {
  if (!ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return { ok: false, error: 'Only an active assignment can receive a timesheet.' };
  }

  if (!input.clockIn || !Number.isFinite(new Date(input.clockIn).getTime())) {
    return { ok: false, error: 'A valid clock-in time is required for an assigned timesheet.' };
  }

  if (!input.clockOut || !Number.isFinite(new Date(input.clockOut).getTime())) {
    return { ok: false, error: 'A valid clock-out time is required for an assigned timesheet.' };
  }

  const clockInMs = new Date(input.clockIn).getTime();
  const clockOutMs = new Date(input.clockOut).getTime();
  const scheduledStartMs = new Date(assignment.scheduled_start).getTime();
  const scheduledEndMs = new Date(assignment.scheduled_end).getTime();

  if (clockOutMs <= clockInMs) {
    return { ok: false, error: 'Clock-out must be later than clock-in.' };
  }

  if (!Number.isFinite(scheduledStartMs) || !Number.isFinite(scheduledEndMs)) {
    return { ok: false, error: 'The assignment schedule is invalid.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate) || input.workDate !== londonDate(input.clockIn)) {
    return { ok: false, error: 'The timesheet work date must match the UK date of clock-in.' };
  }

  const earliestClockIn = scheduledStartMs - 2 * 60 * 60 * 1000;
  if (clockInMs < earliestClockIn) {
    return { ok: false, error: 'Clock-in cannot be more than 2 hours before the assignment.' };
  }
  if (clockInMs > scheduledEndMs) {
    return { ok: false, error: 'Clock-in cannot occur after the assignment has ended.' };
  }

  return { ok: true };
}

export type WorkforceOperationalSnapshot = {
  level: 'clear' | 'active' | 'attention' | 'blocked';
  status: 'inactive' | 'on_shift' | 'attendance_open' | 'awaiting_timesheet_review' | 'timesheet_resubmission' | 'leave_pending' | 'upcoming_shift' | 'payroll_open' | 'clear';
  label: string;
  detail: string;
  currentAssignmentId: string | null;
  upcomingAssignmentId: string | null;
  openAttendanceTimesheetId: string | null;
  counts: {
    upcomingAssignments: number;
    pendingTimesheets: number;
    rejectedTimesheets: number;
    pendingLeave: number;
    openPayrollEntries: number;
  };
};

type SnapshotTimesheet = {
  id: string;
  assignment_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
};

type SnapshotLeave = {
  status: string;
  start_date: string;
  end_date: string;
};

type SnapshotPayroll = {
  id: string;
  status: string;
};

export function buildStaffOperationalSnapshot(input: {
  employmentStatus: string;
  assignments: WorkforceAssignment[];
  timesheets: SnapshotTimesheet[];
  leaveRequests: SnapshotLeave[];
  payrollEntries: SnapshotPayroll[];
  now?: Date;
}): WorkforceOperationalSnapshot {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  const operationalAssignments = input.assignments
    .filter((item) => ACTIVE_ASSIGNMENT_STATUSES.has(item.status))
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());

  const currentAssignment = operationalAssignments.find((item) => {
    const start = new Date(item.scheduled_start).getTime();
    const end = new Date(item.scheduled_end).getTime();
    return start <= nowMs && nowMs <= end;
  }) ?? null;

  const upcomingAssignments = operationalAssignments.filter(
    (item) => new Date(item.scheduled_start).getTime() > nowMs,
  );

  const openAttendance = input.timesheets.find((item) => Boolean(item.clock_in) && !item.clock_out) ?? null;
  const pendingTimesheets = input.timesheets.filter((item) => item.status === 'submitted').length;
  const rejectedTimesheets = input.timesheets.filter((item) => item.status === 'rejected').length;
  const pendingLeave = input.leaveRequests.filter((item) => item.status === 'pending').length;
  const openPayrollEntries = input.payrollEntries.filter((item) => !['paid', 'void'].includes(item.status)).length;

  if (input.employmentStatus !== 'active') {
    return {
      level: 'blocked',
      status: 'inactive',
      label: 'Not active',
      detail: 'Workforce operations are unavailable until the staff employment status is active.',
      currentAssignmentId: currentAssignment?.id ?? null,
      upcomingAssignmentId: upcomingAssignments[0]?.id ?? null,
      openAttendanceTimesheetId: openAttendance?.id ?? null,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  if (currentAssignment && openAttendance) {
    return {
      level: 'active',
      status: 'on_shift',
      label: 'On shift',
      detail: 'An active assignment has an open attendance record.',
      currentAssignmentId: currentAssignment.id,
      upcomingAssignmentId: upcomingAssignments[0]?.id ?? null,
      openAttendanceTimesheetId: openAttendance.id,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  if (openAttendance) {
    return {
      level: 'attention',
      status: 'attendance_open',
      label: 'Attendance open',
      detail: 'An attendance record is still open and needs clock-out review.',
      currentAssignmentId: currentAssignment?.id ?? null,
      upcomingAssignmentId: upcomingAssignments[0]?.id ?? null,
      openAttendanceTimesheetId: openAttendance.id,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  if (rejectedTimesheets > 0) {
    return {
      level: 'blocked',
      status: 'timesheet_resubmission',
      label: 'Timesheet action required',
      detail: `${rejectedTimesheets} rejected timesheet${rejectedTimesheets === 1 ? '' : 's'} need resubmission or review.`,
      currentAssignmentId: currentAssignment?.id ?? null,
      upcomingAssignmentId: upcomingAssignments[0]?.id ?? null,
      openAttendanceTimesheetId: null,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  if (pendingTimesheets > 0) {
    return {
      level: 'attention',
      status: 'awaiting_timesheet_review',
      label: 'Timesheet review pending',
      detail: `${pendingTimesheets} submitted timesheet${pendingTimesheets === 1 ? '' : 's'} are awaiting admin review.`,
      currentAssignmentId: currentAssignment?.id ?? null,
      upcomingAssignmentId: upcomingAssignments[0]?.id ?? null,
      openAttendanceTimesheetId: null,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  if (pendingLeave > 0) {
    return {
      level: 'attention',
      status: 'leave_pending',
      label: 'Leave review pending',
      detail: `${pendingLeave} leave request${pendingLeave === 1 ? '' : 's'} are awaiting review.`,
      currentAssignmentId: currentAssignment?.id ?? null,
      upcomingAssignmentId: upcomingAssignments[0]?.id ?? null,
      openAttendanceTimesheetId: null,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  if (upcomingAssignments.length > 0) {
    return {
      level: 'active',
      status: 'upcoming_shift',
      label: 'Upcoming shift',
      detail: 'The next scheduled assignment is ready for attendance.',
      currentAssignmentId: null,
      upcomingAssignmentId: upcomingAssignments[0].id,
      openAttendanceTimesheetId: null,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  if (openPayrollEntries > 0) {
    return {
      level: 'attention',
      status: 'payroll_open',
      label: 'Payroll open',
      detail: `${openPayrollEntries} payroll entr${openPayrollEntries === 1 ? 'y is' : 'ies are'} not yet paid or voided.`,
      currentAssignmentId: null,
      upcomingAssignmentId: null,
      openAttendanceTimesheetId: null,
      counts: { upcomingAssignments: upcomingAssignments.length, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
    };
  }

  return {
    level: 'clear',
    status: 'clear',
    label: 'Operations clear',
    detail: 'No outstanding workforce action is currently detected.',
    currentAssignmentId: null,
    upcomingAssignmentId: null,
    openAttendanceTimesheetId: null,
    counts: { upcomingAssignments: 0, pendingTimesheets, rejectedTimesheets, pendingLeave, openPayrollEntries },
  };
}
