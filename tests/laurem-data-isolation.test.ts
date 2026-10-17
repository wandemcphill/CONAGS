import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS data isolation', () => {
  it('fails closed for tables and RPCs outside the CONAGS namespace', () => {
    const source = readFileSync('lib/db.ts', 'utf8');

    expect(source).toContain('CONAGS database namespace violation: table');
    expect(source).toContain('CONAGS database namespace violation: RPC');
    expect(source).toContain('if (name.startsWith(\'laurem_\')) return name;');
  });

  it('filters audit API output to CONAGS sources', () => {
    const route = readFileSync('app/api/admin/audit/route.ts', 'utf8');
    expect(route).toContain(".or('source_table.is.null,source_table.ilike.laurem_%')");
  });

  it('contains the database migration that removes BIMED audit coupling', () => {
    const migration = readFileSync(
      'supabase/migrations/20260923_laurem_audit_namespace_isolation.sql',
      'utf8',
    );

    expect(migration).toContain('drop trigger if exists trg_recruitment_audit_log_to_canonical_audit');
    expect(migration).toContain('drop trigger if exists trg_staff_audit_to_canonical_audit');
    expect(migration).toContain("delete from public.laurem_audit_events\nwhere source_table in ('recruitment_audit_log', 'recruitment_staff_audit_log');");
    expect(migration).toContain('LAUREM_AUDIT_SOURCE_OUTSIDE_NAMESPACE');
    expect(migration).toContain("normalized_source_table !~ '^laurem_[a-z0-9_]+$'");
  });
});
