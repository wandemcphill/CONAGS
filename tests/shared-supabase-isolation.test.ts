import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('shared Supabase isolation', () => {
  const dbSource = readFileSync(resolve(process.cwd(), 'lib/db.ts'), 'utf8');
  const migrationSource = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260909_shared_supabase_isolation.sql'), 'utf8');

  it('routes CONAGS tables and RPCs through explicit namespace maps', () => {
    expect(dbSource).toContain('function mapTableName(name: string)');
    expect(dbSource).toContain("if (LAUREM_TABLES.has(name)) return `laurem_${name}`;");
    expect(dbSource).toContain("'interview_attempts'");
    expect(dbSource).toContain('function mapRpcName(name: string)');
    expect(dbSource).toContain("if (LAUREM_RPC_NAMES.has(name)) return `laurem_${name}`;");
    expect(dbSource).toContain("'legacy_contract_signatures'");
    expect(dbSource).toContain("'workforce_audit_events'");
    expect(dbSource).toContain('CONAGS database namespace violation');
  });

  it('does not rename or drop the shared BIMED namespace', () => {
    expect(migrationSource).not.toMatch(/\b(drop|truncate)\s+(table|schema)\b/i);
    expect(migrationSource).not.toMatch(/alter\s+table\s+public\.recruitment_/i);
    expect(migrationSource).toContain('laurem_recruitment_applications');
    expect(migrationSource).toContain('from public.recruitment_applications a');
  });

  it('preserves legacy application rows in an auditable payload', () => {
    expect(migrationSource).toContain("jsonb_build_object('legacy_shared_application',to_jsonb(a))");
  });
});
