import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff activation security regressions', () => {
  it('keeps invalid activation probes generic instead of exposing account state', () => {
    const route = readFileSync('app/api/staff/auth/activate/route.ts', 'utf8');

    expect(route).toContain("code: 'ACTIVATION_INVALID'");
    expect(route).toContain('Do not reveal whether the supplied email belongs to an existing staff account.');
    expect(route).toContain('Keep invalid-token responses uniform so activation does not become an account-enumeration oracle.');

    const invalidResponseStart = route.indexOf(
      "return activationResponse({ error: 'This activation link is invalid or expired.' }, 400);",
    );
    expect(invalidResponseStart).toBeGreaterThan(-1);

    const invalidBlock = route.slice(Math.max(0, invalidResponseStart - 350), invalidResponseStart + 150);
    expect(invalidBlock).not.toContain("code: 'ACTIVATION_USED'");
  });

  it('marks activation responses as non-cacheable', () => {
    const route = readFileSync('app/api/staff/auth/activate/route.ts', 'utf8');
    expect(route).toContain("response.headers.set('Cache-Control', 'no-store')");
  });

  it('preserves authenticated activation through the atomic database transition', () => {
    const route = readFileSync('app/api/staff/auth/activate/route.ts', 'utf8');
    expect(route).toContain("client.rpc('laurem_activate_staff_account_with_session'");
    expect(route).toContain('p_expected_session_version: expectedSessionVersion');
    expect(route).toContain('setStaffSession(response, tokenForSession)');
  });
});
