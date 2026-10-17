import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const route = readFileSync(
  resolve(process.cwd(), 'app/api/admin/onboarding/route.ts'),
  'utf8',
);
const workflowMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910_admin_workflow_control.sql'),
  'utf8',
);

describe('recruitment status integrity', () => {
  it('routes onboarding through the atomic preparation RPC', () => {
    const atomicMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260919_staff_onboarding_atomic.sql'),
      'utf8',
    );
    expect(route).toContain("rpc('laurem_prepare_staff_onboarding_atomic'");
    expect(route).not.toContain("from('recruitment_applications').update({ status: 'Onboarding'");
    expect(atomicMigration).toContain('laurem_transition_application_status');
    expect(atomicMigration).toContain("p_application_id");
  });

  it('keeps onboarding prerequisites enforced by the database lifecycle function', () => {
    expect(workflowMigration).toContain("p_to_status = 'Onboarding'");
    expect(workflowMigration).toContain('Onboarding readiness is incomplete.');
    expect(workflowMigration).toContain('An accepted contract matching the applied role is required.');
  });
});
