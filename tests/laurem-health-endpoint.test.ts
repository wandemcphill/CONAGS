import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS production health contracts', () => {
  it('keeps the public health endpoint lightweight and dependency-free', () => {
    const route = readFileSync('app/api/health/route.ts', 'utf8');
    expect(route).toContain("service: 'conags-care'");
    expect(route).toContain("withRequestId");
    expect(route).toContain("service: 'conags-care'");
    expect(route).not.toContain("from '@/lib/db'");
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(route).not.toContain('ADMIN_PASSWORD');
  });

  it('keeps database readiness on a separate non-secret-bearing endpoint', () => {
    const route = readFileSync('app/api/health/ready/route.ts', 'utf8');
    expect(route).toContain("const client = db();");
    expect(route).toContain("client.from('recruitment_applications')");
    expect(route).toContain("select('id', { head: true, count: 'exact' })");
    expect(route).toContain("operationalError(requestId, 'Service is not ready.', 503, 'RELEASE_NOT_READY')");
    expect(route).toContain("operationalError");
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(route).not.toContain('ADMIN_PASSWORD');
  });

  it('correlates public and readiness responses without exposing runtime secrets', () => {
    const route = readFileSync('app/api/health/route.ts', 'utf8');
    const ready = readFileSync('app/api/health/ready/route.ts', 'utf8');
    expect(route).toContain("getRequestId(request)");
    expect(route).toContain("withRequestId");
    expect(ready).toContain("laurem_verify_release_readiness");
    expect(ready).toContain("operationalError");
  });

  it('reports release identity without exposing runtime secrets', () => {
    const route = readFileSync('app/api/health/route.ts', 'utf8');
    const ready = readFileSync('app/api/health/ready/route.ts', 'utf8');
    expect(route).toContain('RENDER_GIT_COMMIT');
    expect(route).toContain("commit: releaseCommit()");
    expect(ready).toContain("commit: releaseCommit()");
  });
});
