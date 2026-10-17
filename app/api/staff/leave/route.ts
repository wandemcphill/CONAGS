import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';
import { LEAVE_TYPES, inclusiveCalendarDays } from '@/lib/laurem-workforce-policy';

function dbConflictMessage(error: { code?: string; message?: string } | null) {
  if (error?.code === '23P01' || error?.message?.includes('STAFF')) {
    return 'The requested leave dates conflict with an existing leave request or scheduled assignment.';
  }
  return null;
}

function normaliseLeaveType(value: unknown) {
  if (typeof value !== 'string') return '';
  const input = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'annual leave': 'annual',
    'sick leave': 'sick',
    'family leave': 'family',
    'unpaid leave': 'unpaid',
    'other leave': 'other',
    'emergency leave': 'other',
  };
  return aliases[input] || input;
}

export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { data, error } = await db().from('laurem_staff_leave_requests')
    .select('id,leave_type,start_date,end_date,total_days,reason,status,reviewed_by,reviewed_at,review_note,created_at,updated_at')
    .eq('staff_id', session.staff_id)
    .order('start_date', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load leave requests.' }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}

export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const input = body ?? {};
  const leaveType = normaliseLeaveType(input.leaveType);
  const startDate = typeof input.startDate === 'string' ? input.startDate : '';
  const endDate = typeof input.endDate === 'string' ? input.endDate : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!LEAVE_TYPES.includes(leaveType as (typeof LEAVE_TYPES)[number])) return NextResponse.json({ error: 'Invalid leave type.' }, { status: 400 });
  const totalDays = inclusiveCalendarDays(startDate, endDate);
  if (totalDays === null) return NextResponse.json({ error: 'Valid start and end dates are required, and end date must be on or after start date.' }, { status: 400 });

  const client = db();
  const { data, error } = await client.from('laurem_staff_leave_requests').insert({
    staff_id: session.staff_id,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    total_days: totalDays,
    reason: reason || null,
    status: 'pending',
  }).select('*').single();
  if (error || !data) {
    const conflict = dbConflictMessage(error);
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });
    return NextResponse.json({ error: 'Unable to submit leave request.' }, { status: 500 });
  }

  await client.from('laurem_workforce_audit_events').insert({
    staff_id: session.staff_id,
    entity_type: 'leave_request',
    entity_id: data.id,
    event_type: 'leave.submitted',
    actor: session.staff_id,
    details: {
      leaveType,
      startDate,
      endDate,
      totalDays,
    },
  });



  await recordLauremAuditEvent({
    lifecycleArea: 'workforce', entityType: 'leave_request', entityId: data.id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: 'leave_submitted', newState: 'pending',
    metadata: { leaveType, startDate, endDate, totalDays },
  });  return NextResponse.json({ request: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Leave request id is required.' }, { status: 400 });

  const { data: current, error: readError } = await db().from('laurem_staff_leave_requests')
    .select('id,status,staff_id,start_date,end_date').eq('id', id).eq('staff_id', session.staff_id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Unable to load leave request.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
  if (!['pending', 'approved'].includes(current.status)) return NextResponse.json({ error: 'This leave request can no longer be cancelled.' }, { status: 409 });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  if (current.status === 'approved' && current.start_date <= today) {
    return NextResponse.json({ error: 'Approved leave that has started or is due today cannot be cancelled from the Staff Portal. Please contact CONAGS HR.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await db().from('laurem_staff_leave_requests').update({
    status: 'cancelled',
    updated_at: now,
  }).eq('id', id).eq('staff_id', session.staff_id).select('*').single();
  if (error || !data) {
    const conflict = dbConflictMessage(error);
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });
    return NextResponse.json({ error: 'Unable to cancel leave request.' }, { status: 500 });
  }

  await db().from('laurem_workforce_audit_events').insert({
    staff_id: session.staff_id,
    entity_type: 'leave_request',
    entity_id: id,
    event_type: 'leave.cancelled_by_staff',
    actor: session.staff_id,
    details: { from: current.status, to: 'cancelled' },
  });

  await recordLauremAuditEvent({
    lifecycleArea: 'workforce', entityType: 'leave_request', entityId: id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: 'leave_cancelled',
    previousState: current.status, newState: 'cancelled',
  });

  return NextResponse.json({ request: data });
}
