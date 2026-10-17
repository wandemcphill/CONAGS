import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { isMutableTimesheetStatus, isDateOnly } from '@/lib/laurem-workforce-policy';
import { validateAssignedTimesheet } from '@/lib/laurem-workforce-integrity';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';

function hoursBetween(clockIn: string, clockOut: string, breakMinutes: number) {
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.max(0, Math.round((end - start) / 60000) - breakMinutes);
  return Number((minutes / 60).toFixed(2));
}

function validTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function lockedError(error: { message?: string } | null) {
  if (!error?.message) return false;
  return error.message.includes('TIMESHEET_PAYROLL_PERIOD_LOCKED') || error.message.includes('APPROVED_TIMESHEET_IS_IMMUTABLE');
}

export async function GET(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { data, error } = await db().from('laurem_staff_timesheets')
    .select('id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,approved_by,approved_at,created_at,updated_at')
    .eq('staff_id', session.staff_id)
    .order('work_date', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load timesheets.' }, { status: 500 });
  return NextResponse.json({ timesheets: data || [] });
}

export async function POST(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const input = body ?? {};
  const workDate = typeof input.workDate === 'string' ? input.workDate : '';
  const clockIn = typeof input.clockIn === 'string' ? input.clockIn : '';
  const clockOut = typeof input.clockOut === 'string' ? input.clockOut : '';
  const breakMinutes = Number.isInteger(input.breakMinutes) ? Number(input.breakMinutes) : 0;
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (!isDateOnly(workDate) || !validTimestamp(clockIn) || !validTimestamp(clockOut) || breakMinutes < 0 || breakMinutes > 480) {
    return NextResponse.json({ error: 'Work date, clock-in, clock-out and a valid break duration are required.' }, { status: 400 });
  }
  const totalHours = hoursBetween(clockIn, clockOut, breakMinutes);
  if (totalHours === null) return NextResponse.json({ error: 'Clock-out must be later than clock-in.' }, { status: 400 });

  const assignmentId = typeof input.assignmentId === 'string' ? input.assignmentId.trim() : '';
  if (!assignmentId) {
    return NextResponse.json({ error: 'A valid CONAGS assignment is required for every staff timesheet.' }, { status: 400 });
  }

  const client = db();
  const { data: assignment } = await client.from('laurem_staff_assignments')
    .select('id,staff_id,scheduled_start,scheduled_end,status')
    .eq('id', assignmentId)
    .eq('staff_id', session.staff_id)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });

  const validation = validateAssignedTimesheet(assignment, {
    assignmentId,
    workDate,
    clockIn,
    clockOut,
  });
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });
  const { data: created, error } = await client.from('laurem_staff_timesheets').insert({
    staff_id: session.staff_id,
    assignment_id: assignmentId,
    work_date: workDate,
    clock_in: new Date(clockIn).toISOString(),
    clock_out: new Date(clockOut).toISOString(),
    break_minutes: breakMinutes,
    total_hours: totalHours,
    status: 'submitted',
    notes: notes || null,
  }).select('id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,created_at,updated_at').single();
  if (error || !created) {
    if (error?.code === '23505') return NextResponse.json({ error: 'A timesheet already exists for this assignment. Use the existing attendance record.' }, { status: 409 });
    if (lockedError(error)) return NextResponse.json({ error: 'This date is inside a locked payroll period and cannot be changed.' }, { status: 409 });
    return NextResponse.json({ error: 'Unable to submit timesheet.' }, { status: 500 });
  }
  await recordLauremAuditEvent({
    lifecycleArea: 'workforce', entityType: 'timesheet', entityId: created.id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: 'timesheet_submitted', newState: 'submitted',
    metadata: { assignmentId: created.assignment_id, workDate: created.work_date, totalHours: created.total_hours },
  });

  return NextResponse.json({ timesheet: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getStaffSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Timesheet id is required.' }, { status: 400 });

  const { data: current, error: readError } = await db().from('laurem_staff_timesheets')
    .select('id,staff_id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes')
    .eq('id', id).eq('staff_id', session.staff_id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Unable to load timesheet.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Timesheet not found.' }, { status: 404 });
  if (!isMutableTimesheetStatus(current.status)) return NextResponse.json({ error: 'Approved or paid timesheets cannot be edited.' }, { status: 409 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const nextWorkDate = body?.workDate === undefined ? current.work_date : String(body.workDate);
  const nextClockIn = body?.clockIn === undefined ? current.clock_in : String(body.clockIn);
  const nextClockOut = body?.clockOut === undefined ? current.clock_out : String(body.clockOut);
  const nextBreak = body?.breakMinutes === undefined ? Number(current.break_minutes) : Number(body.breakMinutes);
  const notes = body?.notes === undefined ? current.notes : (typeof body.notes === 'string' ? body.notes.trim() || null : null);
  const nextAssignment = body?.assignmentId === undefined
    ? current.assignment_id
    : (typeof body.assignmentId === 'string' ? body.assignmentId.trim() : null);
  const resubmit = body?.submit === true;

  if (!nextAssignment) {
    return NextResponse.json({ error: 'A valid CONAGS assignment is required for every staff timesheet.' }, { status: 409 });
  }

  if (!isDateOnly(nextWorkDate) || !validTimestamp(nextClockIn) || !validTimestamp(nextClockOut) || !Number.isInteger(nextBreak) || nextBreak < 0 || nextBreak > 480) {
    return NextResponse.json({ error: 'Work date, timestamps and break duration are invalid.' }, { status: 400 });
  }
  const totalHours = hoursBetween(nextClockIn, nextClockOut, nextBreak);
  if (totalHours === null) return NextResponse.json({ error: 'Clock-out must be later than clock-in.' }, { status: 400 });

  if (current.assignment_id && !nextAssignment && ['submitted', 'approved', 'paid'].includes(current.status)) {
    return NextResponse.json({ error: 'Submitted or approved assigned timesheets cannot be detached from their assignment.' }, { status: 409 });
  }

  {
    const { data: assignment } = await db().from('laurem_staff_assignments')
      .select('id,staff_id,scheduled_start,scheduled_end,status')
      .eq('id', nextAssignment)
      .eq('staff_id', session.staff_id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
    const validation = validateAssignedTimesheet(assignment, {
      assignmentId: nextAssignment,
      workDate: nextWorkDate,
      clockIn: nextClockIn,
      clockOut: nextClockOut,
    });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });
  }

  const nextStatus = resubmit ? 'submitted' : current.status;
  const { data: updated, error } = await db().from('laurem_staff_timesheets').update({
    assignment_id: nextAssignment,
    work_date: nextWorkDate,
    clock_in: new Date(nextClockIn).toISOString(),
    clock_out: new Date(nextClockOut).toISOString(),
    break_minutes: nextBreak,
    total_hours: totalHours,
    status: nextStatus,
    approved_by: nextStatus === 'submitted' ? null : undefined,
    approved_at: nextStatus === 'submitted' ? null : undefined,
    notes,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('staff_id', session.staff_id).select('id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,created_at,updated_at').single();
  if (error || !updated) {
    if (lockedError(error)) return NextResponse.json({ error: 'This timesheet is locked because its payroll period is processing or closed.' }, { status: 409 });
    if (error?.message?.includes('TIMESHEET_WORK_DATE_MISMATCH') || error?.message?.includes('TIMESHEET_CLOCK_IN_TOO_EARLY') || error?.message?.includes('TIMESHEET_CLOCK_IN_AFTER_ASSIGNMENT') || error?.message?.includes('TIMESHEET_ASSIGNMENT_NOT_ACTIVE') || error?.message?.includes('TIMESHEET_ASSIGNMENT_STAFF_MISMATCH') || error?.message?.includes('TIMESHEET_CLOCK_ORDER_INVALID') || error?.message?.includes('ASSIGNMENT_NOT_FOUND_FOR_TIMESHEET') || error?.message?.includes('SUBMITTED_ASSIGNED_TIMESHEET_CANNOT_BE_DETACHED')) {
      return NextResponse.json({ error: 'The assigned timesheet does not satisfy workforce integrity rules.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to update timesheet.' }, { status: 500 });
  }
  await recordLauremAuditEvent({
    lifecycleArea: 'workforce', entityType: 'timesheet', entityId: updated.id, staffId: session.staff_id,
    actorType: 'staff', actor: session.email, action: resubmit ? 'timesheet_resubmitted' : 'timesheet_updated',
    previousState: current.status, newState: updated.status,
    metadata: { assignmentId: updated.assignment_id, workDate: updated.work_date, totalHours: updated.total_hours },
  });

  return NextResponse.json({ timesheet: updated });
}
