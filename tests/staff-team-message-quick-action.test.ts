import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('staff team message quick action', () => {
  it('is mounted persistently for desktop and mobile staff navigation', () => {
    const shell = readFileSync('components/StaffShell.tsx', 'utf8');
    expect(shell).toContain("import StaffTeamMessageQuickAction from '@/components/StaffTeamMessageQuickAction';");
    expect(shell).toContain('<StaffTeamMessageQuickAction />');
    expect(shell).toContain('<StaffTeamMessageQuickAction compact />');
  });

  it('uses the authenticated staff messaging route and exposes all three team targets', () => {
    const component = readFileSync('components/StaffTeamMessageQuickAction.tsx', 'utf8');
    expect(component).toContain("fetch('/api/staff/messages'");
    expect(component).toContain('body: JSON.stringify({ team, message: trimmed })');
    expect(component).toContain('LAUREM_MESSAGE_TEAM_TARGETS');
    expect(component).toContain("admin: 'Admin'");
    expect(component).toContain("management: 'Management'");
    expect(component).toContain("recruitment: 'Recruitment'");
    expect(component).toContain('You do not need an email address.');
    expect(component).toContain('/staff/messages?conversation=');
  });

  it('keeps the server-side canonical team routing as the source of truth', () => {
    const route = readFileSync('app/api/staff/messages/route.ts', 'utf8');
    expect(route).toContain('getLauremMessageTarget(requestedTeam)');
    expect(route).toContain("getOrCreateAdminConversation(client, session.staff_id, team)");
  });
});
