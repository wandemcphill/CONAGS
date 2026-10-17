import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS admin staff messaging', () => {
  it('uses the canonical CONAGS messaging namespace', () => {
    for (const path of [
      'app/api/admin/messages/route.ts',
      'app/api/admin/messages/[id]/route.ts',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain("from('laurem_staff_message_conversations')");
      expect(source).toContain("from('laurem_staff_message_participants')");
      expect(source).toContain("from('laurem_staff_messages')");
      expect(source).toContain("from('laurem_staff_profiles')");
      expect(source).not.toContain("from('staff_message_conversations')");
      expect(source).not.toContain("from('staff_message_participants')");
      expect(source).not.toContain("from('staff_messages')");
    }
  });

  it('keeps the admin inbox unread state persistent until the conversation is opened', () => {
    const migration = readFileSync('supabase/migrations/20261003170000_admin_message_read_state.sql', 'utf8');
    const route = readFileSync('app/api/admin/messages/[id]/route.ts', 'utf8');
    const listRoute = readFileSync('app/api/admin/messages/route.ts', 'utf8');

    expect(migration).toContain('admin_last_read_at timestamptz');
    expect(route).toContain("update({ admin_last_read_at: adminReadAt })");
    expect(route).toContain("admin_last_read_at: created.created_at");
    expect(listRoute).toContain('conversation.admin_last_read_at');
    expect(listRoute).toContain('unreadCount');
  });

  it('preserves authenticated admin review and reply behavior', () => {
    const page = readFileSync('app/admin/messages/page.tsx', 'utf8');
    const route = readFileSync('app/api/admin/messages/[id]/route.ts', 'utf8');

    expect(page).toContain("fetch('/api/admin/messages'");
    expect(page).toContain('openConversation');
    expect(page).toContain('Reply');
    expect(route).toContain('readAdminSession(req)');
    expect(route).toContain('createLauremStaffNotification');
  });
});
