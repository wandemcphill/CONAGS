import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';

const statuses = new Set(['scheduled','confirmed','completed','cancelled','no_show']);

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOverlapConstraintError(error: { code?: string; message?: string } | null) {
  return error?.code === '23P01' || Boolean(error?.message?.includes('laurem_staff_assignments_no_active_overlap'));
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const staffId = params.get('staffId');
  const status = params.get('status');
  let query = db().from('staff_assignments')
    .select('id,staff_id,client_name,location,scheduled_start,scheduled_end,status,notes,created_at,updated_at')
    .order('scheduled_start', { ascending: true }).limit(500);
  if (staffId) query = query.eq('staff_id', staffId);
  if (status && statuses.has(status)) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load assignments.' }, { status: 500 });

  const assignments = data || [];
  const staffIds = [...new Set(assignments.map((item: any) => item.staff_id).filter(Boolean))];
  let profiles: any[] = [];
  if (staffIds.length) {
    const { data: profileData, error: profileError } = await db().from('staff_profiles')
      .select('id,employee_number,full_name,email,job_title,employment_status')
      .in('id', staffIds);
    if (profileError) return NextResponse.json({ error: 'Unable to load assignment staff details.' }, { status: 500 });
    profiles = profileData || [];
  }
  const profileById = new Map(profiles.map((profile: any) => [profile.id, profile]));
  return NextResponse.json({ assignments: assignments.map((item: any) => ({ ...item, staff_profiles: profileById.get(item.staff_id) || null })) });
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const staffId = typeof body?.staffId === 'string' ? body.staffId : '';
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : '';
  const location = typeof body?.location === 'string' ? body.location.trim() : '';
  const start = parseDate(body?.scheduledStart);
  const end = parseDate(body?.scheduledEnd);
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!staffId || !location || !start || !end || end <= start) return NextResponse.json({ error: 'Staff, location, start time and a valid end time are required.' }, { status: 400 });

  const client = db();
  const { data: staff } = await client.from('staff_profiles').select('id,employment_status,full_name').eq('id', staffId).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  if (staff.employment_status !== 'active') return NextResponse.json({ error: 'Only active staff can be assigned to shifts.' }, { status: 409 });

  const { data: overlap } = await client.from('staff_assignments')
    .select('id').eq('staff_id', staffId).in('status', ['scheduled','confirmed'])
    .lt('scheduled_start', end.toISOString()).gt('scheduled_end', start.toISOString()).limit(1);
  if (overlap && overlap.length) return NextResponse.json({ error: 'This staff member already has an overlapping scheduled assignment.' }, { status: 409 });

  const { data: created, error } = await client.from('staff_assignments').insert({
    staff_id: staffId,
    client_name: clientName || null,
    location,
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    status: 'scheduled',
    notes: notes || null,
  }).select('id,staff_id,client_name,location,scheduled_start,scheduled_end,status,notes,created_at,updated_at').single();
  if (error || !created) {
    if (isOverlapConstraintError(error)) return NextResponse.json({ error: 'This staff member already has an overlapping scheduled assignment.' }, { status: 409 });
    return NextResponse.json({ error: 'Unable to create assignment.' }, { status: 500 });
  }
  await client.from('workforce_audit_events').insert({ assignment_id: created.id, staff_id: staffId, event_type: 'assignment.created', actor: session.email, details: { location, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString() } });
  await createLauremStaffNotification(client, {
    staffId,
    category: 'shift',
    title: 'New shift assigned',
    body: `You have been assigned a new shift at ${location} on ${start.toLocaleDateString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium' })} from ${start.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} to ${end.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}.`,
    actionUrl: '/staff/shifts',
  });
  return NextResponse.json({ assignment: created }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Assignment id is required.' }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.clientName === 'string') patch.client_name = body.clientName.trim() || null;
  if (typeof body?.location === 'string' && body.location.trim()) patch.location = body.location.trim();
  if (typeof body?.notes === 'string') patch.notes = body.notes.trim() || null;
  if (typeof body?.status === 'string') {
    if (!statuses.has(body.status)) return NextResponse.json({ error: 'Invalid assignment status.' }, { status: 400 });
    patch.status = body.status;
  }
  if (body?.scheduledStart !== undefined) {
    const d = parseDate(body.scheduledStart); if (!d) return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 }); patch.scheduled_start = d.toISOString();
  }
  if (body?.scheduledEnd !== undefined) {
    const d = parseDate(body.scheduledEnd); if (!d) return NextResponse.json({ error: 'Invalid end time.' }, { status: 400 }); patch.scheduled_end = d.toISOString();
  }
  const client = db();
  const { data: existing } = await client.from('staff_assignments').select('id,staff_id,scheduled_start,scheduled_end,status').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });

  const { data: staff } = await client.from('staff_profiles').select('id,employment_status').eq('id', existing.staff_id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  const nextStatus = String(patch.status ?? existing.status);
  if ((nextStatus === 'scheduled' || nextStatus === 'confirmed') && staff.employment_status !== 'active') {
    return NextResponse.json({ error: 'Only active staff can hold scheduled or confirmed assignments.' }, { status: 409 });
  }

  if (['cancelled', 'no_show'].includes(nextStatus) && !['cancelled', 'no_show'].includes(existing.status)) {
    const { data: linkedTimesheets, error: timesheetError } = await client.from('staff_timesheets')
      .select('id,clock_in,status')
      .eq('assignment_id', id)
      .limit(20);
    if (timesheetError) return NextResponse.json({ error: 'Unable to validate assignment attendance state.' }, { status: 500 });
    const hasAttendanceOrSubmittedTimesheet = (linkedTimesheets || []).some((timesheet: any) =>
      Boolean(timesheet.clock_in) || ['submitted', 'approved', 'paid'].includes(timesheet.status),
    );
    if (hasAttendanceOrSubmittedTimesheet) {
      return NextResponse.json({ error: 'This assignment cannot be cancelled or marked no-show after attendance or a submitted timesheet exists.' }, { status: 409 });
    }
  }

  const finalStart = patch.scheduled_start ? new Date(String(patch.scheduled_start)) : new Date(existing.scheduled_start);
  const finalEnd = patch.scheduled_end ? new Date(String(patch.scheduled_end)) : new Date(existing.scheduled_end);
  if (finalEnd <= finalStart) return NextResponse.json({ error: 'Scheduled end must be later than scheduled start.' }, { status: 400 });
  if (nextStatus === 'scheduled' || nextStatus === 'confirmed') {
    const { data: overlap, error: overlapError } = await client.from('staff_assignments').select('id').eq('staff_id', existing.staff_id).neq('id', id)
      .in('status', ['scheduled','confirmed']).lt('scheduled_start', finalEnd.toISOString()).gt('scheduled_end', finalStart.toISOString()).limit(1);
    if (overlapError) return NextResponse.json({ error: 'Unable to validate assignment overlap.' }, { status: 500 });
    if (overlap?.length) return NextResponse.json({ error: 'The updated assignment overlaps another scheduled assignment.' }, { status: 409 });
  }
  const { data: updated, error } = await client.from('staff_assignments').update(patch).eq('id', id)
    .select('id,staff_id,client_name,location,scheduled_start,scheduled_end,status,notes,created_at,updated_at').single();
  if (error || !updated) {
    if (isOverlapConstraintError(error)) return NextResponse.json({ error: 'The updated assignment overlaps another scheduled assignment.' }, { status: 409 });
    if (error?.message?.includes('ASSIGNMENT_HAS_ATTENDANCE_OR_TIMESHEET')) {
      return NextResponse.json({ error: 'This assignment cannot be cancelled or marked no-show after attendance or a submitted timesheet exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to update assignment.' }, { status: 500 });
  }
  await client.from('workforce_audit_events').insert({ assignment_id: id, staff_id: existing.staff_id, event_type: 'assignment.updated', actor: session.email, details: patch });
  const scheduleChanged = ['client_name','location','scheduled_start','scheduled_end'].some((key) => key in patch);
  const statusChanged = nextStatus !== existing.status;
  if (scheduleChanged || statusChanged) {
    const label = statusChanged ? nextStatus.replaceAll('_', ' ') : 'updated';
    await createLauremStaffNotification(client, {
      staffId: existing.staff_id,
      category: 'shift',
      title: statusChanged ? `Shift ${label}` : 'Shift updated',
      body: statusChanged
        ? `Your shift at ${updated.location} is now ${label}.`
        : `Your shift at ${updated.location} on ${new Date(updated.scheduled_start).toLocaleDateString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium' })} has been updated.`,
      actionUrl: '/staff/shifts',
    });
  }
  return NextResponse.json({ assignment: updated });
}
