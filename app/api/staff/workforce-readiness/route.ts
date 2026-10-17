import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { buildWorkforceReadiness } from '@/lib/laurem-workforce-readiness';

function countByStatus(rows: Array<{ status: string | null }>, status: string) {
  return rows.filter((row) => row.status === status).length;
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const now = new Date().toISOString();
    const [{ data: staff, error: staffError }, { data: assignments, error: assignmentError }, { data: attendance, error: attendanceError }, { data: timesheets, error: timesheetError }, { data: leave, error: leaveError }, { data: latestPeriod, error: periodError }] = await Promise.all([
      client.from('laurem_staff_profiles').select('id,employment_status').eq('id', session.staff_id).maybeSingle(),
      client.from('laurem_staff_assignments').select('id,scheduled_end,status').eq('staff_id', session.staff_id).in('status', ['scheduled', 'confirmed']).gte('scheduled_end', now).order('scheduled_start', { ascending: true }).limit(50),
      client.from('laurem_staff_timesheets').select('id,assignment_id').eq('staff_id', session.staff_id).is('clock_out', null).limit(50),
      client.from('laurem_staff_timesheets').select('id,status').eq('staff_id', session.staff_id).in('status', ['submitted', 'rejected']).limit(100),
      client.from('laurem_staff_leave_requests').select('id,status').eq('staff_id', session.staff_id).eq('status', 'pending').limit(50),
      client.from('laurem_payroll_periods').select('id,period_start,period_end,status,pay_date').order('period_end', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (staffError || assignmentError || attendanceError || timesheetError || leaveError || periodError || !staff) {
      return NextResponse.json({ error: 'Unable to load workforce readiness.' }, { status: 500 });
    }

    const openAttendanceIds = [...new Set((attendance || []).map((row: any) => row.assignment_id).filter(Boolean))];
    let overdueAttendance = 0;
    if (openAttendanceIds.length) {
      const { data: openAttendanceAssignments, error: openAttendanceAssignmentError } = await client.from('laurem_staff_assignments')
        .select('id,scheduled_end')
        .eq('staff_id', session.staff_id)
        .in('id', openAttendanceIds);
      if (openAttendanceAssignmentError) return NextResponse.json({ error: 'Unable to validate open attendance.' }, { status: 500 });
      overdueAttendance = (openAttendanceAssignments || []).filter((row: any) => new Date(row.scheduled_end).getTime() < Date.now()).length;
    }

    let payrollEntryMissingRate = 0;
    let payrollEntryDraft = 0;
    let payroll = null;
    if (latestPeriod) {
      const { data: entry, error: entryError } = await client.from('laurem_payroll_entries')
        .select('id,status,hourly_rate,gross_amount,approved_hours')
        .eq('payroll_period_id', latestPeriod.id)
        .eq('staff_id', session.staff_id)
        .maybeSingle();
      if (entryError) return NextResponse.json({ error: 'Unable to load payroll readiness.' }, { status: 500 });

      if (!entry && latestPeriod.status !== 'closed') {
        payrollEntryDraft = 1;
      } else if (entry) {
        if (entry.hourly_rate === null || entry.gross_amount === null) payrollEntryMissingRate = 1;
        if (entry.status === 'draft') payrollEntryDraft = 1;
      }

      payroll = { period: latestPeriod, entry: entry || null };
    }

    const readiness = buildWorkforceReadiness({
      active: staff.employment_status === 'active',
      scheduledAssignments: assignments?.length || 0,
      openAttendance: attendance?.length || 0,
      overdueAttendance,
      submittedTimesheets: countByStatus(timesheets || [], 'submitted'),
      rejectedTimesheets: countByStatus(timesheets || [], 'rejected'),
      pendingLeave: leave?.length || 0,
      payrollEntryMissingRate,
      payrollEntryDraft,
    });

    return NextResponse.json({
      readiness,
      payroll,
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'Unable to load workforce readiness.' }, { status: 500 });
  }
}
