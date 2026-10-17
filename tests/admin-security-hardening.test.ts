import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910_admin_auth_throttle.sql'),
  'utf8',
);
const login = readFileSync(
  resolve(process.cwd(), 'app/api/admin/login/route.ts'),
  'utf8',
);
const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8');
const logout = readFileSync(
  resolve(process.cwd(), 'app/api/admin/logout/route.ts'),
  'utf8',
);

describe('admin authentication hardening', () => {
  it('uses persistent server-side throttling with bounded failures', () => {
    expect(migration).toContain('create table if not exists public.laurem_admin_auth_throttle');
    expect(migration).toContain('v_limit integer := 10');
    expect(migration).toContain("v_window interval := interval '15 minutes'");
    expect(migration).toContain('laurem_consume_admin_auth_attempt');
    expect(migration).toContain('revoke all on function public.laurem_consume_admin_auth_attempt');
  });

  it('fails closed when throttle state cannot be checked', () => {
    expect(login).toContain("return jsonError('Admin authentication is temporarily unavailable.', 503)");
    expect(login).toContain("return jsonError('Too many failed login attempts. Try again later.', 429");
    expect(login).toContain('Retry-After');
  });

  it('never stores the raw request identity in the throttle table', () => {
    expect(login).toContain('requestIdentity');
    expect(login).toContain('consumeAdminAuthAttempt(db(), requestIdentity(request, email), credentialsMatch)');
    expect(login).not.toContain('insert into public.laurem_admin_auth_throttle(throttle_key) values (requestIdentity');
    expect(migration).toContain('throttle_key text primary key');
  });

  it('ships baseline browser security headers and explicit logout', () => {
    expect(config).toContain("X-Content-Type-Options");
    expect(config).toContain("X-Frame-Options");
    expect(config).toContain("Referrer-Policy");
    expect(config).toContain("Permissions-Policy");
    expect(logout).toContain('maxAge: 0');
  });
});
