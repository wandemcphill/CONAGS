import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LAUREM_COUNTRY_OPTIONS } from '@/lib/laurem-country-options';
import { LAUREM_CURRENT_UK_VISA_TYPES } from '@/lib/laurem-visa-options';

describe('CONAGS staff visa sponsorship workflow', () => {
  it('defines dedicated UK visa cases with role-specific invoice handling', () => {
    const sql = readFileSync('supabase/migrations/20260920_staff_visa_sponsorship.sql', 'utf8');
    expect(sql).toContain('create table if not exists public.laurem_staff_visa_cases');
    expect(sql).toContain('create table if not exists public.laurem_staff_visa_invoices');
    expect(sql).toContain('amount_pence integer not null default 200000');
    expect(sql).toContain("pathway in ('visa_switch','international_sponsorship')");
    expect(sql).toContain('laurem_request_staff_visa_sponsorship');
    expect(sql).toContain('grant execute on function public.laurem_request_staff_visa_sponsorship');
    const pricing = readFileSync('supabase/migrations/20260927190000_uk_switch_split_invoice.sql', 'utf8');
    expect(pricing).toContain('v_invoice_amount_pence := 50000');
    expect(pricing).toContain('v_invoice_amount_pence := 200000');
    expect(pricing).toContain("'weekly_deduction_count', 13");
  });

  it('keeps visa sponsorship records private to the service layer', () => {
    const sql = readFileSync('supabase/migrations/20260920_staff_visa_sponsorship.sql', 'utf8');
    expect(sql).toContain('alter table public.laurem_staff_visa_cases enable row level security');
    expect(sql).toContain('revoke all on public.laurem_staff_visa_cases, public.laurem_staff_visa_invoices, public.laurem_staff_visa_case_events from anon, authenticated');
    expect(sql).toContain('grant execute on function public.laurem_request_staff_visa_sponsorship(uuid,text) to service_role');
    const auditFix = readFileSync('supabase/migrations/20260920_staff_visa_audit_event_fix.sql', 'utf8');
    expect(auditFix).toContain("'candidate_information_updated'");
  });

  it('uses existing recruitment information while collecting only sponsorship-specific details from the new hire', () => {
    const route = readFileSync('app/api/staff/visa-sponsorship/route.ts', 'utf8');
    const page = readFileSync('app/staff/visa-sponsorship/page.tsx', 'utf8');
    expect(route).toContain("from('recruitment_applications')");
    expect(route).toContain('laurem_request_staff_visa_sponsorship');
    expect(page).toContain('Information already held');
    expect(page).toContain('Complete your sponsorship details');
    expect(page).toContain('Passport number *');
    expect(page).toContain('Passport expiry *');
    expect(page).toContain('Passport country *');
  });

  it('makes sponsorship passport and visa details candidate-entered and required', () => {
    const page = readFileSync('app/staff/visa-sponsorship/page.tsx', 'utf8');
    const route = readFileSync('app/api/staff/visa-sponsorship/route.ts', 'utf8');
    expect(page).toContain('These details are completed by you, the new hire.');
    expect(page).toContain('Passport number *');
    expect(page).toContain('Passport expiry *');
    expect(page).toContain('Passport country *');
    expect(page).toContain('Current UK visa start date *');
    expect(page).toContain('Current UK visa end date *');
    expect(page).toContain('required={isVisaSwitch}');
    expect(page).toContain("setPassportCountry(normalisePassportCountry(info.passport_country||''));");
    expect(page).not.toContain("setPassportCountry(info.passport_country||b.application?.nationality||'');");
    expect(route).toContain('missingCandidateFields');
    expect(route).toContain('Please complete the required sponsorship details:');
    expect(route).toContain("currentCase.pathway === 'visa_switch'");
    expect(route).toContain('currentVisaStartDate');
    expect(route).toContain('currentVisaEndDate');
    expect(route).toContain('Current UK visa end date cannot be before the start date.');
  });

  it('uses complete country and current UK visa option lists and captures address/right-to-work checks', () => {
    const page = readFileSync('app/staff/visa-sponsorship/page.tsx', 'utf8');
    const route = readFileSync('app/api/staff/visa-sponsorship/route.ts', 'utf8');
    const countries = readFileSync('lib/laurem-country-options.ts', 'utf8');
    const visas = readFileSync('lib/laurem-visa-options.ts', 'utf8');
    expect(LAUREM_COUNTRY_OPTIONS).toHaveLength(249);
    expect(LAUREM_COUNTRY_OPTIONS.some(option => option.code === 'NG')).toBe(true);
    expect(LAUREM_COUNTRY_OPTIONS.some(option => option.code === 'GB')).toBe(true);
    expect(LAUREM_CURRENT_UK_VISA_TYPES.some(option => option.value === 'Student visa')).toBe(true);
    expect(LAUREM_CURRENT_UK_VISA_TYPES.some(option => option.value === 'Graduate visa')).toBe(true);
    expect(page).toContain('LAUREM_COUNTRY_OPTIONS.map');
    expect(page).toContain('LAUREM_CURRENT_UK_VISA_TYPES.map');
    expect(page).toContain('Is the application address above still your current address?');
    expect(page).toContain('Have you provided proof of this current address to CONAGS Admin as part of your application?');
    expect(page).toContain('Do you currently have the right to work in the UK?');
    expect(page).toContain('Have you provided your right-to-work proof to CONAGS Admin as part of your application?');
    expect(page).toContain('UK status share code');
    expect(route).toContain('applicationAddresses');
    expect(route).toContain('address_is_current');
    expect(route).toContain('address_proof_provided');
    expect(route).toContain('right_to_work_status');
    expect(route).toContain('right_to_work_proof_provided');
    expect(route).toContain('uk_status_share_code');
    expect(countries).toContain('NG');
    expect(countries).toContain('GB');
    expect(visas).toContain("'Student visa'");
    expect(visas).toContain("'Graduate visa'");
    expect(visas).toContain("'Skilled Worker visa'");
    expect(visas).toContain("'Health and Care Worker visa'");
    expect(visas).toContain("'Other / not listed'");
  });

  it('provides the staff-facing invoice and persistent CoS download', () => {
    const page = readFileSync('app/staff/visa-sponsorship/page.tsx', 'utf8');
    expect(page).toContain('CONAGS invoice');
    expect(page).toContain('£500 is due within 3 days of the invoice issue date');
    expect(page).toContain('£1,500');
    expect(page).toContain('£2,000');
    expect(page).toContain('/api/staff/documents/');
    expect(page).toContain('/download');
    expect(page).toContain('Certificate of Sponsorship');
  });

  it('gives admins an SMS workspace and allows CoS uploads into the private staff account', () => {
    const page = readFileSync('app/admin/workforce/[staffId]/visa-sponsorship/page.tsx', 'utf8');
    const route = readFileSync('app/api/admin/workforce/staff/[staffId]/visa-sponsorship/route.ts', 'utf8');
    const upload = readFileSync('app/api/admin/workforce/staff/[staffId]/documents/route.ts', 'utf8');
    expect(page).toContain('Open Sponsor Management System');
    expect(page).toContain('Upload CoS to staff portal');
    expect(route).toContain("https://www.gov.uk/sponsor-management-system");
    expect(upload).toContain("'visa_sponsorship'");
    expect(upload).toContain("event_type: 'document_uploaded'");
    expect(upload).toContain("next_case_status");
    expect(upload).toContain("status: nextStatus");
  });

  it('keeps the existing download route private and records downloads', () => {
    const download = readFileSync('app/api/staff/documents/[id]/download/route.ts', 'utf8');
    expect(download).toContain("getStaffSession(request)");
    expect(download).toContain("'laurem-private-documents'");
    expect(download).toContain("event_type: 'downloaded'");
    expect(download).toContain("Content-Disposition");
  });
});