import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('portal mobile responsiveness', () => {
  it('keeps the mobile viewport configured correctly', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain("width: 'device-width'");
    expect(layout).toContain('initialScale: 1');
  });

  it('provides a responsive staff navigation shell', () => {
    const shell = readFileSync('components/StaffShell.tsx', 'utf8');
    const css = readFileSync('app/globals.css', 'utf8');
    expect(shell).toContain('staff-mobile-header');
    expect(shell).toContain('staff-bottom-nav');
    expect(shell).toContain('StaffTeamMessageQuickAction compact');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('.staff-sidebar { display: none; }');
    expect(css).toContain('.staff-main { margin-left: 0;');
  });

  it('stacks admin message centre, schedule and candidate workspaces on narrow screens', () => {
    const messages = readFileSync('app/admin/messages/page.tsx', 'utf8');
    const schedule = readFileSync('app/admin/workforce/schedule/page.tsx', 'utf8');
    const application = readFileSync('app/admin/applications/[id]/page.tsx', 'utf8');
    const css = readFileSync('app/globals.css', 'utf8');

    expect(messages).toContain('admin-message-centre-layout');
    expect(schedule).toContain('admin-schedule-layout');
    expect(application).toContain('admin-application-secondary-layout');
    expect(application).toContain('admin-lifecycle-gates');

    expect(css).toContain('.admin-message-centre-layout');
    expect(css).toContain('.admin-schedule-layout');
    expect(css).toContain('.admin-application-secondary-layout');
    expect(css).toContain('grid-template-columns: 1fr !important;');
    expect(css).toContain('.admin-lifecycle-gates');
  });
});
