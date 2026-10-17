import { describe, expect, it } from 'vitest';

async function read(path: string) {
  const fs = await import('node:fs/promises');
  return fs.readFile(path, 'utf8');
}

describe('staff self-service workspace', () => {
  it('binds onboarding reads and writes to the authenticated staff identity', async () => {
    const source = await read('app/api/staff/onboarding/route.ts');
    expect(source).toContain("getStaffSession(req)");
    expect(source).toContain("getStaffSession(req)");
    expect(source).toContain("laurem_acknowledge_staff_onboarding_task");
    expect(source).toContain("p_staff_id: session.staff_id");
    expect(source).toContain("p_task_id: taskId");
    expect(source).toContain("action !== 'acknowledge'");
  });

  it('keeps payroll self-service scoped to the authenticated staff member', async () => {
    const source = await read('app/api/staff/payroll/route.ts');
    expect(source).toContain("getStaffSession(req)");
    expect(source).toContain(".eq('staff_id', session.staff_id)");
    expect(source).toContain(".limit(24)");
  });

  it('does not expose admin payroll or workforce routes through staff endpoints', async () => {
    const payroll = await read('app/api/staff/payroll/route.ts');
    const onboarding = await read('app/api/staff/onboarding/route.ts');
    expect(payroll).not.toContain('readAdminSession');
    expect(onboarding).not.toContain('readAdminSession');
    expect(payroll).not.toContain("from('recruitment_");
    expect(onboarding).not.toContain("from('recruitment_");
  });
});

describe('staff workspace UI wiring', () => {
  it('surfaces onboarding and payroll as first-class staff destinations', async () => {
    const home = await read('components/StaffHomeDashboard.tsx');
    const onboarding = await read('app/staff/onboarding/page.tsx');
    const payroll = await read('app/staff/payroll/page.tsx');
    expect(home).toContain("'/staff/onboarding'");
    expect(onboarding).toContain("'/api/staff/onboarding'");
    expect(onboarding).toContain('I have read and acknowledge');
    expect(payroll).toContain("'/api/staff/payroll'");
    expect(payroll).toContain('My payroll');
  });
});

describe('weekly scheduling board', () => {
  it('uses the existing assignment boundary rather than a second scheduling API', async () => {
    const source = await read('app/admin/workforce/schedule/page.tsx');
    expect(source).toContain("/api/admin/workforce/assignments");
    expect(source).toContain("changeStatus(a.id,'confirmed')");
    expect(source).toContain("changeStatus(a.id,'cancelled')");
    expect(source).toContain('Weekly operations board');
  });
});
