export type ExceptionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ExceptionArea = 'recruitment' | 'contract' | 'onboarding' | 'workforce' | 'payroll';

export type ExceptionCandidate = {
  dedupeKey: string;
  area: ExceptionArea;
  severity: ExceptionSeverity;
  code: string;
  title: string;
  detail: string;
  applicationId?: string | null;
  staffId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

type Application = { id:string; full_name:string; role_applied:string|null; status:string; updated_at:string|null; start_date:string|null };
type Contract = { id:string; application_id:string; status:string; accepted_at:string|null; job_title:string|null; updated_at:string|null };
type Staff = { id:string; application_id:string|null; contract_id:string|null; full_name:string; employee_number:string; job_title:string; employment_status:string; start_date:string|null; updated_at:string|null };
type Onboarding = { id:string; staff_id:string; status:string; updated_at:string|null };
type Assignment = { id:string; staff_id:string; location:string; status:string };
type Timesheet = { id:string; staff_id:string; assignment_id:string|null; work_date:string; status:string };
type LeaveRequest = { id:string; staff_id:string; start_date:string; status:string; created_at:string };
type PayrollPeriod = { id:string; status:string; period_start:string; period_end:string };
type PayrollEntry = { id:string; staff_id:string; payroll_period_id:string; approved_hours:number|null; hourly_rate:number|null; gross_amount:number|null; status:string };

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['scheduled','confirmed','completed']);

function daysOld(value:string|null, now:number) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((now - time) / 86_400_000));
}

function push(out: ExceptionCandidate[], candidate: ExceptionCandidate) {
  out.push({ ...candidate, metadata: candidate.metadata || {} });
}

