import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS workforce audit namespace isolation', () => {
  const dbSource = readFileSync(resolve(process.cwd(), 'lib/db.ts'), 'utf8');
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_workforce_audit_isolation.sql'),
    'utf8',
  );
  const cleanup = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_empty_cutover_cleanup.sql'),
    'utf8',
  );
  const guard = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_namespace_baseline_guard.sql'),
    'utf8',
  );
  const assignmentRoute = readFileSync(
    resolve(process.cwd(), 'app/api/admin/workforce/assignments/route.ts'),
    'utf8',
  );
  const adminLeaveRoute = readFileSync(
    resolve(process.cwd(), 'app/api/admin/workforce/leave/route.ts'),
    'utf8',
  );
  const staffLeaveRoute = readFileSync(
    resolve(process.cwd(), 'app/api/staff/leave/route.ts'),
    'utf8',
  );

  it('allowlists the logical workforce audit table for CONAGS routing', () => {
    expect(dbSource).toContain("'workforce_audit_events'");
  });

  it('creates only the CONAGS physical audit table', () => {
    expect(migration).toContain('public.laurem_workforce_audit_events');
    expect(migration).not.toContain('public.workforce_audit_events');
  });

  it('keeps assignment and leave audit writes inside the CONAGS namespace', () => {
    expect(assignmentRoute).toContain("from('workforce_audit_events')");
    expect(adminLeaveRoute).toContain("from('workforce_audit_events')");
    expect(staffLeaveRoute).toContain("from('laurem_workforce_audit_events')");
    expect(assignmentRoute).not.toContain("from('public.workforce_audit_events')");
    expect(adminLeaveRoute).not.toContain("from('public.workforce_audit_events')");
    expect(staffLeaveRoute).not.toContain("from('public.workforce_audit_events')");
  });

  it('includes the audit table in empty-state cleanup and baseline protection', () => {
    expect(cleanup).toContain('delete from public.laurem_workforce_audit_events');
    expect(guard).toContain('(select count(*) from public.laurem_workforce_audit_events)');
    expect(cleanup).not.toMatch(/public\.workforce_audit_events/i);
    expect(guard).not.toMatch(/public\.workforce_audit_events/i);
  });
});
