import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';

function validBreakMinutes(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 480;
}

function withinClockInWindow(start: string, end: string, now = Date.now()) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return now >= startMs - (2 * 60 * 60 * 1000) && now <= endMs;
}

function totalHours(clockIn: string, clockOut: string, breakMinutes: number) {
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.max(0, Math.round((end - start) / 60000) - breakMinutes);
  return Number((minutes / 60).toFixed(2));
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const now = new Date().toISOString();
  const [{ data: shifts, error: shiftError }, { data: attendance, error: attendanceError }] = await Promise.all([
    client.from('laurem_staff_assignments')
      .select('id,client_name,location,scheduled_start,scheduled_end,status,notes')
      .eq('staff_id', session.staff_id)
      .gte('scheduled_end', now)
      .not('status', 'in', '(cancelled,no_show)')
      .order('scheduled_start', { ascending: true })
      .limit(30),
    client.from('laurem_staff_timesheets')
      .select('id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,created_at,updated_at')
      .eq('staff_id', session.staff_id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (shiftError || attendanceError) {
    return NextResponse.json({ error: 'Unable to load your time and attendance.' }, { status: 500 });
  }

  return NextResponse.json({ shifts: shifts || [], attendance: attendance || [] });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const assignmentId = typeof body?.assignmentId === 'string' ? body.assignmentId : '';
  if (!assignmentId) return NextResponse.json({ error: 'assignmentId is required.' }, { status: 400 });

  const client = db();
  const { data: staff } = await client.from('laurem_staff_profiles')
    .select('id,employment_status')
    .eq('id', session.staff_id)
    .maybeSingle();
  if (!staff || staff.employment_status !== 'active') {
    return NextResponse.json({ error: 'Only active CONAGS staff can record attendance.' }, { status: 403 });
  }

  const { data: assignment } = await client.from('laurem_staff_assignments')
    .select('id,staff_id,scheduled_start,scheduled_end,status,location,client_name')
    .eq('id', assignmentId)
    .eq('staff_id', session.staff_id)
    .maybeSingle();
  if (!assignment || ['cancelled', 'no_show'].includes(assignment.status)) {
    return NextResponse.json({ error: 'This assignment is not eligible for attendance.' }, { status: 409 });
  }

  const { data: existing } = await client.from('laurem_staff_timesheets')
    .select('*')
    .eq('staff_id', session.staff_id)
    .eq('assignment_id', assignment.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (action === 'clock_in') {
    if (!withinClockInWindow(assignment.scheduled_start, assignment.scheduled_end)) {
      return NextResponse.json({ error: 'Clock-in is available from 2 hours before the assignment until its scheduled finish.' }, { status: 409 });
    }
    if (existing?.clock_in && !existing.clock_out) {
      return NextResponse.json({ error: 'You are already clocked in for this assignment.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { data: created, error } = await client.from('laurem_staff_timesheets').insert({
      staff_id: session.staff_id,
      assignment_id: assignment.id,
      work_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(now)),
      clock_in: now,
      break_minutes: 0,
      status: 'draft',
      notes: null,
    }).select('id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,created_at,updated_at').single();

    if (error || !created) {
      if (error?.code === '23505') return NextResponse.json({ error: 'A timesheet already exists for this assignment.' }, { status: 409 });
      return NextResponse.json({ error: 'Unable to clock in.' }, { status: 500 });
    }

    await client.from('laurem_workforce_audit_events').insert({
      staff_id: session.staff_id,
      assignment_id: assignment.id,
      entity_type: 'timesheet',
      entity_id: created.id,
      event_type: 'attendance.clocked_in',
      actor: session.staff_id,
      details: { assignmentId: assignment.id, clockIn: created.clock_in },
    });

    await recordLauremAuditEvent({
      lifecycleArea: 'workforce', entityType: 'timesheet', entityId: created.id, staffId: session.staff_id,
      actorType: 'staff', actor: session.email, action: 'attendance_clocked_in',
      newState: 'draft', metadata: { assignmentId: assignment.id, clockIn: created.clock_in },
    });

    return NextResponse.json({ timesheet: created }, { status: 201 });
  }

  if (action === 'clock_out') {
    if (!existing?.clock_in || existing.clock_out) {
      return NextResponse.json({ error: 'You must have an open attendance record before clocking out.' }, { status: 409 });
    }

    const breakMinutes = body?.breakMinutes === undefined ? Number(existing.break_minutes || 0) : Number(body.breakMinutes);
    if (!validBreakMinutes(breakMinutes)) {
      return NextResponse.json({ error: 'Break minutes must be a whole number between 0 and 480.' }, { status: 400 });
    }

    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : null;
    const now = new Date().toISOString();
    const hours = totalHours(existing.clock_in, now, breakMinutes);
    if (hours === null) return NextResponse.json({ error: 'Clock-out time must be after clock-in.' }, { status: 409 });

    const { data: updated, error } = await client.from('laurem_staff_timesheets').update({
      clock_out: now,
      break_minutes: breakMinutes,
      total_hours: hours,
      status: 'submitted',
      notes: notes || existing.notes || null,
      updated_at: now,
    }).eq('id', existing.id).eq('staff_id', session.staff_id).is('clock_out', null)
      .select('id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,created_at,updated_at').single();

    if (error || !updated) return NextResponse.json({ error: 'Unable to clock out. The attendance record may already have been updated.' }, { status: 409 });

    await client.from('laurem_workforce_audit_events').insert({
      staff_id: session.staff_id,
      assignment_id: assignment.id,
      entity_type: 'timesheet',
      entity_id: updated.id,
      event_type: 'attendance.clocked_out',
      actor: session.staff_id,
      details: { assignmentId: assignment.id, clockOut: updated.clock_out, breakMinutes, totalHours: updated.total_hours },
    });

    await recordLauremAuditEvent({
      lifecycleArea: 'workforce', entityType: 'timesheet', entityId: updated.id, staffId: session.staff_id,
      actorType: 'staff', actor: session.email, action: 'attendance_clocked_out',
      previousState: 'draft', newState: 'submitted', metadata: { assignmentId: assignment.id, clockOut: updated.clock_out, totalHours: updated.total_hours },
    });

    return NextResponse.json({ timesheet: updated });
  }

  return NextResponse.json({ error: 'Unsupported attendance action.' }, { status: 400 });
}
