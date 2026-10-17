import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { buildStaffComplianceSnapshot } from '@/lib/laurem-hr-workforce';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();

  // Fetch all staff profiles
  const { data: staffList, error: staffError } = await client.from('staff_profiles')
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
      contract_id,
      activated_at
    `)
    .in('employment_status', ['active', 'pending'])
    .order('full_name', { ascending: true });

  if (staffError) return NextResponse.json({ error: 'Unable to load compliance data.' }, { status: 500 });

  const allStaff = staffList || [];

  // Fetch manager names
  const managerIds = Array.from(new Set(allStaff.map((s) => s.manager_id).filter(Boolean))) as string[];
  let managerMap: Record<string, { id: string; full_name: string; job_title: string }> = {};
  if (managerIds.length > 0) {
    const { data: managers } = await client.from('staff_profiles')
      .select('id, full_name, job_title')
      .in('id', managerIds);
    if (managers) {
      managerMap = Object.fromEntries(managers.map((m) => [m.id, m]));
    }
  }

  // Fetch unsigned documents count per staff
  const staffIds = allStaff.map((s) => s.id);
  let pendingSignatureStaffSet = new Set<string>();
  if (staffIds.length > 0) {
    const { data: pendingDocs } = await client.from('staff_documents')
      .select('staff_id')
      .in('staff_id', staffIds)
      .eq('status', 'issued')
      .eq('requires_signature', true)
      .eq('signature_status', 'pending');

    if (pendingDocs) {
      pendingSignatureStaffSet = new Set(pendingDocs.map((d) => d.staff_id));
    }
  }

  const staffCompliance = allStaff.map((s) => {
    const hasPendingDocSignature = pendingSignatureStaffSet.has(s.id);
    const compliance = buildStaffComplianceSnapshot(s, {
      documentsComplete: !hasPendingDocSignature,
    });
    const manager = s.manager_id ? managerMap[s.manager_id] || null : null;
    return {
      id: s.id,
      full_name: s.full_name,
      employee_number: s.employee_number,
      job_title: s.job_title,
      location: s.location,
      employment_status: s.employment_status,
      manager,
      compliance,
    };
  });

  const totalActiveStaff = allStaff.filter((s) => s.employment_status === 'active').length;
  const totalPendingStaff = allStaff.filter((s) => s.employment_status === 'pending').length;

  let currentCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  let missingCount = 0;
  let underReviewCount = 0;

  let nursesTotal = 0;
  let nursesFullyRegistered = 0;
  let nursesActionNeeded = 0;

  const expiringItems: Array<{
    staffId: string;
    fullName: string;
    employeeNumber: string;
    itemType: 'Right to Work' | 'DBS/PVG' | 'NMC Registration' | 'Unsigned Document';
    statusCategory: string;
    expiryDate: string | null;
    detail: string;
  }> = [];

  for (const item of staffCompliance) {
    const status = item.compliance.overallStatus;
    if (status === 'Current') currentCount++;
    else if (status === 'Expiring Soon') expiringSoonCount++;
    else if (status === 'Expired') expiredCount++;
    else if (status === 'Missing') missingCount++;
    else if (status === 'Under Review') underReviewCount++;

    if (item.compliance.nmcRegistration.isNurse) {
      nursesTotal++;
      if (item.compliance.nmcRegistration.registrationState === 'fully_registered' && item.compliance.nmcRegistration.statusCategory === 'Current') {
        nursesFullyRegistered++;
      } else {
        nursesActionNeeded++;
      }
    }

    if (item.compliance.rightToWork.statusCategory !== 'Current') {
      expiringItems.push({
        staffId: item.id,
        fullName: item.full_name,
        employeeNumber: item.employee_number,
        itemType: 'Right to Work',
        statusCategory: item.compliance.rightToWork.statusCategory,
        expiryDate: item.compliance.rightToWork.expiryDate,
        detail: item.compliance.rightToWork.detail,
      });
    }

    if (item.compliance.dbsPvg.statusCategory !== 'Current') {
      expiringItems.push({
        staffId: item.id,
        fullName: item.full_name,
        employeeNumber: item.employee_number,
        itemType: 'DBS/PVG',
        statusCategory: item.compliance.dbsPvg.statusCategory,
        expiryDate: item.compliance.dbsPvg.expiryDate,
        detail: item.compliance.dbsPvg.detail,
      });
    }

    if (item.compliance.nmcRegistration.isNurse && item.compliance.nmcRegistration.statusCategory !== 'Current') {
      expiringItems.push({
        staffId: item.id,
        fullName: item.full_name,
        employeeNumber: item.employee_number,
        itemType: 'NMC Registration',
        statusCategory: item.compliance.nmcRegistration.statusCategory,
        expiryDate: item.compliance.nmcRegistration.expiryDate,
        detail: item.compliance.nmcRegistration.detail,
      });
    }

    if (!item.compliance.documentsComplete) {
      expiringItems.push({
        staffId: item.id,
        fullName: item.full_name,
        employeeNumber: item.employee_number,
        itemType: 'Unsigned Document',
        statusCategory: 'Under Review',
        expiryDate: null,
        detail: 'One or more official workforce documents require electronic signature.',
      });
    }
  }

  return NextResponse.json({
    summary: {
      totalActiveStaff,
      totalPendingStaff,
      currentCount,
      expiringSoonCount,
      expiredCount,
      missingCount,
      underReviewCount,
      nursesTotal,
      nursesFullyRegistered,
      nursesActionNeeded,
      generatedAt: new Date().toISOString(),
    },
    staffCompliance,
    expiringItems,
  });
}
