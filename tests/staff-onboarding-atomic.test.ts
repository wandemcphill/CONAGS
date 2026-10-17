import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS atomic staff onboarding', () => {
  it('routes staff onboarding DB state through the atomic RPC', () => {
    const route = readFileSync('app/api/admin/onboarding/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260919_staff_onboarding_atomic.sql', 'utf8');

    expect(route).toContain("laurem_prepare_staff_onboarding_atomic");
    expect(route).not.toContain(".from('staff_profiles').insert");
    expect(route).not.toContain(".from('staff_onboarding_packages').insert");
    expect(route).not.toContain(".from('staff_onboarding_tasks').insert");

    expect(migration).toContain("for update");
    expect(migration).toContain("jsonb_to_recordset");
    expect(migration).toContain("laurem_transition_application_status");
    expect(migration).toContain("app_row.status not in ('Onboarding', 'Hired')");
    expect(migration).toContain("revoke all on function public.laurem_prepare_staff_onboarding_atomic");
  });
});


  it('qualifies onboarding package/task columns that overlap RPC output variables', async () => {
    const variableFix = readFileSync('supabase/migrations/20260924224500_fix_laurem_staff_onboarding_variable_ambiguity.sql', 'utf8');
    const conflictFix = readFileSync('supabase/migrations/20260924230000_fix_laurem_staff_onboarding_task_conflict.sql', 'utf8');
    expect(variableFix).toContain("app_row.application_data->>'nmc_number'");
    expect(variableFix).not.toContain('app_row.nmc_number');
    expect(variableFix).toContain('onboarding_package.staff_id = staff_row.id');
    expect(variableFix).toContain('onboarding_task.package_id = package_row.id');
    expect(conflictFix).toContain('on conflict on constraint laurem_staff_onboarding_tasks_package_id_task_key_key do nothing');
  });