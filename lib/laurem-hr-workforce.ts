import { recordLauremAuditEvent } from './laurem-audit';

export type ComplianceStateCategory = 'Current' | 'Expiring Soon' | 'Expired' | 'Missing' | 'Under Review';

export type NurseRegistrationState = 'fully_registered' | 'registration_in_progress' | 'verification_pending' | 'restricted_not_cleared' | 'not_applicable';

export type RightToWorkPathway = 'uk' | 'overseas' | 'sponsorship' | 'unknown';

export type RightToWorkEvaluation = {
  pathway: RightToWorkPathway;
  verified: boolean;
  statusCategory: ComplianceStateCategory;
  expiryDate: string | null;
  notes: string | null;
  detail: string;
};

export type DbsPvgEvaluation = {
  verified: boolean;
  statusCategory: ComplianceStateCategory;
  checkDate: string | null;
  expiryDate: string | null;
  detail: string;
};

export type NmcRegistrationEvaluation = {
  isNurse: boolean;
  nmcNumber: string | null;
  registrationState: NurseRegistrationState;
  statusCategory: ComplianceStateCategory;
  expiryDate: string | null;
  detail: string;
};

export type StaffComplianceSnapshot = {
  overallStatus: ComplianceStateCategory;
  rightToWork: RightToWorkEvaluation;
  dbsPvg: DbsPvgEvaluation;
  nmcRegistration: NmcRegistrationEvaluation;
  documentsComplete: boolean;
  onboardingComplete: boolean;
  attentionItems: string[];
  complianceFollowUps: string[];
};

