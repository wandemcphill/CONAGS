import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { getStaffConversationSummaries } from '@/lib/laurem-messaging';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const [notificationsResult, documentsResult, timesheetsResult, assignmentsResult, messages] = await Promise.all([
      client.from('laurem_staff_notifications').select('id,read_at').eq('staff_id', session.staff_id).order('created_at', { ascending: false }).limit(40),
      client.from('laurem_staff_documents').select('id,signature_status').eq('staff_id', session.staff_id).eq('status', 'issued').eq('signature_status', 'pending').limit(20),
      client.from('laurem_staff_timesheets').select('id,status').eq('staff_id', session.staff_id).in('status', ['submitted', 'rejected']).limit(30),
      client.from('laurem_staff_assignments').select('id,status').eq('staff_id', session.staff_id).in('status', ['scheduled', 'confirmed']).limit(30),
      getStaffConversationSummaries(client, session.staff_id, 8),
    ]);

    const failed = [notificationsResult, documentsResult, timesheetsResult, assignmentsResult].find((result) => result.error);
    if (failed?.error) return NextResponse.json({ error: 'Unable to load staff navigation status.' }, { status: 500 });

    return NextResponse.json({
      unreadNotifications: (notificationsResult.data || []).filter((row: any) => !row.read_at).length,
      unreadMessages: messages.filter((row: any) => row.unread).length,
      pendingSignatures: (documentsResult.data || []).length,
      timesheetActionNeeded: (timesheetsResult.data || []).length,
      upcomingShifts: (assignmentsResult.data || []).length,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'staff.navigation_summary.load_failed', staffId: session.staff_id, reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to load staff navigation status.' }, { status: 500 });
  }
}
