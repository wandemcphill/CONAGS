import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function hours(start: string, end: string) {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const today = new Date();
  const defaultEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(today);
  const defaultStartDate = new Date(today);
  defaultStartDate.setDate(defaultStartDate.getDate() - 29);
  const defaultStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(defaultStartDate);
  const start = validDate(params.get('start')) ? params.get('start')! : defaultStart;
  const end = validDate(params.get('end')) ? params.get('end')! : defaultEnd;
  if (end < start) return NextResponse.json({ error: 'Report end date must be on or after the start date.' }, { status: 400 });

  const endExclusive = new Date(end + 'T00:00:00Z');
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const endExclusiveIso = endExclusive.toISOString();

  const client = db();
  const [staffResult, assignmentsResult, timesheetsResult, leaveResult, periodsResult, entriesResult] = await Promise.all([
    client.from('staff_profiles').select('id,employee_number,full_name,email,job_title,employment_status,start_date,end_date,location').order('full_name', { ascending: true }).limit(1000),
    client.from('staff_assignments').select('id,staff_id,scheduled_start,scheduled_end,status,location').lt('scheduled_start', endExclusiveIso).gte('scheduled_end', start + 'T00:00:00Z').limit(5000),
    client.from('staff_timesheets').select('id,staff_id,work_date,total_hours,status').gte('work_date', start).lte('work_date', end).limit(5000),
    client.from('staff_leave_requests').select('id,staff_id,start_date,end_date,total_days,status').lte('start_date', end).gte('end_date', start).limit(3000),
    client.from('payroll_periods').select('id,period_start,period_end,pay_date,status').lte('period_start', end).gte('period_end', start).limit(100),
    client.from('payroll_entries').select('id,payroll_period_id,staff_id,approved_hours,gross_amount,status').limit(5000),
  ]);

  const failed = [staffResult, assignmentsResult, timesheetsResult, leaveResult, periodsResult, entriesResult].find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: 'Unable to build workforce report.' }, { status: 500 });

  const staff = staffResult.data || [];
  const assignments = assignmentsResult.data || [];
  const timesheets = timesheetsResult.data || [];
  const leave = leaveResult.data || [];
  const periods = periodsResult.data || [];
  const periodIds = new Set(periods.map((period: any) => period.id));
  const entries = (entriesResult.data || []).filter((entry: any) => periodIds.has(entry.payroll_period_id));

  const rows = staff.map((person: any) => {
    const personAssignments = assignments.filter((item: any) => item.staff_id === person.id);
    const personTimesheets = timesheets.filter((item: any) => item.staff_id === person.id);
    const personLeave = leave.filter((item: any) => item.staff_id === person.id);
    const personPayroll = entries.filter((item: any) => item.staff_id === person.id);
    const scheduledHours = personAssignments.reduce((sum: number, item: any) => sum + hours(item.scheduled_start, item.scheduled_end), 0);
    const approvedHours = personTimesheets.filter((item: any) => ['approved', 'paid'].includes(item.status)).reduce((sum: number, item: any) => sum + (Number(item.total_hours) || 0), 0);
    const grossPayroll = personPayroll.reduce((sum: number, item: any) => sum + (Number(item.gross_amount) || 0), 0);
    return {
      staffId: person.id,
      employeeNumber: person.employee_number,
      fullName: person.full_name,
      jobTitle: person.job_title,
      employmentStatus: person.employment_status,
      location: person.location,
      shifts: personAssignments.length,
      scheduledHours: Number(scheduledHours.toFixed(2)),
      completedShifts: personAssignments.filter((item: any) => item.status === 'completed').length,
      cancelledShifts: personAssignments.filter((item: any) => item.status === 'cancelled').length,
      noShowShifts: personAssignments.filter((item: any) => item.status === 'no_show').length,
      submittedTimesheets: personTimesheets.filter((item: any) => item.status === 'submitted').length,
      approvedHours: Number(approvedHours.toFixed(2)),
      rejectedTimesheets: personTimesheets.filter((item: any) => item.status === 'rejected').length,
      approvedLeaveDays: personLeave.filter((item: any) => item.status === 'approved').reduce((sum: number, item: any) => sum + (Number(item.total_days) || 0), 0),
      pendingLeaveRequests: personLeave.filter((item: any) => item.status === 'pending').length,
      grossPayroll: Number(grossPayroll.toFixed(2)),
    };
  });

  const totals = rows.reduce((acc, row) => ({
    scheduledShifts: acc.scheduledShifts + row.shifts,
    scheduledHours: acc.scheduledHours + row.scheduledHours,
    completedShifts: acc.completedShifts + row.completedShifts,
    cancelledShifts: acc.cancelledShifts + row.cancelledShifts,
    noShowShifts: acc.noShowShifts + row.noShowShifts,
    approvedHours: acc.approvedHours + row.approvedHours,
    submittedTimesheets: acc.submittedTimesheets + row.submittedTimesheets,
    rejectedTimesheets: acc.rejectedTimesheets + row.rejectedTimesheets,
    approvedLeaveDays: acc.approvedLeaveDays + row.approvedLeaveDays,
    pendingLeaveRequests: acc.pendingLeaveRequests + row.pendingLeaveRequests,
    grossPayroll: acc.grossPayroll + row.grossPayroll,
  }), { scheduledShifts:0, scheduledHours:0, completedShifts:0, cancelledShifts:0, noShowShifts:0, approvedHours:0, submittedTimesheets:0, rejectedTimesheets:0, approvedLeaveDays:0, pendingLeaveRequests:0, grossPayroll:0 });

  return NextResponse.json({
    range: { start, end },
    generatedAt: new Date().toISOString(),
    summary: {
      staffCount: staff.length,
      activeStaff: staff.filter((item: any) => item.employment_status === 'active').length,
      pendingTimesheets: timesheets.filter((item: any) => item.status === 'submitted').length,
      approvedLeaveRequests: leave.filter((item: any) => item.status === 'approved').length,
      payrollPeriods: periods.length,
      ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(Number(value).toFixed(2))])),
    },
    rows,
  });
}