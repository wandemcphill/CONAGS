import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { getStaffConversationSummaries } from '@/lib/laurem-messaging';
import { buildStaffOperationalSnapshot } from '@/lib/laurem-workforce-integrity';
import { buildWorkforceReadiness } from '@/lib/laurem-workforce-readiness';
import { buildUkSwitchPaymentPlan, isInternationalNurseRole, isUkSwitchSplitRole } from '@/lib/laurem-visa-payment-plan';

function countByStatus(rows: Array<{ status: string | null }>, status: string) {
  return rows.filter((row) => row.status === status).length;
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const client = db();
    const now = new Date();
    const londonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);

    const [
      staffResult,
      assignmentsResult,
      timesheetsResult,
      leaveResult,
      onboardingPackageResult,
      notificationsResult,
      documentsResult,
      availabilityResult,
      payrollResult,
      visaCaseResult,
      visaInvoiceResult,
    ] = await Promise.all([
      client.from('laurem_staff_profiles')
        .select('id,application_id,laurem_id,employee_number,full_name,email,phone,job_title,employment_status,start_date,location,portal_handle,portal_address,address_line_1,city,postcode,country,profile_photo_path,profile_photo_updated_at,nmc_number,right_to_work_verified,dbs_verified')
        .eq('id', session.staff_id)
        .maybeSingle(),
      client.from('laurem_staff_assignments')
        .select('id,staff_id,client_name,location,scheduled_start,scheduled_end,status,notes')
        .eq('staff_id', session.staff_id)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_end', now.toISOString())
        .order('scheduled_start', { ascending: true })
        .limit(20),
      client.from('laurem_staff_timesheets')
        .select('id,assignment_id,work_date,clock_in,clock_out,total_hours,status,notes')
        .eq('staff_id', session.staff_id)
        .order('work_date', { ascending: false })
        .limit(100),
      client.from('laurem_staff_leave_requests')
        .select('id,leave_type,start_date,end_date,total_days,reason,status,review_note,created_at')
        .eq('staff_id', session.staff_id)
        .order('start_date', { ascending: false })
        .limit(50),
      client.from('laurem_staff_onboarding_packages')
        .select('id,title,status,updated_at')
        .eq('staff_id', session.staff_id)
        .maybeSingle(),
      client.from('laurem_staff_notifications')
        .select('id,title,body,read_at,action_url,created_at')
        .eq('staff_id', session.staff_id)
        .order('created_at', { ascending: false })
        .limit(8),
      client.from('laurem_staff_documents')
        .select('id,title,signature_status,category,issued_at')
        .eq('staff_id', session.staff_id)
        .eq('status', 'issued')
        .order('issued_at', { ascending: false })
        .limit(20),
      client.from('laurem_staff_availability')
        .select('id,effective_from,full_time,part_time,days,nights,weekends,notes')
        .eq('staff_id', session.staff_id)
        .lte('effective_from', londonToday)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.from('laurem_payroll_entries')
        .select('id,payroll_period_id,approved_hours,hourly_rate,gross_amount,status,notes,created_at,updated_at,laurem_payroll_periods(period_start,period_end,pay_date,status)')
        .eq('staff_id', session.staff_id)
        .order('created_at', { ascending: false })
        .limit(12),
      client.from('laurem_staff_visa_cases')
        .select('id,pathway,status,requested_at,updated_at,job_title_at_request')
        .eq('staff_id', session.staff_id)
        .not('status', 'in', '(declined,withdrawn)')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.from('laurem_staff_visa_invoices')
        .select('id,visa_case_id,invoice_number,status,amount_pence,issue_date')
        .eq('staff_id', session.staff_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const failed = [
      staffResult,
      assignmentsResult,
      timesheetsResult,
      leaveResult,
      onboardingPackageResult,
      notificationsResult,
      documentsResult,
      availabilityResult,
      payrollResult,
      visaCaseResult,
      visaInvoiceResult,
    ].find((result) => result.error);

    if (failed?.error || !staffResult.data) {
      return NextResponse.json({ error: 'Unable to load the staff workforce hub.' }, { status: 500 });
    }

    const staff = staffResult.data;
    const { data: visaApplication, error: visaApplicationError } = staff.application_id
      ? await client.from('recruitment_applications').select('role_applied,living_in_uk,current_country,country_of_residence').eq('id', staff.application_id).maybeSingle()
      : { data: null, error: null };
    if (visaApplicationError) return NextResponse.json({ error: 'Unable to load staff immigration record.' }, { status: 500 });
    const assignments = assignmentsResult.data || [];
    const timesheets = timesheetsResult.data || [];
    const leave = leaveResult.data || [];
    const payrollEntries = payrollResult.data || [];

    let onboarding: { package: Record<string, unknown>; tasks: unknown[] } | null = null;
    if (onboardingPackageResult.data) {
      const { data: tasks, error: taskError } = await client
        .from('laurem_staff_onboarding_tasks')
        .select('id,title,required,status,acknowledgement_required,acknowledged_at')
        .eq('package_id', onboardingPackageResult.data.id)
        .order('sort_order', { ascending: true });
      if (taskError) return NextResponse.json({ error: 'Unable to load onboarding tasks.' }, { status: 500 });
      onboarding = { package: onboardingPackageResult.data, tasks: tasks || [] };
    }

    const openAttendance = timesheets.filter((row: any) => row.clock_in && !row.clock_out);
    let overdueAttendance = 0;
    if (openAttendance.length) {
      const openAssignmentIds = [...new Set(openAttendance.map((row: any) => row.assignment_id).filter(Boolean))];
      if (openAssignmentIds.length) {
        const { data: openAssignments, error: openAssignmentError } = await client
          .from('laurem_staff_assignments')
          .select('id,scheduled_end')
          .eq('staff_id', session.staff_id)
          .in('id', openAssignmentIds);
        if (openAssignmentError) return NextResponse.json({ error: 'Unable to validate attendance state.' }, { status: 500 });
        overdueAttendance = (openAssignments || []).filter((row: any) => new Date(row.scheduled_end).getTime() < now.getTime()).length;
      }
    }

    const latestPayrollEntry = payrollEntries[0] || null;
    const payrollMissingRate = latestPayrollEntry && (latestPayrollEntry.hourly_rate == null || latestPayrollEntry.gross_amount == null) ? 1 : 0;
    const payrollDraft = latestPayrollEntry?.status === 'draft' ? 1 : 0;

    const readiness = buildWorkforceReadiness({
      active: staff.employment_status === 'active',
      scheduledAssignments: assignments.length,
      openAttendance: openAttendance.length,
      overdueAttendance,
      submittedTimesheets: countByStatus(timesheets, 'submitted'),
      rejectedTimesheets: countByStatus(timesheets, 'rejected'),
      pendingLeave: countByStatus(leave, 'pending'),
      payrollEntryMissingRate: payrollMissingRate,
      payrollEntryDraft: payrollDraft,
    });

    const operationalState = buildStaffOperationalSnapshot({
      employmentStatus: staff.employment_status,
      assignments: assignmentsResult.data || [],
      timesheets,
      leaveRequests: leave,
      payrollEntries: payrollEntries.map((entry: any) => ({
        id: entry.id,
        status: entry.status,
      })),
      now,
    });

    const messages = await getStaffConversationSummaries(client, session.staff_id, 6);

    const unreadNotifications = (notificationsResult.data || []).filter((notification: any) => !notification.read_at).length;
    const signaturePending = (documentsResult.data || []).filter((document: any) => document.signature_status === 'pending').length;
    const requiredTasks = ((onboarding?.tasks || []) as any[]).filter((task) => task.required);
    const completedRequired = requiredTasks.filter((task) => ['completed', 'waived'].includes(task.status) && (!task.acknowledgement_required || Boolean(task.acknowledged_at))).length;
    const onboardingProgress = requiredTasks.length ? Math.round((completedRequired / requiredTasks.length) * 100) : onboarding ? 100 : 0;

    const profileFields = [staff.phone, staff.address_line_1, staff.city, staff.postcode, staff.country, staff.profile_photo_path];
    const profileCompleteness = Math.round(profileFields.filter(Boolean).length / profileFields.length * 100);

    const visaCase = visaCaseResult.data || null;
    const visaInvoice = visaInvoiceResult.data || null;
    const visaDocuments = (documentsResult.data || []).filter((document: any) => document.category === 'visa_sponsorship');
    const isUk = String(visaApplication?.living_in_uk || '').trim().toLowerCase() === 'yes'
      || String(visaApplication?.living_in_uk || '').trim().toLowerCase() === 'true'
      || String(visaApplication?.living_in_uk || '').trim().toLowerCase() === 'currently in the uk'
      || /(united kingdom|^uk$|england|scotland|wales|northern ireland)/i.test(String(visaApplication?.current_country || visaApplication?.country_of_residence || ''));
    const roleForVisa = visaCase?.job_title_at_request || staff.job_title || visaApplication?.role_applied || null;
    const visaPathway = isInternationalNurseRole(roleForVisa) ? 'international_sponsorship'
      : isUk && isUkSwitchSplitRole(roleForVisa) ? 'visa_switch'
      : null;
    const cosStatus = !visaCase
      ? { key: 'not_requested', label: 'COS not requested', canDownload: false, documentId: null }
      : ['preparing_sms', 'submitted_to_sms', 'cos_pending'].includes(String(visaCase.status))
        ? { key: 'processing', label: 'Processing COS', canDownload: false, documentId: null }
        : ['cos_assigned', 'completed'].includes(String(visaCase.status)) && visaDocuments.length > 0
          ? { key: 'active', label: 'Active', canDownload: true, documentId: visaDocuments[0].id }
          : { key: 'invoice_requested', label: 'Invoice requested', canDownload: false, documentId: null };

    const currentPayroll = latestPayrollEntry
      ? {
          id: latestPayrollEntry.id,
          status: latestPayrollEntry.status,
          approvedHours: latestPayrollEntry.approved_hours,
          hourlyRate: latestPayrollEntry.hourly_rate,
          grossAmount: latestPayrollEntry.gross_amount,
          period: latestPayrollEntry.laurem_payroll_periods || null,
        }
      : null;

    return NextResponse.json({
      staff: {
        ...staff,
        profile_photo_url: staff.profile_photo_path
          ? `/api/staff/me/photo?v=${encodeURIComponent(String(staff.profile_photo_updated_at || 'current'))}`
          : null,
      },
      shifts: assignments,
      timesheets,
      leave,
      messages,
      onboarding,
      notifications: notificationsResult.data || [],
      documents: documentsResult.data || [],
      availability: availabilityResult.data || null,
      payroll: {
        entries: payrollEntries,
        current: currentPayroll,
      },
      readiness,
      operationalState,
      visaSupport: {
        available: Boolean(visaPathway),
        pathway: visaPathway,
        label: visaCase ? 'View Visa & COS' : visaPathway === 'visa_switch' ? 'Apply for Visa Switch' : visaPathway === 'international_sponsorship' ? 'Apply for Visa Sponsorship' : null,
        explanation: visaPathway === 'visa_switch'
          ? 'Request UK visa-switch support. The upfront payment is £500; the remaining £1,500 is recovered weekly from salary during the first three months after successful visa approval and commencement of employment.'
          : visaPathway === 'international_sponsorship'
            ? 'Generate the £2,000 CONAGS international sponsorship support invoice and open your case.'
            : 'Visa support requests are currently available for Healthcare Assistants and Registered Nurses.',
        cosStatus,
        paymentPlan: visaInvoice?.amount_pence === 50000 ? buildUkSwitchPaymentPlan() : null,
        caseId: visaCase?.id || null,
        invoice: visaInvoice ? { invoiceNumber: visaInvoice.invoice_number, status: visaInvoice.status, amountPence: visaInvoice.amount_pence, issueDate: visaInvoice.issue_date } : null,
      },
      summary: {
        upcomingShifts: assignments.length,
        submittedTimesheets: countByStatus(timesheets, 'submitted'),
        rejectedTimesheets: countByStatus(timesheets, 'rejected'),
        approvedHours: timesheets.filter((row: any) => ['approved', 'paid'].includes(row.status)).reduce((sum: number, row: any) => sum + (Number(row.total_hours) || 0), 0),
        pendingLeave: countByStatus(leave, 'pending'),
        unreadMessages: messages.filter((message) => message.unread).length,
        unreadNotifications,
        signaturePending,
        profileCompleteness,
        onboardingProgress,
      },
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'staff.workforce_dashboard.load_failed',
      staffId: session.staff_id,
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Unable to load the staff workforce hub.' }, { status: 500 });
  }
}
