import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { buildWorkforceReadiness } from '@/lib/laurem-workforce-readiness';

type Row = Record<string, any>;

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const now = new Date();
    const nowIso = now.toISOString();

    const { data: staff, error: staffError } = await client.from('staff_profiles')
      .select('id,employee_number,full_name,email,job_title,employment_status,location')
      .order('full_name', { ascending: true })
      .limit(1000);
    if (staffError) throw staffError;

    const activeStaff = (staff || []).filter((row: Row) => row.employment_status === 'active');
    const activeIds = activeStaff.map((row: Row) => row.id);
    if (!activeIds.length) {
      return NextResponse.json({
        summary: { totalStaff: (staff || []).length, activeStaff: 0, ready: 0, attention: 0, blocked: 0, generatedAt: nowIso },
        staff: [],
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    const [assignmentResult, attendanceResult, timesheetResult, leaveResult, periodResult] = await Promise.all([
      client.from('staff_assignments')
        .select('id,staff_id,scheduled_end,status')
        .in('staff_id', activeIds)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_end', nowIso)
        .limit(5000),
      client.from('staff_timesheets')
        .select('id,staff_id,assignment_id,clock_out')
        .in('staff_id', activeIds)
        .is('clock_out', null)
        .limit(5000),
      client.from('staff_timesheets')
        .select('id,staff_id,status')
        .in('staff_id', activeIds)
        .in('status', ['submitted', 'rejected'])
        .limit(5000),
      client.from('staff_leave_requests')
        .select('id,staff_id,status')
        .in('staff_id', activeIds)
        .eq('status', 'pending')
        .limit(5000),
      client.from('payroll_periods')
        .select('id,period_start,period_end,pay_date,status')
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (attendanceResult.error) throw attendanceResult.error;
    if (timesheetResult.error) throw timesheetResult.error;
    if (leaveResult.error) throw leaveResult.error;
    if (periodResult.error) throw periodResult.error;

    const openAttendance = (attendanceResult.data || []) as Row[];
    const openAttendanceAssignmentIds = [...new Set(openAttendance.map((row) => row.assignment_id).filter(Boolean))];
    let overdueByStaff = new Map<string, number>();
    if (openAttendanceAssignmentIds.length) {
      const { data: openAssignments, error } = await client.from('staff_assignments')
        .select('id,staff_id,scheduled_end')
        .in('id', openAttendanceAssignmentIds);
      if (error) throw error;
      for (const row of openAssignments || []) {
        if (new Date(row.scheduled_end).getTime() < now.getTime()) {
          overdueByStaff.set(row.staff_id, (overdueByStaff.get(row.staff_id) || 0) + 1);
        }
      }
    }

    let payrollEntries: Row[] = [];
    if (periodResult.data) {
      const { data, error } = await client.from('payroll_entries')
        .select('id,staff_id,status,hourly_rate,gross_amount')
        .eq('payroll_period_id', periodResult.data.id)
        .in('staff_id', activeIds)
        .limit(5000);
      if (error) throw error;
      payrollEntries = data || [];
    }

    const assignmentsByStaff = new Map<string, number>();
    for (const row of assignmentResult.data || []) assignmentsByStaff.set(row.staff_id, (assignmentsByStaff.get(row.staff_id) || 0) + 1);

    const attendanceByStaff = new Map<string, number>();
    for (const row of openAttendance) attendanceByStaff.set(row.staff_id, (attendanceByStaff.get(row.staff_id) || 0) + 1);

    const submittedByStaff = new Map<string, number>();
    const rejectedByStaff = new Map<string, number>();
    for (const row of timesheetResult.data || []) {
      if (row.status === 'submitted') submittedByStaff.set(row.staff_id, (submittedByStaff.get(row.staff_id) || 0) + 1);
      if (row.status === 'rejected') rejectedByStaff.set(row.staff_id, (rejectedByStaff.get(row.staff_id) || 0) + 1);
    }

    const leaveByStaff = new Map<string, number>();
    for (const row of leaveResult.data || []) leaveByStaff.set(row.staff_id, (leaveByStaff.get(row.staff_id) || 0) + 1);

    const payrollByStaff = new Map<string, { missingRate: number; draft: number }>();
    for (const row of payrollEntries) {
      const current = payrollByStaff.get(row.staff_id) || { missingRate: 0, draft: 0 };
      if (row.hourly_rate === null || row.gross_amount === null) current.missingRate += 1;
      if (row.status === 'draft') current.draft += 1;
      payrollByStaff.set(row.staff_id, current);
    }
    if (periodResult.data && periodResult.data.status !== 'closed') {
      for (const staffId of activeIds) {
        if (!payrollEntries.some((entry) => entry.staff_id === staffId)) {
          const current = payrollByStaff.get(staffId) || { missingRate: 0, draft: 0 };
          current.draft += 1;
          payrollByStaff.set(staffId, current);
        }
      }
    }

    const rows = activeStaff.map((profile: Row) => {
      const payroll = payrollByStaff.get(profile.id) || { missingRate: 0, draft: 0 };
      const readiness = buildWorkforceReadiness({
        active: true,
        scheduledAssignments: assignmentsByStaff.get(profile.id) || 0,
        openAttendance: attendanceByStaff.get(profile.id) || 0,
        overdueAttendance: overdueByStaff.get(profile.id) || 0,
        submittedTimesheets: submittedByStaff.get(profile.id) || 0,
        rejectedTimesheets: rejectedByStaff.get(profile.id) || 0,
        pendingLeave: leaveByStaff.get(profile.id) || 0,
        payrollEntryMissingRate: payroll.missingRate,
        payrollEntryDraft: payroll.draft,
      });
      return { ...profile, readiness };
    });

    const ready = rows.filter((row) => row.readiness.overall === 'ready').length;
    const attention = rows.filter((row) => row.readiness.overall === 'attention').length;
    const blocked = rows.filter((row) => row.readiness.overall === 'blocked').length;

    return NextResponse.json({
      summary: {
        totalStaff: (staff || []).length,
        activeStaff: activeStaff.length,
        ready,
        attention,
        blocked,
        latestPayrollPeriod: periodResult.data || null,
        generatedAt: nowIso,
      },
      staff: rows,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.workforce.readiness_failed', reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to load workforce operational readiness.' }, { status: 500 });
  }
}
