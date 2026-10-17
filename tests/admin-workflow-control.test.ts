import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910_admin_workflow_control.sql'),
  'utf8',
);

describe('admin recruitment lifecycle controls', () => {
  it('defines the audited status transition function', () => {
    expect(migration).toContain('create or replace function laurem_transition_application_status');
    expect(migration).toContain('create table if not exists recruitment_admin_actions');
    expect(migration).toContain("outcome text not null check (outcome in ('allowed','blocked','overridden'))");
  });

  it('requires a reason before privileged overrides', () => {
    expect(migration).toContain('OVERRIDE_REASON_REQUIRED');
    expect(migration).toContain("p_override and nullif(trim(coalesce(p_override_reason,'')), '') is null");
  });

  it('protects onboarding and hiring transitions with lifecycle prerequisites', () => {
    expect(migration).toContain("p_to_status = 'Onboarding'");
    expect(migration).toContain("p_to_status = 'Hired'");
    expect(migration).toContain('Onboarding readiness is incomplete.');
    expect(migration).toContain('An active staff profile is required before Hired.');
  });

  it('records both blocked and successful transitions', () => {
    expect(migration).toContain("'blocked'");
    expect(migration).toContain("case when p_override then 'overridden' else 'allowed' end");
    expect(migration).toContain('recruitment_status_history');
  });
});
