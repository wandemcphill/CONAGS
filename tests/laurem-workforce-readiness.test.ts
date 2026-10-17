import { describe, expect, it } from 'vitest';
import { buildWorkforceReadiness } from '@/lib/laurem-workforce-readiness';

// Regression coverage for all five workforce operations lanes.
describe('CONAGS workforce operational readiness', () => {
  const clean = {
    active: true,
    scheduledAssignments: 2,
    openAttendance: 0,
    overdueAttendance: 0,
    submittedTimesheets: 0,
    rejectedTimesheets: 0,
    pendingLeave: 0,
    payrollEntryMissingRate: 0,
    payrollEntryDraft: 0,
  };

  it('reports ready when all operational lanes are clean', () => {
    const readiness = buildWorkforceReadiness(clean);
    expect(readiness.overall).toBe('ready');
    expect(readiness.nextAction).toBeNull();
    expect(readiness.lanes.every((lane) => lane.level === 'ready')).toBe(true);
  });

  it('reports attention for review queues without falsely blocking operations', () => {
    const readiness = buildWorkforceReadiness({
      ...clean,
      submittedTimesheets: 2,
      pendingLeave: 1,
    });
    expect(readiness.overall).toBe('attention');
    expect(readiness.nextAction).toContain('timesheet');
    expect(readiness.lanes.find((lane) => lane.key === 'leave')?.level).toBe('attention');
  });

  it('reports blocked for overdue attendance, rejected timesheets or incomplete payroll', () => {
    expect(buildWorkforceReadiness({ ...clean, overdueAttendance: 1 }).overall).toBe('blocked');
    expect(buildWorkforceReadiness({ ...clean, rejectedTimesheets: 1 }).overall).toBe('blocked');
    expect(buildWorkforceReadiness({ ...clean, payrollEntryMissingRate: 1 }).overall).toBe('blocked');
  });

  it('blocks inactive staff from assignment readiness', () => {
    const readiness = buildWorkforceReadiness({ ...clean, active: false });
    expect(readiness.overall).toBe('blocked');
    expect(readiness.lanes.find((lane) => lane.key === 'assignment')).toMatchObject({
      level: 'blocked',
      count: 2,
    });
  });
});
