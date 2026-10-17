import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Mega-Build 25 staff navigation intelligence', () => {
  it('keeps navigation status authenticated and scoped to the staff identity', () => {
    const api = readFileSync('app/api/staff/navigation-summary/route.ts', 'utf8');
    const shell = readFileSync('components/StaffShell.tsx', 'utf8');
    expect(api).toContain('getStaffSession');
    expect(api).toContain('session.staff_id');
    expect(api).toContain('laurem_staff_notifications');
    expect(api).toContain('laurem_staff_documents');
    expect(api).toContain('laurem_staff_timesheets');
    expect(api).toContain('getStaffConversationSummaries');
    expect(shell).toContain('/api/staff/navigation-summary');
    expect(shell).toContain('staff-nav-badge');
    expect(shell).toContain('pendingSignatures');
    expect(shell).toContain('unreadMessages');
  });
});
