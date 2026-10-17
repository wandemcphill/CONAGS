import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS staff notification centre', () => {
  it('defines a private CONAGS notification table and maps it through the server db client', () => {
    const sql = readFileSync('supabase/migrations/20260920_staff_notification_center.sql', 'utf8');
    const db = readFileSync('lib/db.ts', 'utf8');
    expect(sql).toContain('create table if not exists public.laurem_staff_notifications');
    expect(sql).toContain('references public.laurem_staff_profiles(id)');
    expect(sql).toContain('alter table public.laurem_staff_notifications enable row level security');
    expect(sql).toContain('revoke all on public.laurem_staff_notifications from anon, authenticated');
    expect(sql).toContain('grant all on public.laurem_staff_notifications to service_role');
    expect(db).toContain("'staff_notifications'");
  });

  it('exposes authenticated staff-only read and mark-read operations', () => {
    const route = readFileSync('app/api/staff/notifications/route.ts', 'utf8');
    expect(route).toContain('getStaffSession(request)');
    expect(route).toContain("from('laurem_staff_notifications')");
    expect(route).toContain(".eq('staff_id', session.staff_id)");
    expect(route).toContain("body?.all");
    expect(route).toContain(".eq('id', id)");
    expect(route).toContain(".eq('staff_id', session.staff_id)");
  });

  it('provides a dedicated notification page and dashboard entry point', () => {
    const page = readFileSync('app/staff/notifications/page.tsx', 'utf8');
    const dashboard = readFileSync('components/StaffHomeDashboard.tsx', 'utf8');
    expect(page).toContain('Mark all as read');
    expect(page).toContain('/api/staff/notifications');
    expect(dashboard).toContain('/staff/notifications');
    expect(dashboard).toContain("notifications.some(n=>!n.read_at)");
  });

  it('emits notifications from key workforce events', () => {
    for (const path of [
      'app/api/admin/messages/[id]/route.ts',
      'app/api/admin/workforce/leave/route.ts',
      'app/api/admin/workforce/staff/[staffId]/visa-sponsorship/route.ts',
      'app/api/admin/workforce/staff/[staffId]/documents/route.ts',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('createLauremStaffNotification');
    }
  });

  it('keeps notification creation server-side', () => {
    const helper = readFileSync('lib/laurem-staff-notifications.ts', 'utf8');
    expect(helper).toContain("from('laurem_staff_notifications')");
    expect(helper).not.toContain('NEXT_PUBLIC_');
  });
});
