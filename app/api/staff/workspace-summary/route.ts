import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { buildStaffOperationalSnapshot } from '@/lib/laurem-workforce-integrity';
import { buildWorkforceReadiness } from '@/lib/laurem-workforce-readiness';

function count(rows: Array<{ status?: string | null }>, status: string) {
  return rows.filter((row) => row.status === status).length;
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const now = new Date();
    const [staffResult, assignmentsResult, timesheetsResult, leaveResult, payrollResult, notificationsResult, documentsResult] =
      await Promise.all([
        client.from('laurem_staff_profiles').select('id,laurem_id,employee_number,full_name,email,phone,job_title,employment_status,start_date,location,portal_address,address_line_1,city,postcode,country,profile_photo_path,profile_photo_updated_at').eq('id', session.staff_id).maybeSingle(),
        client.from('laurem_staff_assignments').select('id,staff_id,client_name,location,scheduled_start,scheduled_end,status,notes').eq('staff_id', session.staff_id).in('status', ['scheduled', 'confirmed']).gte('scheduled_end', now.toISOString()).order('scheduled_start', { ascending: true }).limit(7),
        client.from('laurem_staff_timesheets').select('id,assignment_id,status,total_hours,work_date,clock_in,clock_out').eq('staff_id', session.staff_id).order('work_date', { ascending: false }).limit(30),
        client.from('laurem_staff_leave_requests').select('id,status,start_date,end_date,total_days').eq('staff_id', session.staff_id).order('start_date', { ascending: false }).limit(20),
        client.from('laurem_payroll_entries').select('id,status,approved_hours,hourly_rate,gross_amount').eq('staff_id', session.staff_id).order('created_at', { ascending: false }).limit(12),
        client.from('laurem_staff_notifications').select('id,title,body,read_at,action_url,created_at').eq('staff_id', session.staff_id).order('created_at', { ascending: false }).limit(6),
        client.from('laurem_staff_documents').select('id,title,signature_status,category,issued_at').eq('staff_id', session.staff_id).eq('status', 'issued').order('issued_at', { ascending: false }).limit(10),
      ]);
    const failed = [staffResult, assignmentsResult, timesheetsResult, leaveResult, payrollResult, notificationsResult, documentsResult].find((result) => result.error);
    if (failed?.error || !staffResult.data) return NextResponse.json({ error: 'Unable to load the staff workspace.' }, { status: 500 });

    const staff = staffResult.data;
    const assignments = assignmentsResult.data || [];
    const timesheets = timesheetsResult.data || [];
    const leave = leaveResult.data || [];
    const payroll = payrollResult.data || [];
    const operationalState = buildStaffOperationalSnapshot({ employmentStatus: staff.employment_status, assignments, timesheets, leaveRequests: leave, payrollEntries: payroll, now });
    const readiness = buildWorkforceReadiness({
      active: staff.employment_status === 'active',
      scheduledAssignments: assignments.length,
      openAttendance: timesheets.filter((row: any) => row.status === 'submitted' && row.total_hours == null).length,
      overdueAttendance: 0,
      submittedTimesheets: count(timesheets, 'submitted'),
      rejectedTimesheets: count(timesheets, 'rejected'),
      pendingLeave: count(leave, 'pending'),
      payrollEntryMissingRate: payroll.some((row: any) => row.hourly_rate == null) ? 1 : 0,
      payrollEntryDraft: payroll.some((row: any) => row.status === 'draft') ? 1 : 0,
    });
    const profileFields = [staff.phone, staff.address_line_1, staff.city, staff.postcode, staff.country, staff.profile_photo_path];
    const profileCompleteness = Math.round(profileFields.filter(Boolean).length / profileFields.length * 100);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      staff: { ...staff, profile_photo_url: staff.profile_photo_path ? '/api/staff/me/photo?v=' + encodeURIComponent(String(staff.profile_photo_updated_at || 'current')) : null },
      nextShift: assignments[0] || null,
      operationalState,
      readiness,
      notifications: notificationsResult.data || [],
      documents: documentsResult.data || [],
      summary: {
        upcomingShifts: assignments.length,
        submittedTimesheets: count(timesheets, 'submitted'),
        rejectedTimesheets: count(timesheets, 'rejected'),
        approvedHours: timesheets.filter((row: any) => ['approved', 'paid'].includes(row.status)).reduce((sum: number, row: any) => sum + (Number(row.total_hours) || 0), 0),
        pendingLeave: count(leave, 'pending'),
        unreadNotifications: (notificationsResult.data || []).filter((row: any) => !row.read_at).length,
        signaturePending: (documentsResult.data || []).filter((row: any) => row.signature_status === 'pending').length,
        profileCompleteness,
        openPayroll: payroll.filter((row: any) => !['paid', 'void'].includes(row.status)).length,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'staff.workspace_bootstrap.load_failed', staffId: session.staff_id, reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to load the staff workspace.' }, { status: 500 });
  }
}
