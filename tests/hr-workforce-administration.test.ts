import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateDateCategory,
  evaluateNurseRegistration,
  evaluateRightToWork,
  evaluateDbsPvg,
  buildStaffComplianceSnapshot,
  isNurseRole,
  normalizeRightToWorkPathway,
  StaffProfileRow,
} from '../lib/laurem-hr-workforce';
const staffDirectoryRoute = readFileSync(resolve(process.cwd(), 'app/api/admin/workforce/staff/route.ts'), 'utf8');
const staffRecordRoute = readFileSync(resolve(process.cwd(), 'app/api/admin/workforce/staff/[staffId]/route.ts'), 'utf8');
const staffRecordPage = readFileSync(resolve(process.cwd(), 'app/admin/workforce/[staffId]/page.tsx'), 'utf8');
const hrActionRoute = readFileSync(resolve(process.cwd(), 'app/api/admin/workforce/staff/[staffId]/hr-action/route.ts'), 'utf8');
const hrMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260926000000_laurem_hr_workforce_administration.sql'), 'utf8');

import {
  LAUREM_STAFF_EMPLOYMENT_STATUSES,
  LAUREM_STAFF_EMPLOYMENT_TRANSITIONS,
  isLauremStaffEmploymentStatus,
  isLauremStaffEmploymentTransitionAllowed,
} from '../lib/laurem-lifecycle-policy';

