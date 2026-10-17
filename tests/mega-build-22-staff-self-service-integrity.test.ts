import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Mega-Build 22 staff self-service integrity', () => {
  it('uses a server-side atomic onboarding acknowledgement boundary', () => {
    const migration = readFileSync('supabase/migrations/20260921150000_staff_workspace_atomic_writes.sql', 'utf8');
    const route = readFileSync('app/api/staff/onboarding/route.ts', 'utf8');

    expect(migration).toContain('laurem_acknowledge_staff_onboarding_task');
    expect(migration).toContain("STAFF_NOT_ELIGIBLE");
    expect(migration).toContain("ONBOARDING_TASK_NOT_FOUND");
    expect(migration).toContain('for update');
    expect(migration).toContain('laurem_record_audit_event');
    expect(route).toContain("laurem_acknowledge_staff_onboarding_task");
    expect(route).not.toContain(".update({ acknowledged_at");
  });

  it('keeps staff writes scoped to the authenticated identity', () => {
    const routes = [
      'app/api/staff/availability/route.ts',
      'app/api/staff/leave/route.ts',
      'app/api/staff/timesheets/route.ts',
      'app/api/staff/attendance/route.ts',
      'app/api/staff/me/route.ts',
      'app/api/staff/messages/route.ts',
      'app/api/staff/messages/[id]/route.ts',
      'app/api/staff/documents/[id]/route.ts',
      'app/api/staff/documents/[id]/download/route.ts',
    ];

    for (const path of routes) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('getStaffSession');
      expect(source).toContain('session.staff_id');
    }

    expect(readFileSync('app/api/staff/messages/[id]/route.ts', 'utf8')).toContain('participantConversationIds');
    expect(readFileSync('app/api/staff/documents/[id]/route.ts', 'utf8')).toContain(".eq('staff_id', session.staff_id)");
    expect(readFileSync('app/api/staff/documents/[id]/download/route.ts', 'utf8')).toContain(".eq('staff_id', session.staff_id)");
  });

  it('records canonical audit events for recurring staff self-service writes', () => {
    const routes = [
      'app/api/staff/availability/route.ts',
      'app/api/staff/leave/route.ts',
      'app/api/staff/timesheets/route.ts',
      'app/api/staff/attendance/route.ts',
      'app/api/staff/me/route.ts',
      'app/api/staff/messages/route.ts',
      'app/api/staff/messages/[id]/route.ts',
    ];

    for (const path of routes) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain("recordLauremAuditEvent");
      expect(source).not.toContain('password');
      expect(source).not.toContain('signed_url');
    }
  });

  it('does not let profile self-service alter employment identity', () => {
    const route = readFileSync('app/api/staff/me/route.ts', 'utf8');
    expect(route).not.toContain("'employment_status'");
    expect(route).not.toContain("'job_title'");
    expect(route).not.toContain("'employee_number'");
  });

  it('extends release readiness with the atomic staff workspace RPC', () => {
    const migration = readFileSync('supabase/migrations/20260921150000_staff_workspace_atomic_writes.sql', 'utf8');
    expect(migration).toContain('laurem_acknowledge_staff_onboarding_task');
    expect(migration).toContain('grant execute on function');
  });
});