export function buildLauremOperationalExceptions(input: {
  applications: Application[];
  contracts: Contract[];
  staff: Staff[];
  onboarding: Onboarding[];
  assignments: Assignment[];
  timesheets: Timesheet[];
  leaveRequests: LeaveRequest[];
  payrollPeriods: PayrollPeriod[];
  payrollEntries: PayrollEntry[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const out: ExceptionCandidate[] = [];

  const contractByApplication = new Map(input.contracts.map((row) => [row.application_id, row]));
  const staffByApplication = new Map(input.staff.filter((row) => row.application_id).map((row) => [row.application_id as string, row]));
  const staffById = new Map(input.staff.map((row) => [row.id, row]));
  const onboardingByStaff = new Map(input.onboarding.map((row) => [row.staff_id, row]));
  const assignmentById = new Map(input.assignments.map((row) => [row.id, row]));
  const payrollPeriodById = new Map(input.payrollPeriods.map((row) => [row.id, row]));

  for (const app of input.applications) {
    const contract = contractByApplication.get(app.id);
    const staff = staffByApplication.get(app.id);

    if (app.status === 'Hired' && !staff) {
      push(out, {
        dedupeKey: `mb13:hired-without-staff:${app.id}`,
        area: 'recruitment',
        severity: 'critical',
        code: 'HIRED_WITHOUT_STAFF',
        title: 'Hired candidate has no staff identity',
        detail: `${app.full_name} is marked Hired but no staff profile is linked to the application.`,
        applicationId: app.id,
        entityType: 'application',
        entityId: app.id,
      });
    }

    if (['Onboarding','Hired'].includes(app.status) && !contract) {
      push(out, {
        dedupeKey: `mb13:missing-contract:${app.id}`,
        area: 'contract',
        severity: 'high',
        code: 'STAFF_PATH_WITHOUT_CONTRACT',
        title: 'Staff pathway is missing an employment contract',
        detail: `${app.full_name} is in ${app.status} but no recruitment contract is linked to the application.`,
        applicationId: app.id,
        entityType: 'application',
        entityId: app.id,
      });
    }

    if (contract?.status === 'accepted' && !contract.accepted_at) {
      push(out, {
        dedupeKey: `mb13:accepted-without-timestamp:${contract.id}`,
        area: 'contract',
        severity: 'critical',
        code: 'ACCEPTED_CONTRACT_WITHOUT_TIMESTAMP',
        title: 'Accepted contract has no acceptance timestamp',
        detail: `${app.full_name}'s contract is marked accepted without an accepted_at value.`,
        applicationId: app.id,
        entityType: 'contract',
        entityId: contract.id,
      });
    }

    if (contract?.status === 'accepted' && staff && staff.contract_id && staff.contract_id !== contract.id) {
      push(out, {
        dedupeKey: `mb13:contract-mismatch:${staff.id}`,
        area: 'contract',
        severity: 'critical',
        code: 'STAFF_CONTRACT_MISMATCH',
        title: 'Staff profile points to a different contract',
        detail: `${staff.full_name}'s staff record is linked to a different contract than the accepted application contract.`,
        applicationId: app.id,
        staffId: staff.id,
        entityType: 'staff',
        entityId: staff.id,
        metadata: { expectedContractId: contract.id, actualContractId: staff.contract_id },
      });
    }

    if (app.status === 'Offer' && !contract) {
      push(out, {
        dedupeKey: `mb13:offer-without-contract:${app.id}`,
        area: 'recruitment',
        severity: 'medium',
        code: 'OFFER_WITHOUT_CONTRACT',
        title: 'Offer-stage candidate has no contract record',
        detail: `${app.full_name} is at Offer stage but no contract has been prepared.`,
        applicationId: app.id,
        entityType: 'application',
        entityId: app.id,
      });
    }

    if (contract?.status === 'accepted' && ['Offer','Documents','Sponsorship'].includes(app.status)) {
      push(out, {
        dedupeKey: `mb13:accepted-contract-stalled:${app.id}`,
        area: 'contract',
        severity: 'medium',
        code: 'ACCEPTED_CONTRACT_STALLED',
        title: 'Accepted contract has not moved the candidate into onboarding',
        detail: `${app.full_name} has an accepted contract but remains at ${app.status}.`,
        applicationId: app.id,
        entityType: 'application',
        entityId: app.id,
        metadata: { status: app.status },
      });
    }
  }

  for (const staff of input.staff) {
    const app = staff.application_id ? input.applications.find((row) => row.id === staff.application_id) : undefined;

    if (staff.employment_status === 'active' && !onboardingByStaff.has(staff.id)) {
      push(out, {
        dedupeKey: `mb13:active-without-onboarding:${staff.id}`,
        area: 'onboarding',
        severity: 'high',
        code: 'ACTIVE_STAFF_WITHOUT_ONBOARDING',
        title: 'Active staff has no onboarding package',
        detail: `${staff.full_name} is active but no staff onboarding package is linked.`,
        applicationId: staff.application_id,
        staffId: staff.id,
        entityType: 'staff',
        entityId: staff.id,
      });
    }

    if (staff.application_id && app && app.status !== 'Hired' && staff.employment_status === 'active') {
      push(out, {
        dedupeKey: `mb13:active-status-drift:${staff.id}`,
        area: 'recruitment',
        severity: 'high',
        code: 'ACTIVE_STAFF_APPLICATION_STATUS_DRIFT',
        title: 'Active staff conflicts with application status',
        detail: `${staff.full_name} is active while the linked application remains ${app.status}.`,
        applicationId: staff.application_id,
        staffId: staff.id,
        entityType: 'staff',
        entityId: staff.id,
        metadata: { applicationStatus: app.status },
      });
    }
  }

  for (const assignment of input.assignments) {
    const staff = staffById.get(assignment.staff_id);
    if (staff && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status) && staff.employment_status !== 'active') {
      push(out, {
        dedupeKey: `mb13:assignment-inactive-staff:${assignment.id}`,
        area: 'workforce',
        severity: 'high',
        code: 'ASSIGNMENT_ON_INACTIVE_STAFF',
        title: 'Active assignment belongs to inactive staff',
        detail: `Assignment at ${assignment.location} is ${assignment.status} for ${staff.full_name}, whose employment status is ${staff.employment_status}.`,
        staffId: staff.id,
        entityType: 'assignment',
        entityId: assignment.id,
        metadata: { assignmentStatus: assignment.status, employmentStatus: staff.employment_status },
      });
    }
  }

  for (const timesheet of input.timesheets) {
    const assignment = timesheet.assignment_id ? assignmentById.get(timesheet.assignment_id) : undefined;
    if (assignment && ['cancelled','no_show'].includes(assignment.status)) {
      push(out, {
        dedupeKey: `mb13:timesheet-cancelled-assignment:${timesheet.id}`,
        area: 'workforce',
        severity: 'critical',
        code: 'TIMESHEET_ON_CANCELLED_ASSIGNMENT',
        title: 'Timesheet conflicts with cancelled assignment',
        detail: `Timesheet ${timesheet.work_date} is linked to an assignment that is ${assignment.status}.`,
        staffId: timesheet.staff_id,
        entityType: 'timesheet',
        entityId: timesheet.id,
        metadata: { assignmentId: assignment.id, assignmentStatus: assignment.status },
      });
    }

    if (timesheet.status === 'submitted' && daysOld(timesheet.work_date, nowMs) >= 7) {
      push(out, {
        dedupeKey: `mb13:old-submitted-timesheet:${timesheet.id}`,
        area: 'workforce',
        severity: 'medium',
        code: 'STALE_SUBMITTED_TIMESHEET',
        title: 'Timesheet has been awaiting review for 7+ days',
        detail: `Timesheet for ${timesheet.work_date} has remained submitted for at least seven days.`,
        staffId: timesheet.staff_id,
        entityType: 'timesheet',
        entityId: timesheet.id,
      });
    }
  }

  for (const leave of input.leaveRequests) {
    if (leave.status === 'pending' && daysOld(leave.created_at, nowMs) >= 7) {
      push(out, {
        dedupeKey: `mb13:stale-leave:${leave.id}`,
        area: 'workforce',
        severity: 'medium',
        code: 'STALE_LEAVE_REQUEST',
        title: 'Leave request has been awaiting review for 7+ days',
        detail: `Leave starting ${leave.start_date} has remained pending for at least seven days.`,
        staffId: leave.staff_id,
        entityType: 'leave',
        entityId: leave.id,
      });
    }
  }

  for (const entry of input.payrollEntries) {
    const period = payrollPeriodById.get(entry.payroll_period_id);
    if (!period) continue;

    const expectedGross = entry.approved_hours != null && entry.hourly_rate != null
      ? Number((Number(entry.approved_hours) * Number(entry.hourly_rate)).toFixed(2))
      : null;

    if (expectedGross == null || entry.gross_amount == null || Number(entry.gross_amount) !== expectedGross) {
      push(out, {
        dedupeKey: `mb13:invalid-payroll-entry:${entry.id}`,
        area: 'payroll',
        severity: 'critical',
        code: 'INVALID_PAYROLL_ENTRY',
        title: 'Payroll entry amount is inconsistent',
        detail: `Payroll entry ${entry.id} does not reconcile approved hours, hourly rate and gross amount.`,
        staffId: entry.staff_id,
        entityType: 'payroll_entry',
        entityId: entry.id,
      });
    }

    if (period.status === 'closed' && !['paid','void'].includes(entry.status)) {
      push(out, {
        dedupeKey: `mb13:closed-payroll-unsettled:${entry.id}`,
        area: 'payroll',
        severity: 'high',
        code: 'CLOSED_PAYROLL_ENTRY_UNSETTLED',
        title: 'Closed payroll period still contains an unsettled entry',
        detail: `Payroll entry ${entry.id} is ${entry.status} even though its payroll period is closed.`,
        staffId: entry.staff_id,
        entityType: 'payroll_entry',
        entityId: entry.id,
        metadata: { periodId: period.id, periodStart: period.period_start, periodEnd: period.period_end },
      });
    }
  }

  return out;
}
