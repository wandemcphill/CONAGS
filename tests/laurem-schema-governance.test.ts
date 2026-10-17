import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS schema governance contract', () => {
  it('tracks the two production schema-contract migrations', () => {
    const initial = readFileSync('supabase/migrations/20260920213203_laurem_schema_drift_guard_20260920.sql', 'utf8');
    const fix = readFileSync('supabase/migrations/20260920213318_laurem_schema_drift_guard_fix_20260920.sql', 'utf8');

    expect(initial).toContain('laurem_verify_release_schema');
    expect(initial).toContain("grant execute on function public.laurem_verify_release_schema() to service_role");
    expect(fix).toContain("expected_columns jsonb");
    expect(fix).toContain("jsonb_array_elements(expected_columns)");
  });

  it('binds application release health to the authoritative database contract', () => {
    const health = readFileSync('lib/laurem-release-health.ts', 'utf8');
    const db = readFileSync('lib/db.ts', 'utf8');

    expect(health).toContain("client.rpc('laurem_verify_release_schema')");
    expect(health).toContain('missingColumns');
    expect(health).toContain('missingIndexes');
    expect(health).toContain('baselineMigrationPresent');
    expect(db).toContain("'laurem_verify_release_schema'");
  });

  it('keeps public readiness fail-closed without exposing schema internals', () => {
    const route = readFileSync('app/api/health/ready/route.ts', 'utf8');

    expect(route).toContain("client.rpc('laurem_verify_release_readiness')");
    expect(route).toContain("operationalError(requestId, 'Service is not ready.', 503, 'RELEASE_NOT_READY')");
    expect(route).not.toContain('missing_tables');
    expect(route).not.toContain('missing_indexes');
    expect(route).not.toContain('ADMIN_PASSWORD');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps the repository honest about the pre-existing migration gap', () => {
    const docs = readFileSync('docs/production-database-baseline.md', 'utf8');
    const readme = readFileSync('supabase/README.md', 'utf8');

    expect(docs).toContain('126');
    expect(docs).toContain('20260920184540');
    expect(docs).toContain('20260920213318');
    expect(docs).toContain('20260920213203');
    expect(docs).toContain('20260920213318');
    expect(readme).toContain('historical migration chain');
    expect(readme).toContain('Source-controlled forward migrations');
  });
});
