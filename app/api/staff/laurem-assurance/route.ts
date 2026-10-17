import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { db } from '@/lib/db';
import { fetchLauremAssuranceSnapshot } from '@/lib/laurem-assurance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const snapshot = await fetchLauremAssuranceSnapshot();
    const client = db();

    const [staffResult, notificationsResult] = await Promise.all([
      client.from('laurem_staff_profiles')
        .select('id,full_name,job_title,location,employment_status')
        .eq('id', session.staff_id)
        .maybeSingle(),
      client.from('laurem_staff_notifications')
        .select('id,title,body,created_at,action_url')
        .eq('staff_id', session.staff_id)
        .eq('category','compliance')
        .order('created_at',{ascending:false})
        .limit(5),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (!staffResult.data) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 });

    return NextResponse.json({
      ...snapshot,
      staff: staffResult.data,
      relatedNotifications: notificationsResult.data || [],
    });
  } catch (error) {
    console.error(JSON.stringify({
      level:'error',
      event:'staff.laurem_assurance.load_failed',
      staffId: session.staff_id,
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error:'Unable to load CONAGS assurance information.' }, { status:500 });
  }
}
