import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { LEAVE_TRANSITIONS, transitionAllowed } from '@/lib/laurem-workforce-policy';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const status = new URL(request.url).searchParams.get('status');
  let query = db().from('staff_leave_requests')
    .select('id,staff_id,leave_type,start_date,end_date,total_days,reason,status,reviewed_by,reviewed_at,review_note,created_at,updated_at')
    .order('start_date', { ascending: false }).limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load leave requests.' }, { status: 500 });

  const requests = data || [];
  const staffIds = [...new Set(requests.map((item: any) => item.staff_id).filter(Boolean))];
  let profiles: any[] = [];
  if (staffIds.length) {
    const { data: profileData, error: profileError } = await db().from('staff_profiles')
      .select('id,full_name,email,job_title,employee_number').in('id', staffIds);
    if (profileError) return NextResponse.json({ error: 'Unable to load leave staff details.' }, { status: 500 });
    profiles = profileData || [];
  }
  const profileById = new Map(profiles.map((profile: any) => [profile.id, profile]));
  return NextResponse.json({ requests: requests.map((item: any) => ({ ...item, staff_profiles: profileById.get(item.staff_id) || null })) });
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const nextStatus = typeof body?.status === 'string' ? body.status : '';
  const reviewNote = typeof body?.reviewNote === 'string' ? body.reviewNote.trim() : '';
  if (!id) return NextResponse.json({ error: 'Leave request id is required.' }, { status: 400 });
  if (!['approved', 'rejected', 'cancelled'].includes(nextStatus)) return NextResponse.json({ error: 'Invalid leave status.' }, { status: 400 });
  if ((nextStatus === 'rejected' || nextStatus === 'cancelled') && !reviewNote) return NextResponse.json({ error: 'A review note is required when rejecting or cancelling leave.' }, { status: 400 });

  const client = db();
  const { data: current, error: readError } = await client.from('staff_leave_requests')
    .select('id,staff_id,status,start_date,end_date,leave_type,total_days').eq('id', id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Unable to load leave request.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
  if (!transitionAllowed(LEAVE_TRANSITIONS, current.status, nextStatus)) {
    return NextResponse.json({ error: `Transition from ${current.status} to ${nextStatus} is not allowed.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await client.from('staff_leave_requests').update({
    status: nextStatus,
    reviewed_by: session.email,
    reviewed_at: now,
    review_note: reviewNote || null,
    updated_at: now,
  }).eq('id', id).eq('status', current.status).select('*').single();
  if (error || !data) {
    const message = error?.message || '';
    if (message.includes('LEAVE_CONFLICTS_WITH_SCHEDULED_ASSIGNMENT')) {
      return NextResponse.json({ error: 'This leave period conflicts with a scheduled or confirmed assignment.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to update leave request.' }, { status: 500 });
  }

  await createLauremStaffNotification(client, {
    staffId: current.staff_id,
    category: 'leave',
    title: `Leave request ${nextStatus}`,
    body: `Your ${current.leave_type} leave request for ${current.start_date} to ${current.end_date} was ${nextStatus}.${reviewNote ? ` Review note: ${reviewNote}` : ''}`,
    actionUrl: '/staff',
  });

  await client.from('workforce_audit_events').insert({
    staff_id: current.staff_id,
    entity_type: 'leave_request',
    entity_id: id,
    event_type: `leave.${nextStatus}`,
    actor: session.email,
    details: {
      from: current.status,
      to: nextStatus,
      startDate: current.start_date,
      endDate: current.end_date,
      leaveType: current.leave_type,
      reviewNote: reviewNote || null,
    },
  });

  return NextResponse.json({ request: data });
}
