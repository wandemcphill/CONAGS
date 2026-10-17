import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { buildStaffComplianceSnapshot } from '@/lib/laurem-hr-workforce';
import { isLauremStaffEmploymentStatus } from '@/lib/laurem-lifecycle-policy';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const status = url.searchParams.get('status')?.trim();
  const role = url.searchParams.get('role')?.trim();
  const location = url.searchParams.get('location')?.trim();
  const managerId = url.searchParams.get('managerId')?.trim();
  const complianceState = url.searchParams.get('complianceState')?.trim();
  const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
  const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);

  const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
  const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 50 : limitParam));
  const offset = (page - 1) * limit;

  const client = db();

  // Query base profiles
  let query = client.from('staff_profiles')
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
      activated_at,
      created_at,
      updated_at
    `, { count: 'exact' });

  if (status && ['pending', 'active', 'suspended', 'leaver'].includes(status)) {
    query = query.eq('employment_status', status);
  }

  if (managerId) {
    query = query.eq('manager_id', managerId);
  }

  if (location) {
    query = query.ilike('location', `%${location}%`);
  }

  if (role) {
    query = query.ilike('job_title', `%${role}%`);
  }

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,employee_number.ilike.%${q}%,laurem_id.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const hasComplianceFilter = ['Current', 'Expiring Soon', 'Expired', 'Missing', 'Under Review'].includes(complianceState || '');
  query = query.order('full_name', { ascending: true });
  if (!hasComplianceFilter) query = query.range(offset, offset + limit - 1);

  const { data: rawStaff, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Unable to load staff records.' }, { status: 500 });
  }

  const staffList = rawStaff || [];

  // When filtering by computed compliance, the filter must run before pagination.
  const allEnrichedCandidateRows = staffList.map((item) => ({
    ...item,
    compliance: buildStaffComplianceSnapshot(item),
  }));

  const filteredCandidates = hasComplianceFilter
    ? allEnrichedCandidateRows.filter((s) => s.compliance.overallStatus === complianceState)
    : allEnrichedCandidateRows;

  const pageRows = hasComplianceFilter
    ? filteredCandidates.slice(offset, offset + limit)
    : filteredCandidates;

  // Fetch managers mapping to populate manager names
  const managerIds = Array.from(new Set(pageRows.map((s) => s.manager_id).filter(Boolean))) as string[];
  let managerMap: Record<string, { id: string; full_name: string; job_title: string }> = {};
  if (managerIds.length > 0) {
    const { data: managers } = await client.from('staff_profiles')
      .select('id, full_name, job_title')
      .in('id', managerIds);
    if (managers) {
      managerMap = Object.fromEntries(managers.map((m) => [m.id, m]));
    }
  }

  const enrichedStaff = pageRows.map((item) => ({
    ...item,
    manager: item.manager_id ? managerMap[item.manager_id] || null : null,
  }));

  const total = hasComplianceFilter ? filteredCandidates.length : (count ?? enrichedStaff.length);
  const totalPages = Math.ceil(total / limit) || 1;

  return NextResponse.json({
    staff: enrichedStaff,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Staff id is required.' }, { status: 400 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const nextStatus = typeof body?.employmentStatus === 'string' ? body.employmentStatus : '';
  const reason = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  const endDate = typeof body?.endDate === 'string' ? body.endDate : null;

  if (!isLauremStaffEmploymentStatus(nextStatus)) return NextResponse.json({ error: 'Invalid employment status.' }, { status: 400 });
  if (['suspended', 'leaver', 'active'].includes(nextStatus) && !reason) {
    return NextResponse.json({ error: 'A reason is required for this employment status change.' }, { status: 400 });
  }
  if (nextStatus === 'leaver' && (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
    return NextResponse.json({ error: 'A valid end date is required when marking staff as a leaver.' }, { status: 400 });
  }

  const client = db();
  const { data: current, error: currentError } = await client
    .from('staff_profiles')
    .select('id,application_id,employment_status,full_name')
    .eq('id', id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: 'Unable to load staff record.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

  const { data, error } = await client.rpc('laurem_change_staff_employment_status', {
    p_staff_id: id,
    p_next_status: nextStatus,
    p_actor: session.email,
    p_reason: reason,
    p_end_date: endDate,
  });
  if (error || !data) {
    const message = error?.message || 'Unable to update staff status.';
    const status = /ACTIVATION_REQUIRED|TRANSITION_NOT_ALLOWED|ALREADY_IN_STATUS|END_DATE_REQUIRED/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const statusLabel = nextStatus.replaceAll('_', ' ');
  await createLauremStaffNotification(client, {
    staffId: id,
    category: 'employment',
    title: `Employment status updated: ${statusLabel}`,
    body: `Your CONAGS employment status has changed from ${current.employment_status.replaceAll('_', ' ')} to ${statusLabel}.`,
    actionUrl: '/staff/profile',
  });

  return NextResponse.json({ staff: data });
}
