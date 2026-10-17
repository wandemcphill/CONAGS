import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff team messaging', () => {
  it('defines distinct shared inbox targets', () => {
    const source = readFileSync('lib/laurem-messaging.ts', 'utf8');
    expect(source).toContain("key: 'admin'");
    expect(source).toContain("key: 'management'");
    expect(source).toContain("key: 'recruitment'");
    expect(source).toContain('getLauremMessageTarget');
  });

  it('stores the selected inbox team on conversations', () => {
    const migration = readFileSync('supabase/migrations/20261003193000_staff_message_team_routing.sql', 'utf8');
    const messaging = readFileSync('lib/laurem-messaging.ts', 'utf8');
    const route = readFileSync('app/api/staff/messages/route.ts', 'utf8');

    expect(migration).toContain('inbox_team text');
    expect(migration).toContain("inbox_team in ('admin','management','recruitment')");
    expect(messaging).toContain('inbox_team: team');
    expect(route).toContain("body?.team");
    expect(route).toContain('getOrCreateAdminConversation(client, session.staff_id, team)');
  });

  it('keeps the staff UI on a dropdown instead of manual team addresses', () => {
    const page = readFileSync('app/staff/messages/page.tsx', 'utf8');
    expect(page).toContain('Message a CONAGS team');
    expect(page).toContain('Message recipient team');
    expect(page).toContain('messageTargets.map');
    expect(page).toContain('body:JSON.stringify({team,message})');
    expect(page).not.toContain('placeholder="__laurem_admin__ or staff address"');
  });

  it('lets the admin inbox identify and filter team-routed conversations', () => {
    const route = readFileSync('app/api/admin/messages/route.ts', 'utf8');
    const page = readFileSync('app/admin/messages/page.tsx', 'utf8');
    expect(route).toContain('inbox_team');
    expect(route).toContain('getLauremMessageTarget');
    expect(page).toContain('teamFilter');
    expect(page).toContain('Management');
    expect(page).toContain('Recruitment');
  });
});
