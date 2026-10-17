import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff onboarding acknowledgement recovery', () => {
  const migration = readFileSync(
    'supabase/migrations/20261012112423_fix_staff_onboarding_acknowledgement.sql',
    'utf8',
  );
  const route = readFileSync('app/api/staff/onboarding/route.ts', 'utf8');
  const page = readFileSync('app/staff/onboarding/page.tsx', 'utf8');

  it('allows activated pending staff and completes acknowledged tasks atomically', () => {
    expect(migration).toContain("employment_status in ('pending', 'active')");
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain('acknowledged_at = coalesce(acknowledged_at, now_value)');
    expect(migration).toContain('completed_at = coalesce(completed_at, now_value)');
    expect(migration).toContain('count(*) filter (where t.required)');
    expect(migration).toContain("when package_complete then 'complete'");
  });

  it('keeps the acknowledgement RPC restricted to the server role', () => {
    expect(migration).toContain(
      'revoke all on function public.laurem_acknowledge_staff_onboarding_task(uuid, uuid)',
    );
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain(
      'grant execute on function public.laurem_acknowledge_staff_onboarding_task(uuid, uuid)',
    );
    expect(migration).toContain('to service_role');
  });

  it('has bounded client and server waits so the button cannot spin forever', () => {
    expect(route).toContain('setTimeout(() => controller.abort(), 15_000)');
    expect(route).toContain('.abortSignal(controller.signal)');
    expect(route).toContain('status: 504');
    expect(page).toContain('setTimeout(()=>controller.abort(),20_000)');
    expect(page).toContain('clearTimeout(timeout);setBusy(null);');
    expect(page).toContain("task.status!=='waived'");
  });
});