export type StaffProfileRow = {
  id: string;
  application_id?: string | null;
  employee_number: string;
  laurem_id?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  job_title: string;
  employment_status: string;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  manager_id?: string | null;
  right_to_work_pathway?: RightToWorkPathway | null;
  nmc_number?: string | null;
  nmc_status?: NurseRegistrationState | null;
  nmc_expiry_date?: string | null;
  right_to_work_verified?: boolean;
  right_to_work_expiry_date?: string | null;
  right_to_work_notes?: string | null;
  dbs_verified?: boolean;
  dbs_pvg_status?: string | null;
  dbs_pvg_check_date?: string | null;
  dbs_pvg_expiry_date?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  contract_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function isNurseRole(jobTitle: string | null | undefined): boolean {
  if (!jobTitle) return false;
  return /\bnurse\b|\brn\b|\brgn\b/i.test(jobTitle);
}

export function normalizeRightToWorkPathway(value: string | null | undefined): RightToWorkPathway {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'uk' || normalized === 'overseas' || normalized === 'sponsorship' ? normalized : 'unknown';
}

export function calculateDateCategory(dateStr: string | null | undefined, now: Date = new Date()): ComplianceStateCategory {
  if (!dateStr) return 'Missing';
  const target = new Date(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(target.getTime())) return 'Missing';

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffDays = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Expired';
  if (diffDays <= 60) return 'Expiring Soon';
  return 'Current';
}

export function evaluateNurseRegistration(staff: StaffProfileRow, now: Date = new Date()): NmcRegistrationEvaluation {
  const isNurse = isNurseRole(staff.job_title);
  if (!isNurse) {
    return {
      isNurse: false,
      nmcNumber: staff.nmc_number || null,
      registrationState: 'not_applicable',
      statusCategory: 'Current',
      expiryDate: null,
      detail: 'Job title is not a registered nurse role.',
    };
  }

  const nmcNumber = staff.nmc_number?.trim() || null;
  let state: NurseRegistrationState = staff.nmc_status || 'verification_pending';

  if (!nmcNumber) {
    state = 'restricted_not_cleared';
    return {
      isNurse: true,
      nmcNumber: null,
      registrationState: state,
      statusCategory: 'Missing',
      expiryDate: staff.nmc_expiry_date || null,
      detail: 'NMC Pin/registration number is missing.',
    };
  }

  const dateCategory = calculateDateCategory(staff.nmc_expiry_date, now);
  if (dateCategory === 'Expired') {
    state = 'restricted_not_cleared';
  } else if (state === 'verification_pending' && staff.nmc_expiry_date && dateCategory === 'Current') {
    state = 'fully_registered';
  }

  let statusCategory: ComplianceStateCategory = 'Current';
  if (state === 'restricted_not_cleared' || dateCategory === 'Expired') {
    statusCategory = 'Expired';
  } else if (state === 'verification_pending' || state === 'registration_in_progress') {
    statusCategory = 'Under Review';
  } else if (dateCategory === 'Expiring Soon') {
    statusCategory = 'Expiring Soon';
  }

  return {
    isNurse: true,
    nmcNumber,
    registrationState: state,
    statusCategory,
    expiryDate: staff.nmc_expiry_date || null,
    detail:
      state === 'fully_registered'
        ? 'NMC registration is active and verified.'
        : state === 'registration_in_progress'
        ? 'NMC registration application is in progress.'
        : state === 'verification_pending'
        ? 'NMC registration number submitted; awaiting administrative verification.'
        : 'NMC registration is restricted, expired, or not cleared.',
  };
}

export function evaluateRightToWork(
  staff: StaffProfileRow,
  pathwayOverride?: RightToWorkPathway,
  now: Date = new Date(),
): RightToWorkEvaluation {
  const pathway: RightToWorkPathway = pathwayOverride ?? normalizeRightToWorkPathway(staff.right_to_work_pathway);
  const verified = Boolean(staff.right_to_work_verified);
  const expiryDate = staff.right_to_work_expiry_date || null;
  const notes = staff.right_to_work_notes || null;

  if (pathway === 'unknown') {
    return {
      pathway,
      verified,
      statusCategory: 'Under Review',
      expiryDate,
      notes,
      detail: 'Right to work pathway has not been recorded authoritatively.',
    };
  }

  if (!verified) {
    return {
      pathway,
      verified: false,
      statusCategory: 'Under Review',
      expiryDate,
      notes,
      detail: 'Right to work evidence is outstanding or under review.',
    };
  }

  const dateCategory = expiryDate ? calculateDateCategory(expiryDate, now) : 'Current';
  let statusCategory: ComplianceStateCategory = dateCategory;

  if (dateCategory === 'Expired') {
    statusCategory = 'Expired';
  } else if (dateCategory === 'Expiring Soon') {
    statusCategory = 'Expiring Soon';
  }

  return {
    pathway,
    verified: true,
    statusCategory,
    expiryDate,
    notes,
    detail:
      statusCategory === 'Current'
        ? 'Right to work verified and clear.'
        : statusCategory === 'Expiring Soon'
        ? 'Right to work clearance expires soon.'
        : 'Right to work clearance has expired.',
  };
}

export function evaluateDbsPvg(staff: StaffProfileRow, now: Date = new Date()): DbsPvgEvaluation {
  const verified = Boolean(staff.dbs_verified);
  const checkDate = staff.dbs_pvg_check_date || null;
  const expiryDate = staff.dbs_pvg_expiry_date || null;
  const recordedStatus = staff.dbs_pvg_status?.trim().toLowerCase() || '';

  if (recordedStatus === 'not_applicable') {
    return {
      verified: true,
      statusCategory: 'Current',
      checkDate,
      expiryDate,
      detail: 'DBS/PVG check is recorded as not applicable for this staff record.',
    };
  }

  if (recordedStatus === 'expired') {
    return {
      verified,
      statusCategory: 'Expired',
      checkDate,
      expiryDate,
      detail: 'DBS/PVG check has been marked expired.',
    };
  }

  if (recordedStatus === 'pending' || recordedStatus === 'under_review') {
    return {
      verified,
      statusCategory: 'Under Review',
      checkDate,
      expiryDate,
      detail: 'DBS/PVG check is pending or under administrative review.',
    };
  }

  if (!verified) {
    return {
      verified: false,
      statusCategory: 'Missing',
      checkDate,
      expiryDate,
      detail: 'DBS/PVG background check is outstanding or evidence is missing.',
    };
  }

  const dateCategory = expiryDate ? calculateDateCategory(expiryDate, now) : 'Current';

  return {
    verified: true,
    statusCategory: dateCategory,
    checkDate,
    expiryDate,
    detail:
      dateCategory === 'Current'
        ? 'DBS/PVG check verified and current.'
        : dateCategory === 'Expiring Soon'
        ? 'DBS/PVG check expires soon.'
        : 'DBS/PVG check has expired.',
  };
}

export function buildStaffComplianceSnapshot(
  staff: StaffProfileRow,
  options?: { documentsComplete?: boolean; onboardingComplete?: boolean; now?: Date },
): StaffComplianceSnapshot {
  const now = options?.now || new Date();
  const rtw = evaluateRightToWork(staff, undefined, now);
  const dbs = evaluateDbsPvg(staff, now);
  const nmc = evaluateNurseRegistration(staff, now);
  const documentsComplete = options?.documentsComplete ?? true;
  const onboardingComplete = options?.onboardingComplete ?? true;

  const attentionItems: string[] = [];
  const complianceFollowUps: string[] = [];
  if (rtw.statusCategory !== 'Current') attentionItems.push(`Right to work: ${rtw.detail}`);
  if (dbs.statusCategory !== 'Current') complianceFollowUps.push(`DBS/PVG: ${dbs.detail}`);
  if (nmc.isNurse && nmc.statusCategory !== 'Current') attentionItems.push(`NMC Nurse Registration: ${nmc.detail}`);
  if (!documentsComplete) attentionItems.push('Workforce documents: Required documents incomplete or signature pending.');
  if (!onboardingComplete) attentionItems.push('Onboarding: Required onboarding tasks incomplete.');

  let overallStatus: ComplianceStateCategory = 'Current';
  const categories = [rtw.statusCategory, ...(nmc.isNurse ? [nmc.statusCategory] : [])];
  if (!documentsComplete || !onboardingComplete) {
    categories.push('Under Review');
  }

  if (categories.includes('Expired')) overallStatus = 'Expired';
  else if (categories.includes('Missing')) overallStatus = 'Missing';
  else if (categories.includes('Expiring Soon')) overallStatus = 'Expiring Soon';
  else if (categories.includes('Under Review')) overallStatus = 'Under Review';

  return {
    overallStatus,
    rightToWork: rtw,
    dbsPvg: dbs,
    nmcRegistration: nmc,
    documentsComplete,
    onboardingComplete,
    attentionItems,
    complianceFollowUps,
  };
}

export async function recordHrPrivilegedAction(params: {
  staffId: string;
  action: string;
  actor: string;
  previousState?: unknown;
  newState?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  applicationId?: string | null;
}): Promise<void> {
  await recordLauremAuditEvent({
    lifecycleArea: 'workforce',
    entityType: 'staff_profile',
    entityId: params.staffId,
    staffId: params.staffId,
    applicationId: params.applicationId || null,
    actorType: 'admin',
    actor: params.actor,
    action: params.action,
    previousState: params.previousState ? JSON.stringify(params.previousState) : null,
    newState: params.newState ? JSON.stringify(params.newState) : null,
    reason: params.reason || null,
    metadata: params.metadata || {},
  });
}
