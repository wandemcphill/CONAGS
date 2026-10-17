import { describe, expect, it } from 'vitest';

describe('canonical audit timeline contract', () => {
  it('defines the canonical event store and sanitized writer', async () => {
    const fs = await import('node:fs/promises');
    const sql = await fs.readFile('supabase/migrations/20260920235500_canonical_audit_events.sql', 'utf8');
    const triggers = await fs.readFile('supabase/migrations/20260920240500_canonical_audit_source_triggers.sql', 'utf8');
    const helper = await fs.readFile('lib/laurem-audit.ts', 'utf8');
    const adminPage = await fs.readFile('app/admin/audit/page.tsx', 'utf8');
    const adminRoute = await fs.readFile('app/api/admin/audit/route.ts', 'utf8');

    expect(sql).toContain('laurem_audit_events');
    expect(sql).toContain('laurem_record_audit_event');
    expect(sql).toContain('laurem_audit_events_source_unique');
    expect(sql).toContain('laurem_recruitment_status_history');
    expect(sql).toContain('laurem_workforce_audit_events');
    expect(sql).toContain('recruitment_audit_log');
    expect(triggers).toContain('trg_laurem_status_to_canonical_audit');
    expect(triggers).toContain('trg_laurem_admin_action_to_canonical_audit');
    expect(triggers).toContain('trg_recruitment_audit_log_to_canonical_audit');
    expect(triggers).toContain('trg_evidence_audit_to_canonical_audit');
    expect(triggers).toContain('trg_staff_audit_to_canonical_audit');
    expect(triggers).toContain('trg_workforce_audit_to_canonical_audit');

    expect(helper).toContain('SENSITIVE_KEYS');
    expect(helper).toContain('access_token');
    expect(helper).toContain('recordLauremAuditEvent');
    expect(adminPage).toContain('Audit timeline');
    expect(adminRoute).toContain('readAdminSession');
    expect(adminRoute).toContain("from('laurem_audit_events')");
  });

  it('keeps Staff 360 and Candidate 360 on the canonical timeline', async () => {
    const fs = await import('node:fs/promises');
    const staffRoute = await fs.readFile('app/api/admin/workforce/staff/[staffId]/route.ts', 'utf8');
    const candidateRoute = await fs.readFile('app/api/admin/applications/[id]/route.ts', 'utf8');

    expect(staffRoute).toContain("from('laurem_audit_events')");
    expect(staffRoute).toContain("client.rpc('laurem_change_staff_employment_status'");
    expect(staffRoute).toContain('A reason is required for this employment status change.');

    expect(candidateRoute).toContain("from('laurem_audit_events')");
    expect(candidateRoute).toContain('canonical_audit');
  });
});
