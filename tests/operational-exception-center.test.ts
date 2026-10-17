import { describe, expect, it } from 'vitest';
import { buildLauremOperationalExceptions } from '@/lib/laurem-operational-exceptions';

describe('CONAGS operational exception detection', () => {
  it('detects recruitment to staff contradictions', () => {
    const exceptions = buildLauremOperationalExceptions({
      now: new Date('2026-09-20T12:00:00.000Z'),
      applications: [
        { id: 'app-1', full_name: 'Candidate One', role_applied: 'Support Worker', status: 'Hired', updated_at: '2026-09-20', start_date: null },
        { id: 'app-2', full_name: 'Candidate Two', role_applied: 'Support Worker', status: 'Offer', updated_at: '2026-09-20', start_date: null },
      ],
      contracts: [
        { id: 'contract-2', application_id: 'app-2', status: 'accepted', accepted_at: '2026-09-20T10:00:00Z', job_title: 'Support Worker', updated_at: '2026-09-20T10:00:00Z' },
      ],
      staff: [],
      onboarding: [],
      assignments: [],
      timesheets: [],
      leaveRequests: [],
      payrollPeriods: [],
      payrollEntries: [],
    });

    expect(exceptions.map((item) => item.code)).toEqual(expect.arrayContaining([
      'HIRED_WITHOUT_STAFF',
      'STAFF_PATH_WITHOUT_CONTRACT',
      'ACCEPTED_CONTRACT_STALLED',
    ]));
  });

  it('detects workforce and payroll contradictions', () => {
    const exceptions = buildLauremOperationalExceptions({
      now: new Date('2026-09-20T12:00:00.000Z'),
      applications: [],
      contracts: [],
      staff: [
        { id: 'staff-1', application_id: null, contract_id: null, full_name: 'Staff One', employee_number: 'L001', job_title: 'Support Worker', employment_status: 'suspended', start_date: null, updated_at: null },
      ],
      onboarding: [],
      assignments: [
        { id: 'assignment-1', staff_id: 'staff-1', location: 'Glasgow', status: 'confirmed' },
      ],
      timesheets: [
        { id: 'timesheet-1', staff_id: 'staff-1', assignment_id: 'assignment-1', work_date: '2026-09-01', status: 'submitted' },
      ],
      leaveRequests: [],
      payrollPeriods: [
        { id: 'period-1', status: 'closed', period_start: '2026-09-01', period_end: '2026-09-30' },
      ],
      payrollEntries: [
        { id: 'entry-1', staff_id: 'staff-1', payroll_period_id: 'period-1', approved_hours: 10, hourly_rate: 12, gross_amount: 100, status: 'processing' },
      ],
    });

    expect(exceptions.map((item) => item.code)).toEqual(expect.arrayContaining([
      'ASSIGNMENT_ON_INACTIVE_STAFF',
      'INVALID_PAYROLL_ENTRY',
      'CLOSED_PAYROLL_ENTRY_UNSETTLED',
    ]));
    expect(exceptions).toHaveLength(4);
  });

  it('detects stale timesheets and leave requests', () => {
    const exceptions = buildLauremOperationalExceptions({
      now: new Date('2026-09-20T12:00:00.000Z'),
      applications: [],
      contracts: [],
      staff: [],
      onboarding: [],
      assignments: [],
      timesheets: [
        { id: 'timesheet-1', staff_id: 'staff-1', assignment_id: null, work_date: '2026-09-10', status: 'submitted' },
      ],
      leaveRequests: [
        { id: 'leave-1', staff_id: 'staff-1', start_date: '2026-10-01', status: 'pending', created_at: '2026-09-10T12:00:00Z' },
      ],
      payrollPeriods: [],
      payrollEntries: [],
    });

    expect(exceptions.map((item) => item.code)).toEqual([
      'STALE_SUBMITTED_TIMESHEET',
      'STALE_LEAVE_REQUEST',
    ]);
  });
});

describe('operational exception migration', () => {
  it('defines the persistent exception and event queues', async () => {
    const fs = await import('node:fs/promises');
    const sql = await fs.readFile('supabase/migrations/20260920224500_operational_exceptions.sql', 'utf8');
    expect(sql).toContain('laurem_operational_exceptions');
    expect(sql).toContain('laurem_operational_exception_events');
    expect(sql).toContain('dedupe_key');
    expect(sql).toMatch(/status\s+in\s+\('open',\s*'acknowledged',\s*'resolved',\s*'dismissed'\)/);
    expect(sql).toContain('revoke all on table public.laurem_operational_exceptions');
  });
});