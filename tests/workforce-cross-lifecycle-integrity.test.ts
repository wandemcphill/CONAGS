import { describe, expect, it } from 'vitest';
import { buildStaffOperationalSnapshot, validateAssignedTimesheet } from '@/lib/laurem-workforce-integrity';

describe('CONAGS workforce cross-lifecycle integrity', () => {
  const assignment = {
    id: 'assignment-1',
    staff_id: 'staff-1',
    scheduled_start: '2027-01-10T09:00:00.000Z',
    scheduled_end: '2027-01-10T17:00:00.000Z',
    status: 'confirmed',
  };

  it('requires assigned timesheets to use the UK clock-in date', () => {
    expect(validateAssignedTimesheet(assignment, {
      assignmentId: assignment.id,
      workDate: '2027-01-10',
      clockIn: '2027-01-10T08:00:00.000Z',
      clockOut: '2027-01-10T16:00:00.000Z',
    })).toEqual({ ok: true });

    expect(validateAssignedTimesheet(assignment, {
      assignmentId: assignment.id,
      workDate: '2027-01-11',
      clockIn: '2027-01-10T08:00:00.000Z',
      clockOut: '2027-01-10T16:00:00.000Z',
    }).ok).toBe(false);
  });

  it('allows overtime after the scheduled finish but rejects clock-in too early', () => {
    expect(validateAssignedTimesheet(assignment, {
      assignmentId: assignment.id,
      workDate: '2027-01-10',
      clockIn: '2027-01-10T09:00:00.000Z',
      clockOut: '2027-01-10T18:00:00.000Z',
    })).toEqual({ ok: true });

    const early = validateAssignedTimesheet(assignment, {
      assignmentId: assignment.id,
      workDate: '2027-01-10',
      clockIn: '2027-01-10T06:59:59.000Z',
      clockOut: '2027-01-10T17:00:00.000Z',
    });
    expect(early.ok).toBe(false);

    const late = validateAssignedTimesheet(assignment, {
      assignmentId: assignment.id,
      workDate: '2027-01-10',
      clockIn: '2027-01-10T17:00:00.001Z',
      clockOut: '2027-01-10T18:00:00.000Z',
    });
    expect(late).toMatchObject({ ok: false });
  });

  it('builds a coherent staff operational snapshot', () => {
    const snapshot = buildStaffOperationalSnapshot({
      employmentStatus: 'active',
      assignments: [assignment, {
        ...assignment,
        id: 'assignment-2',
        scheduled_start: '2027-01-12T09:00:00.000Z',
        scheduled_end: '2027-01-12T17:00:00.000Z',
      }],
      timesheets: [{
        id: 'ts-1',
        assignment_id: assignment.id,
        clock_in: '2027-01-10T08:30:00.000Z',
        clock_out: null,
        status: 'draft',
      }],
      leaveRequests: [],
      payrollEntries: [],
      now: new Date('2027-01-10T10:00:00.000Z'),
    });

    expect(snapshot.status).toBe('on_shift');
    expect(snapshot.level).toBe('active');
    expect(snapshot.currentAssignmentId).toBe('assignment-1');
    expect(snapshot.openAttendanceTimesheetId).toBe('ts-1');
    expect(snapshot.upcomingAssignmentId).toBe('assignment-2');
  });

  it('blocks inactive staff before downstream operational states', () => {
    const snapshot = buildStaffOperationalSnapshot({
      employmentStatus: 'leaver',
      assignments: [],
      timesheets: [],
      leaveRequests: [],
      payrollEntries: [],
    });
    expect(snapshot.status).toBe('inactive');
    expect(snapshot.level).toBe('blocked');
  });
});

describe('workforce integrity migration', () => {
  it('contains assignment attendance protection and payroll freshness checks', async () => {
    const fs = await import('node:fs/promises');
    const sql = await fs.readFile('supabase/migrations/20260920232000_workforce_operational_integrity.sql', 'utf8');
    const upperBound = await fs.readFile('supabase/migrations/20260920234100_workforce_clockin_upper_bound.sql', 'utf8');
    expect(sql).toContain('ASSIGNMENT_HAS_ATTENDANCE_OR_TIMESHEET');
    expect(sql).toContain('SUBMITTED_ASSIGNED_TIMESHEET_CANNOT_BE_DETACHED');
    expect(sql).toContain('TIMESHEET_WORK_DATE_MISMATCH');
    expect(sql).toContain('PAYROLL_ENTRIES_OUT_OF_DATE');
    expect(sql).toContain('PAYROLL_ENTRIES_INVALID');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(upperBound).toContain('TIMESHEET_CLOCK_IN_AFTER_ASSIGNMENT');
  });
});
