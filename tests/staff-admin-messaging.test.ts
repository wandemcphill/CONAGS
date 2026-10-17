import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff admin messaging', () => {
  it('uses a team-scoped staff-to-admin conversation without creating an admin staff mailbox', () => {
    const helper = readFileSync('lib/laurem-messaging.ts', 'utf8');
    const route = readFileSync('app/api/staff/messages/route.ts', 'utf8');

    expect(helper).toContain('getOrCreateAdminConversation');
    expect(helper).toContain('direct_key');
    expect(helper).toContain('const key = `${team}:${staffId}`;');
    expect(helper).toContain('created_by_staff_id: null, inbox_team: team');
    expect(route).toContain("'__laurem_admin__'");
    expect(route).toContain('getOrCreateAdminConversation');
    expect(route).toContain('recipient_staff_id: recipientStaffId');
    expect(route).toContain("event_type: 'staff.message.sent'");
  });

  it('exposes team inbox choices and identifies admin threads in the staff portal', () => {
    const route = readFileSync('app/api/staff/messages/route.ts', 'utf8');
    const page = readFileSync('app/staff/messages/page.tsx', 'utf8');

    expect(route).toContain('LAUREM_MESSAGE_TEAM_TARGETS');
    expect(route).toContain('messageTargets: LAUREM_MESSAGE_TEAM_TARGETS');
    expect(route).toContain('isAdminThread');
    expect(route).toContain("address: target ? `__laurem_${target.key}__` : '__laurem_admin__'");
    expect(page).toContain('Message a CONAGS team');
    expect(page).toContain('messageTargets.map');
    expect(page).toContain('aria-label="Message recipient team"');
    expect(page).toContain('staff-message-stream');
  });
});
