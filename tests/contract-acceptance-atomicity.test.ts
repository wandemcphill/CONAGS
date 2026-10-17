import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909_contract_acceptance_atomicity.sql'),
  'utf8',
);

describe('contract acceptance atomicity', () => {
  it('locks the token row before deciding whether it can be consumed', () => {
    expect(migration).toMatch(/from recruitment_contract_tokens[\s\S]*for update;/i);
  });

  it('locks the contract row before changing lifecycle state', () => {
    expect(migration).toMatch(/from recruitment_contracts[\s\S]*for update;/i);
  });

  it('consumes the token in the same database function after the contract mutation', () => {
    const contractUpdate = migration.indexOf('update recruitment_contracts');
    const tokenUpdate = migration.indexOf('update recruitment_contract_tokens');

    expect(contractUpdate).toBeGreaterThan(-1);
    expect(tokenUpdate).toBeGreaterThan(contractUpdate);
  });

  it('does not expose the contract token outside the server-side hash boundary', () => {
    expect(migration).toContain('p_token_hash text');
    expect(migration).not.toMatch(/raise exception[^;]*TOKEN_SECRET/i);
  });
});