describe('HR / Workforce Administration Domain Tests', () => {
  it('correctly identifies nurse roles', () => {
    expect(isNurseRole('Registered Nurse')).toBe(true);
    expect(isNurseRole('Staff Nurse')).toBe(true);
    expect(isNurseRole('RN Care Lead')).toBe(true);
    expect(isNurseRole('Senior Care Assistant')).toBe(false);
    expect(isNurseRole('Healthcare Assistant')).toBe(false);
    expect(isNurseRole('Learning Coordinator')).toBe(false);
    expect(isNurseRole('RN Care Lead')).toBe(true);
  });

  it('categorizes compliance dates accurately relative to today', () => {
    const fakeNow = new Date('2026-09-25T12:00:00Z');
    expect(calculateDateCategory(null, fakeNow)).toBe('Missing');
    expect(calculateDateCategory('2026-09-20', fakeNow)).toBe('Expired');
    expect(calculateDateCategory('2026-10-15', fakeNow)).toBe('Expiring Soon');
    expect(calculateDateCategory('2027-09-25', fakeNow)).toBe('Current');
  });

  it('evaluates Registered Nurses NMC registration states', () => {
    const fakeNow = new Date('2026-09-25T12:00:00Z');
    const nurseStaff: StaffProfileRow = {
      id: 'staff-1',
      employee_number: 'EMP1001',
      full_name: 'Fiona Gallagher',
      email: 'fiona@conagscare.co.uk',
      job_title: 'Registered Nurse',
      employment_status: 'active',
      nmc_number: '12A3456E',
      nmc_status: 'fully_registered',
      nmc_expiry_date: '2027-06-30',
    };

    const evaluation = evaluateNurseRegistration(nurseStaff, fakeNow);
    expect(evaluation.isNurse).toBe(true);
    expect(evaluation.nmcNumber).toBe('12A3456E');
    expect(evaluation.registrationState).toBe('fully_registered');
    expect(evaluation.statusCategory).toBe('Current');

    const expiredNurse: StaffProfileRow = {
      ...nurseStaff,
      nmc_expiry_date: '2026-08-01',
    };
    const expiredEval = evaluateNurseRegistration(expiredNurse, fakeNow);
    expect(expiredEval.registrationState).toBe('restricted_not_cleared');
    expect(expiredEval.statusCategory).toBe('Expired');
  });

  it('evaluates Right to Work pathways', () => {
    const fakeNow = new Date('2026-09-25T12:00:00Z');
    const staff: StaffProfileRow = {
      id: 'staff-2',
      employee_number: 'EMP1002',
      full_name: 'Arthur Pendelton',
      email: 'arthur@conagscare.co.uk',
      job_title: 'Senior Care Assistant',
      employment_status: 'active',
      right_to_work_pathway: 'uk',
      right_to_work_verified: true,
      right_to_work_expiry_date: '2027-12-31',
    };

    const rtw = evaluateRightToWork(staff, 'uk', fakeNow);
    expect(rtw.verified).toBe(true);
    expect(rtw.statusCategory).toBe('Current');

    const unverified = evaluateRightToWork({ ...staff, right_to_work_verified: false }, undefined, fakeNow);
    expect(unverified.verified).toBe(false);
    expect(unverified.statusCategory).toBe('Under Review');

    expect(normalizeRightToWorkPathway('sponsorship')).toBe('sponsorship');
    expect(normalizeRightToWorkPathway('nonsense')).toBe('unknown');
    const unknownPathway = evaluateRightToWork({ ...staff, right_to_work_pathway: null }, undefined, fakeNow);
    expect(unknownPathway.statusCategory).toBe('Under Review');
    expect(unknownPathway.detail).toContain('not been recorded authoritatively');
  });

  it('evaluates DBS/PVG background check states', () => {
    const fakeNow = new Date('2026-09-25T12:00:00Z');
    const staff: StaffProfileRow = {
      id: 'staff-3',
      employee_number: 'EMP1003',
      full_name: 'Claire Bennet',
      email: 'claire@conagscare.co.uk',
      job_title: 'Care Assistant',
      employment_status: 'active',
      dbs_verified: true,
      dbs_pvg_check_date: '2025-01-10',
      dbs_pvg_expiry_date: '2026-10-10',
    };

    const dbs = evaluateDbsPvg(staff, fakeNow);
    expect(dbs.verified).toBe(true);
    expect(dbs.statusCategory).toBe('Expiring Soon');

    const expiredByRecordedStatus = evaluateDbsPvg({ ...staff, dbs_pvg_status: 'expired', dbs_pvg_expiry_date: '2027-10-10' }, fakeNow);
    expect(expiredByRecordedStatus.statusCategory).toBe('Expired');

    const underReview = evaluateDbsPvg({ ...staff, dbs_pvg_status: 'under_review', dbs_pvg_expiry_date: '2027-10-10' }, fakeNow);
    expect(underReview.statusCategory).toBe('Under Review');
  });

  it('builds comprehensive compliance snapshot and detects attention items', () => {
    const fakeNow = new Date('2026-09-25T12:00:00Z');
    const staff: StaffProfileRow = {
      id: 'staff-4',
      employee_number: 'EMP1004',
      full_name: 'David Tennant',
      email: 'david@conagscare.co.uk',
      job_title: 'Registered Nurse',
      employment_status: 'active',
      right_to_work_pathway: 'uk',
      right_to_work_verified: true,
      right_to_work_expiry_date: '2027-01-01',
      dbs_verified: false,
      nmc_number: '99X1122E',
      nmc_status: 'fully_registered',
      nmc_expiry_date: '2027-05-01',
    };

    const snapshot = buildStaffComplianceSnapshot(staff, {
      documentsComplete: true,
      onboardingComplete: true,
      now: fakeNow,
    });

    expect(snapshot.overallStatus).toBe('Current');
    expect(snapshot.attentionItems).toHaveLength(0);
    expect(snapshot.complianceFollowUps).toHaveLength(1);
    expect(snapshot.complianceFollowUps[0]).toContain('DBS/PVG');
  });

  it('enforces canonical staff employment status transitions', () => {
    expect(LAUREM_STAFF_EMPLOYMENT_STATUSES).toEqual(['pending', 'active', 'suspended', 'leaver']);

    expect(isLauremStaffEmploymentStatus('pending')).toBe(true);
    expect(isLauremStaffEmploymentStatus('active')).toBe(true);
    expect(isLauremStaffEmploymentStatus('suspended')).toBe(true);
    expect(isLauremStaffEmploymentStatus('leaver')).toBe(true);
    expect(isLauremStaffEmploymentStatus('fired')).toBe(false);

    expect(isLauremStaffEmploymentTransitionAllowed('pending', 'active')).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('active', 'suspended')).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('active', 'leaver')).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('suspended', 'active')).toBe(true);
    expect(isLauremStaffEmploymentTransitionAllowed('suspended', 'leaver')).toBe(true);

    expect(isLauremStaffEmploymentTransitionAllowed('leaver', 'active')).toBe(false);
    expect(isLauremStaffEmploymentTransitionAllowed('pending', 'suspended')).toBe(false);
    expect(isLauremStaffEmploymentTransitionAllowed('pending', 'leaver')).toBe(false);
  });
});


