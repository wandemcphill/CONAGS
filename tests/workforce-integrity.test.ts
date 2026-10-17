import { describe, expect, it } from 'vitest';
import {
  LEAVE_TRANSITIONS,
  PAYROLL_PERIOD_TRANSITIONS,
  TIMESHEET_TRANSITIONS,
  inclusiveCalendarDays,
  isLockedPayrollStatus,
  isMutableTimesheetStatus,
  transitionAllowed,
} from '@/lib/laurem-workforce-policy';

describe('workforce lifecycle policy', () => {
  it('calculates inclusive leave days deterministically', () => {
    expect(inclusiveCalendarDays('2027-01-11', '2027-01-11')).toBe(1);
    expect(inclusiveCalendarDays('2027-01-11', '2027-01-15')).toBe(5);
    expect(inclusiveCalendarDays('2027-01-15', '2027-01-11')).toBeNull();
  });

  it('only permits intended leave transitions', () => {
    expect(transitionAllowed(LEAVE_TRANSITIONS, 'pending', 'approved')).toBe(true);
    expect(transitionAllowed(LEAVE_TRANSITIONS, 'pending', 'cancelled')).toBe(true);
    expect(transitionAllowed(LEAVE_TRANSITIONS, 'approved', 'cancelled')).toBe(true);
    expect(transitionAllowed(LEAVE_TRANSITIONS, 'approved', 'rejected')).toBe(false);
    expect(transitionAllowed(LEAVE_TRANSITIONS, 'rejected', 'approved')).toBe(false);
  });

  it('keeps timesheet and payroll state machines fail-closed', () => {
    expect(transitionAllowed(TIMESHEET_TRANSITIONS, 'draft', 'submitted')).toBe(true);
    expect(transitionAllowed(TIMESHEET_TRANSITIONS, 'approved', 'paid')).toBe(true);
    expect(transitionAllowed(TIMESHEET_TRANSITIONS, 'paid', 'submitted')).toBe(false);
    expect(transitionAllowed(PAYROLL_PERIOD_TRANSITIONS, 'open', 'processing')).toBe(true);
    expect(transitionAllowed(PAYROLL_PERIOD_TRANSITIONS, 'processing', 'open')).toBe(false);
    expect(transitionAllowed(PAYROLL_PERIOD_TRANSITIONS, 'closed', 'processing')).toBe(false);
  });

  it('identifies locked and mutable timesheet states', () => {
    expect(isMutableTimesheetStatus('draft')).toBe(true);
    expect(isMutableTimesheetStatus('submitted')).toBe(true);
    expect(isMutableTimesheetStatus('rejected')).toBe(true);
    expect(isMutableTimesheetStatus('approved')).toBe(false);
    expect(isMutableTimesheetStatus('paid')).toBe(false);
    expect(isLockedPayrollStatus('open')).toBe(false);
    expect(isLockedPayrollStatus('processing')).toBe(true);
    expect(isLockedPayrollStatus('closed')).toBe(true);
  });
});

describe('workforce database integrity migration', () => {
  it('contains cross-table leave/assignment protection and payroll locking', async () => {
    const fs = await import('node:fs/promises');
    const sql = await fs.readFile('supabase/migrations/20260910_workforce_integrity.sql', 'utf8');
    const followup = await fs.readFile('supabase/migrations/20260910_workforce_integrity_followup.sql', 'utf8');
    expect(sql).toContain('staff_leave_requests_dates_nonoverlap');
    expect(sql).toContain('LEAVE_CONFLICTS_WITH_SCHEDULED_ASSIGNMENT');
    expect(sql).toContain('PAYROLL_PERIOD_IS_LOCKED');
    expect(sql).toContain('TIMESHEET_PAYROLL_PERIOD_LOCKED');
    expect(sql).toContain('APPROVED_TIMESHEET_IS_IMMUTABLE');
    expect(followup).toContain('payroll_periods_dates_nonoverlap');
    expect(followup).toContain('pg_advisory_xact_lock');
  });
});
