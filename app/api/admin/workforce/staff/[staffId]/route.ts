import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { buildStaffOperationalSnapshot } from '@/lib/laurem-workforce-integrity';
import { buildStaffComplianceSnapshot } from '@/lib/laurem-hr-workforce';

export async function GET(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { staffId } = await params;
  if (!staffId) return NextResponse.json({ error: 'Staff id is required.' }, { status: 400 });

  const client = db();
  const { data: staff, error: staffError } = await client.from('staff_profiles')
    .select(`
      id,
      application_id,
      employee_number,
      laurem_id,
      full_name,
      email,
      phone,
      job_title,
      employment_status,
      start_date,
      end_date,
      location,
      manager_id,
      nmc_number,
      nmc_status,
      nmc_expiry_date,
      right_to_work_pathway,
      right_to_work_verified,
      right_to_work_expiry_date,
      right_to_work_notes,
      dbs_verified,
      dbs_pvg_status,
      dbs_pvg_check_date,
      dbs_pvg_expiry_date,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relationship,
      contract_id,
      address_line_1,
      address_line_2,
      city,
      county,
      postcode,
      country,
      profile_photo_path,
      profile_photo_updated_at,
      activated_at,
      activation_expires_at,
      activation_used_at,
      created_at,
      updated_at
    `)
    .eq('id', staffId).maybeSingle();

  if (staffError) return NextResponse.json({ error: 'Unable to load staff record.' }, { status: 500 });
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

  // Fetch manager details if manager_id is present
  let manager: { id: string; full_name: string; job_title: string; email: string } | null = null;
  if (staff.manager_id) {
    const { data: mgrData } = await client.from('staff_profiles')
      .select('id, full_name, job_title, email')
      .eq('id', staff.manager_id)
      .maybeSingle();
    if (mgrData) manager = mgrData;
  }

  // Resolve employment pathway only from authoritative recruitment/visa records.
  let employmentPathway = 'Not recorded';
  if (staff.application_id) {
    const [{ data: appData, error: appError }, { data: visaCase, error: visaError }] = await Promise.all([
      client.from('recruitment_applications')
        .select('application_data, requires_sponsorship, role_applied')
        .eq('id', staff.application_id)
        .maybeSingle(),
      client.from('staff_visa_cases')
        .select('pathway,status,requested_at')
        .eq('staff_id', staff.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (appError || visaError) return NextResponse.json({ error: 'Unable to resolve the authoritative employment pathway.' }, { status: 500 });

    const recordedPathway = typeof appData?.application_data?.pathway === 'string' ? appData.application_data.pathway.trim().toLowerCase() : '';
    const requiresSponsorship = typeof appData?.requires_sponsorship === 'string' && ['yes','true','required'].includes(appData.requires_sponsorship.trim().toLowerCase());
    const visaPathway = typeof visaCase?.pathway === 'string' ? visaCase.pathway.trim().toLowerCase() : '';

    if (visaPathway === 'international_sponsorship') employmentPathway = 'International Sponsorship';
    else if (visaPathway === 'visa_switch') employmentPathway = 'Visa Switch';
    else if (recordedPathway === 'international' && /\bnurse\b|\brn\b|\brgn\b/i.test(appData?.role_applied || staff.job_title)) employmentPathway = 'International Nurse';
    else if (requiresSponsorship) employmentPathway = 'Sponsorship';
    else if (recordedPathway === 'uk') employmentPathway = 'UK Standard';
    else if (recordedPathway === 'international') employmentPathway = 'International';
  }

  const [assignmentsResult, timesheetsResult, leaveResult, packageResult, auditResult, payrollResult, availabilityResult, documentsResult] = await Promise.all([
    client.from('staff_assignments').select('id,staff_id,client_name,location,scheduled_start,scheduled_end,status,notes,created_at,updated_at').eq('staff_id', staffId).order('scheduled_start', { ascending: false }).limit(100),
    client.from('staff_timesheets').select('id,staff_id,assignment_id,work_date,clock_in,clock_out,break_minutes,total_hours,status,notes,approved_by,approved_at,created_at,updated_at').eq('staff_id', staffId).order('work_date', { ascending: false }).limit(100),
    client.from('staff_leave_requests').select('id,staff_id,leave_type,start_date,end_date,total_days,reason,status,reviewed_by,reviewed_at,review_note,created_at,updated_at').eq('staff_id', staffId).order('start_date', { ascending: false }).limit(100),
    client.from('staff_onboarding_packages').select('*').eq('staff_id', staffId).maybeSingle(),
    client.from('laurem_audit_events').select('id,lifecycle_area,entity_type,entity_id,application_id,staff_id,actor_type,actor,action,previous_state,new_state,reason,metadata,occurred_at').eq('staff_id', staffId).order('occurred_at', { ascending: false }).limit(100),
    client.from('payroll_entries').select('id,payroll_period_id,staff_id,approved_hours,hourly_rate,gross_amount,status,notes,created_at,updated_at').eq('staff_id', staffId).order('created_at', { ascending: false }).limit(100),
    client.from('staff_availability').select('id,staff_id,effective_from,full_time,part_time,days,nights,weekends,notes,created_at').eq('staff_id', staffId).lte('effective_from', new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())).order('effective_from', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('staff_documents').select('id,title,category,source_type,source_key,signature_status,requires_signature,issued_at,status,signed_at,superseded_at,superseded_by').eq('staff_id', staffId).order('issued_at', { ascending: false }).limit(100),
  ]);

  const failed = [assignmentsResult, timesheetsResult, leaveResult, packageResult, auditResult, payrollResult, availabilityResult, documentsResult].find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: 'Unable to load the complete staff workspace.' }, { status: 500 });

  let onboarding = null as { package: unknown; tasks: unknown[] } | null;
  if (packageResult.data) {
    const { data: tasks, error: taskError } = await client.from('staff_onboarding_tasks').select('*').eq('package_id', packageResult.data.id).order('sort_order', { ascending: true });
    if (taskError) return NextResponse.json({ error: 'Unable to load onboarding tasks.' }, { status: 500 });
    onboarding = { package: packageResult.data, tasks: tasks || [] };
  }

  const profilePhotoUrl = staff.profile_photo_path
    ? `/api/admin/workforce/staff/${encodeURIComponent(staffId)}/photo?v=${encodeURIComponent(String(staff.profile_photo_updated_at || 'current'))}`
    : null;

  const operationalState = buildStaffOperationalSnapshot({
    employmentStatus: staff.employment_status,
    assignments: assignmentsResult.data || [],
    timesheets: timesheetsResult.data || [],
    leaveRequests: leaveResult.data || [],
    payrollEntries: payrollResult.data || [],
  });

  const allDocuments = documentsResult.data || [];
  const activeDocuments = allDocuments.filter((doc: any) => doc.status === 'issued');

  const tasksList = onboarding?.tasks || [];
  const requiredTotal = tasksList.filter((t: any) => t.required).length;
  const requiredDone = tasksList.filter((t: any) => t.required && ['completed', 'waived'].includes(t.status)).length;
  const onboardingComplete = requiredTotal > 0 ? requiredDone === requiredTotal : true;

  const compliance = buildStaffComplianceSnapshot(staff, {
    documentsComplete: activeDocuments.every((doc: any) => !doc.requires_signature || doc.signature_status === 'signed'),
    onboardingComplete,
  });

  return NextResponse.json({
    staff: { ...staff, profile_photo_url: profilePhotoUrl, manager, employment_pathway: employmentPathway },
    application: staff.application_id ? {
      id: staff.application_id,
      status: (await client.from('recruitment_applications').select('status').eq('id', staff.application_id).maybeSingle()).data?.status || null,
    } : null,
    compliance,
    assignments: assignmentsResult.data || [],
    timesheets: timesheetsResult.data || [],
    leaveRequests: leaveResult.data || [],
    payrollEntries: payrollResult.data || [],
    onboarding,
    documents: allDocuments,
    audit: (auditResult.data || []).map((event: any) => ({
      id: event.id,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      event_type: event.action,
      actor: event.actor,
      details: {
        lifecycleArea: event.lifecycle_area,
        actorType: event.actor_type,
        previousState: event.previous_state,
        newState: event.new_state,
        reason: event.reason,
        metadata: event.metadata,
      },
      created_at: event.occurred_at,
    })),
    availability: availabilityResult.data || null,
    operationalState,
    documentsSummary: {
      total: activeDocuments.length,
      signaturePending: activeDocuments.filter((item: any) => item.requires_signature && item.signature_status === 'pending').length,
      latestIssuedAt: activeDocuments[0]?.issued_at || null,
    },
    actor: session.email,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staffId } = await params;
  if (!staffId) return NextResponse.json({ error: 'Staff id is required.' }, { status: 400 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const nextStatus = typeof body?.employmentStatus === 'string' ? body.employmentStatus : '';
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  const endDate = typeof body?.endDate === 'string' ? body.endDate : null;
  if (!['pending', 'active', 'suspended', 'leaver'].includes(nextStatus)) return NextResponse.json({ error: 'Invalid employment status.' }, { status: 400 });
  if (['active', 'suspended', 'leaver'].includes(nextStatus) && !note) return NextResponse.json({ error: 'A reason is required for this employment status change.' }, { status: 400 });
  if (nextStatus === 'leaver' && (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) return NextResponse.json({ error: 'A valid end date is required when marking staff as a leaver.' }, { status: 400 });

  const client = db();
  const { data: current, error: currentError } = await client.from('staff_profiles').select('id,employment_status,full_name').eq('id', staffId).maybeSingle();
  if (currentError) return NextResponse.json({ error: 'Unable to load staff record.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

  const { data, error } = await client.rpc('laurem_change_staff_employment_status', {
    p_staff_id: staffId,
    p_next_status: nextStatus,
    p_actor: session.email,
    p_reason: note,
    p_end_date: endDate,
  });
  if (error || !data) {
    const errorMessage = error?.message || '';
    if (errorMessage.includes('STAFF_ACTIVATION_REQUIRED')) {
      return NextResponse.json({
        error: 'Staff portal activation is required before the employment status can become active. Use Staff Account to issue or reissue the one-time activation link, then let the staff member complete activation.',
      }, { status: 409 });
    }
    return NextResponse.json({ error: errorMessage || 'Unable to update staff status.' }, { status: 409 });
  }

  return NextResponse.json({ staff: data });
}