describe('HR / Workforce Administration integration guards', () => {
  it('filters computed compliance state before paginating the directory', () => {
    expect(staffDirectoryRoute).toContain('const hasComplianceFilter');
    expect(staffDirectoryRoute).toContain('const filteredCandidates = hasComplianceFilter');
    expect(staffDirectoryRoute).toContain('filteredCandidates.slice(offset, offset + limit)');
    expect(staffDirectoryRoute).toContain('const total = hasComplianceFilter ? filteredCandidates.length');
  });

  it('uses authoritative application and visa records for employment pathway', () => {
    expect(staffRecordRoute).toContain("select('application_data, requires_sponsorship, role_applied')");
    expect(staffRecordRoute).toContain("from('staff_visa_cases')");
    expect(staffRecordRoute).not.toContain("select('pathway, payload')");
    expect(staffRecordRoute).toContain('International Sponsorship');
    expect(staffRecordRoute).toContain('Visa Switch');
  });

  it('keeps pending staff behind the one-time portal activation boundary', () => {
    expect(staffRecordPage).not.toContain("s.employment_status === 'pending' && <button disabled={busy} onClick={() => void patchStaffStatus('active')}");
    expect(staffRecordPage).toContain('STAFF PORTAL ACTIVATION REQUIRED');
    expect(staffRecordPage).toContain('/admin/workforce/staff-account');
    expect(staffRecordPage).toContain("action: 'reissue_activation'");
    expect(staffRecordRoute).toContain('STAFF_ACTIVATION_REQUIRED');
    expect(staffRecordRoute).toContain('Staff portal activation is required before the employment status can become active.');
  });

  it('routes HR data mutations through atomic database procedures', () => {
    expect(hrActionRoute).toContain("rpc('laurem_hr_update_staff_profile'");
    expect(staffRecordRoute).toContain("rpc('laurem_change_staff_employment_status'");
    expect(hrMigration).toContain('create or replace function public.laurem_hr_update_staff_profile');
    expect(hrMigration).toContain('create or replace function public.laurem_change_staff_employment_status');
    expect(hrMigration).toContain('perform public.laurem_record_audit_event(');
  });

  it('stores an explicit Right-to-Work pathway and never infers it from job title', () => {
    expect(hrMigration).toContain('right_to_work_pathway');
    expect(staffDirectoryRoute).toContain('right_to_work_pathway');
    expect(hrActionRoute).toContain('rightToWorkPathway');
    expect(staffRecordRoute).not.toContain("job_title.toLowerCase().includes('sponsor')");
  });
});


describe('CONAGS £500 visa-switch invoice payment link', () => {
  it('sets the Stripe payment link and a three-day due date for the £500 invoice', () => {
    const migration = readFileSync(
      'supabase/migrations/20260930191000_add_stripe_link_to_500_pound_invoice.sql',
      'utf8',
    );
    expect(migration).toContain("v_payment_url := ''https://buy.stripe.com/4gMcN63sc39823A6OYbAs0m'';");
    expect(migration).toContain('v_invoice_due_date := current_date + 3;');
    expect(migration).toContain('payment_url');
  });

  it('shows invoice details and bank-transfer payment instructions in staff and admin views', () => {
    const staff = readFileSync('app/staff/visa-sponsorship/page.tsx', 'utf8');
    const admin = readFileSync('app/admin/workforce/[staffId]/visa-sponsorship/page.tsx', 'utf8');

    // The current payment flow uses bank transfer, not a hosted Stripe checkout link.
    expect(staff).toContain('<BankTransferInstructions');
    expect(staff).toContain('paymentReference={paymentReference} bankDetails={data.paymentBankDetails}');
    expect(staff).toContain('Pay by bank transfer');
    expect(staff).toContain('No hosted card-payment link is required.');
    expect(staff).toContain('within 3 days of the invoice issue date');

    expect(admin).toContain('<strong>Bank transfer payment</strong>');
    expect(admin).toContain('data.paymentBankDetails?.accountNumber');
    expect(admin).toContain('invoice?.due_date');
    expect(admin).toContain('£500 due within 3 days of the invoice issue date');
  });
});
