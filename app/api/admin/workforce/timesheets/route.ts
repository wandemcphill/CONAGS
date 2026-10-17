import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { TIMESHEET_TRANSITIONS, transitionAllowed } from '@/lib/laurem-workforce-policy';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { validateAssignedTimesheet } from '@/lib/laurem-workforce-integrity';

function validTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function hoursBetween(clockIn: string, clockOut: string, breakMinutes: number) {
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.max(0, Math.round((end - start) / 60000) - breakMinutes);
  return Number((minutes / 60).toFixed(2));
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const status = new URL(request.url).searchParams.get('status');
  let query = db().from('staff_timesheets')
    .select('id,staff_id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,approved_by,approved_at,created_at,updated_at')
    .order('work_date', { ascending: false }).limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load timesheets.' }, { status: 500 });

  const timesheets = data || [];
  const staffIds = [...new Set(timesheets.map((item: any) => item.staff_id).filter(Boolean))];
  let profiles: any[] = [];
  if (staffIds.length) {
    const { data: profileData, error: profileError } = await db().from('staff_profiles')
      .select('id,full_name,email,job_title,employee_number').in('id', staffIds);
    if (profileError) return NextResponse.json({ error: 'Unable to load timesheet staff details.' }, { status: 500 });
    profiles = profileData || [];
  }
  const profileById = new Map(profiles.map((profile: any) => [profile.id, profile]));
  return NextResponse.json({ timesheets: timesheets.map((item: any) => ({ ...item, staff_profiles: profileById.get(item.staff_id) || null })) });
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!id) return NextResponse.json({ error: 'Timesheet id is required.' }, { status: 400 });

  const client = db();
  const { data: current, error: readError } = await client.from('staff_timesheets')
    .select('id,staff_id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes')
    .eq('id', id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Unable to load timesheet.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Timesheet not found.' }, { status: 404 });

  const requestedStatus = typeof body?.status === 'string' ? body.status : current.status;
  if (requestedStatus !== current.status && !transitionAllowed(TIMESHEET_TRANSITIONS, current.status, requestedStatus)) {
    return NextResponse.json({ error: `Transition from ${current.status} to ${requestedStatus} is not allowed.` }, { status: 409 });
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : null;
  if (requestedStatus === 'rejected' && !note) return NextResponse.json({ error: 'A rejection note is required.' }, { status: 400 });

  const workDate = body?.workDate === undefined ? current.work_date : String(body.workDate);
  const clockIn = body?.clockIn === undefined ? current.clock_in : String(body.clockIn);
  const clockOut = body?.clockOut === undefined ? current.clock_out : String(body.clockOut);
  const breakMinutes = body?.breakMinutes === undefined ? Number(current.break_minutes) : Number(body.breakMinutes);
  const assignmentId = body?.assignmentId === undefined ? current.assignment_id : (typeof body.assignmentId === 'string' ? body.assignmentId : null);
  const notes = body?.notes === undefined ? (note || current.notes) : (typeof body.notes === 'string' ? body.notes.trim() || null : null);

  if (requestedStatus !== 'paid' && (!validTimestamp(clockIn) || !validTimestamp(clockOut) || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480)) {
    return NextResponse.json({ error: 'Invalid clock times or break duration.' }, { status: 400 });
  }
  const totalHours = requestedStatus === 'paid' ? Number(current.total_hours) : hoursBetween(clockIn, clockOut, breakMinutes);
  if (requestedStatus !== 'paid' && totalHours === null) return NextResponse.json({ error: 'Clock-out must be later than clock-in.' }, { status: 400 });
  if (['approved', 'paid'].includes(requestedStatus) && (!(totalHours && totalHours > 0))) return NextResponse.json({ error: 'Only timesheets with positive hours can be approved or paid.' }, { status: 409 });

  if (current.assignment_id && !assignmentId && ['submitted', 'approved', 'paid'].includes(requestedStatus)) {
    return NextResponse.json({ error: 'Submitted or approved assigned timesheets cannot be detached from their assignment.' }, { status: 409 });
  }

  if (assignmentId) {
    const { data: assignment } = await client.from('staff_assignments')
      .select('id,staff_id,scheduled_start,scheduled_end,status')
      .eq('id', assignmentId)
      .eq('staff_id', current.staff_id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found for this staff member.' }, { status: 404 });
    const validation = validateAssignedTimesheet(assignment, {
      assignmentId,
      workDate,
      clockIn,
      clockOut,
    });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await client.from('staff_timesheets').update({
    assignment_id: assignmentId,
    work_date: workDate,
    clock_in: new Date(clockIn).toISOString(),
    clock_out: new Date(clockOut).toISOString(),
    break_minutes: breakMinutes,
    total_hours: totalHours,
    status: requestedStatus,
    approved_by: ['approved', 'paid'].includes(requestedStatus) ? session.email : null,
    approved_at: ['approved', 'paid'].includes(requestedStatus) ? now : null,
    notes,
    updated_at: now,
  }).eq('id', id).eq('status', current.status).select('*').single();
  if (error || !data) {
    if (error?.message?.includes('TIMESHEET_PAYROLL_PERIOD_LOCKED') || error?.message?.includes('APPROVED_TIMESHEET_IS_IMMUTABLE')) {
      return NextResponse.json({ error: 'This timesheet is locked because payroll is processing or closed.' }, { status: 409 });
    }
    if (error?.message?.includes('TIMESHEET_WORK_DATE_MISMATCH') || error?.message?.includes('TIMESHEET_CLOCK_IN_TOO_EARLY') || error?.message?.includes('TIMESHEET_CLOCK_IN_AFTER_ASSIGNMENT') || error?.message?.includes('TIMESHEET_ASSIGNMENT_NOT_ACTIVE') || error?.message?.includes('TIMESHEET_ASSIGNMENT_STAFF_MISMATCH') || error?.message?.includes('TIMESHEET_CLOCK_ORDER_INVALID') || error?.message?.includes('ASSIGNMENT_NOT_FOUND_FOR_TIMESHEET') || error?.message?.includes('SUBMITTED_ASSIGNED_TIMESHEET_CANNOT_BE_DETACHED')) {
      return NextResponse.json({ error: 'The assigned timesheet does not satisfy workforce integrity rules.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to update timesheet.' }, { status: 500 });
  }

  if (requestedStatus === 'approved' || requestedStatus === 'rejected') {
    await createLauremStaffNotification(client, {
      staffId: current.staff_id,
      category: 'timesheet',
      title: `Timesheet ${requestedStatus}`,
      body: `Your timesheet for ${current.work_date} was ${requestedStatus} by CONAGS Admin.${note ? ` Note: ${note}` : ''}`,
      actionUrl: '/staff/timesheets',
    });
  }

  await client.from('workforce_audit_events').insert({
    staff_id: current.staff_id,
    entity_type: 'timesheet',
    entity_id: id,
    event_type: `timesheet.${requestedStatus}`,
    actor: session.email,
    details: {
      from: current.status,
      to: requestedStatus,
      assignmentId,
      workDate,
      totalHours,
      note,
    },
  });
  return NextResponse.json({ timesheet: data });
}
