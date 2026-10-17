import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS Mega-Build 19 release resilience contracts', () => {
  it('defines the critical release-readiness RPC and fixed search path', () => {
    const migration = readFileSync('supabase/migrations/20260921011000_release_readiness_operational_contract.sql', 'utf8');
    expect(migration).toContain('laurem_verify_release_readiness');
    expect(migration).toContain('laurem_verify_release_schema');
    expect(migration).toContain('laurem_activate_staff_account_with_session');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('missing_functions');
  });

  it('propagates request correlation through the API middleware', () => {
    const middleware = readFileSync('middleware.ts', 'utf8');
    expect(middleware).toContain("matcher: ['/api/:path*']");
    expect(middleware).toContain("x-request-id");
    expect(middleware).toContain('crypto.randomUUID()');
  });

  it('keeps the highest-value recruitment paths on the operational error contract', () => {
    const routes = [
      'app/api/admin/applications/[id]/route.ts',
      'app/api/admin/applications/hire/route.ts',
      'app/api/admin/onboarding/route.ts',
      'app/api/admin/interviews/route.ts',
      'app/api/admin/contracts/route.ts',
    ];
    for (const path of routes) {
      const route = readFileSync(path, 'utf8');
      expect(route).toContain('getRequestId');
      expect(route).toContain('operationalError');
    }
  });
});