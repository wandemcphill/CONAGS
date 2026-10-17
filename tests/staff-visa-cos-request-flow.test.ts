import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

describe('CONAGS staff visa / COS request flow', () => {
  it('shows COS status and role-specific request actions on the staff dashboard', () => {
    const api = source('app/api/staff/workforce-dashboard/route.ts');
    const page = source('components/StaffHomeDashboard.tsx');
    expect(api).toContain('visaSupport');
    expect(api).toContain('COS not requested');
    expect(api).toContain('Processing COS');
    expect(api).toContain('Active');
    expect(page).toContain('Download COS');
    expect(page).toContain('Message Admin / HR');
    expect(page).toContain('visaSupport');
  });

  it('generates the £2,000 invoice only when a staff member requests support', () => {
    const api = source('app/api/staff/visa-sponsorship/route.ts');
    expect(api).toContain("laurem_request_staff_visa_sponsorship");
    expect(api).toContain("eventType: 'staff.visa_request.admin'");
    expect(api).toContain("idempotencyKey: 'staff.visa_request.admin/' + String(data.case.id)");
    expect(api).toContain('portalNotifications.internalRecipient');
    expect(api).toContain('to: [lauremCompany.portalNotifications.internalRecipient]');
    expect(api).toContain("Number(data.invoice.amount_pence || 200000) / 100");
  });

  it('restricts the staff request CTA to Healthcare Assistants and Registered Nurses', () => {
    const api = source('app/api/staff/visa-sponsorship/route.ts');
    const helper = source('lib/laurem-visa-payment-plan.ts');
    expect(api).toContain("if (isInternationalNurseRole(role)) return 'international_sponsorship';");
    expect(api).toContain("if (isApplicationInUk(application) && isUkSwitchSplitRole(role)) return 'visa_switch';");
    expect(helper).toContain("value.includes('healthcare assistant') || value.includes('support worker')");
    expect(api).toContain('Visa support requests are currently available for UK visa switches for Healthcare Assistants, Senior Healthcare Assistants, Support Workers and Senior Support Workers, and for International Nurses.');
  });

  it('uses the requested COS state language while keeping existing lifecycle storage states', () => {
    const lifecycle = source('lib/laurem-visa-lifecycle.ts');
    const staffApi = source('app/api/staff/visa-sponsorship/route.ts');
    const readiness = source('lib/laurem-visa-readiness.ts');
    expect(lifecycle).toContain("requested: ['admin_review', 'awaiting_payment', 'preparing_sms'");
    expect(lifecycle).toContain("status === 'preparing_sms' || status === 'submitted_to_sms'");
    expect(staffApi).toContain("label: 'Processing COS'");
    expect(staffApi).toContain("label: 'Active'");
    expect(readiness).toContain("!['preparing_sms', 'submitted_to_sms'].includes(input.targetStatus)");
    expect(staffApi).toContain("['preparing_sms', 'submitted_to_sms', 'cos_pending']");
  });

  it('lets Admin move a requested case to Processing COS and upload the CoS into the same private staff record', () => {
    const page = source('app/admin/workforce/[staffId]/visa-sponsorship/page.tsx');
    const documentRoute = source('app/api/admin/workforce/staff/[staffId]/documents/route.ts');
    expect(page).toContain('Mark Processing COS');
    expect(page).toContain("patch({status:'preparing_sms'})");
    expect(page).toContain('Upload CoS to staff portal');
    expect(page).toContain("form.set('category','visa_sponsorship')");
    expect(documentRoute).toContain("category === 'visa_sponsorship'");
    expect(documentRoute).toContain("nextStatus = 'cos_assigned'");
  });

  it('puts open visa requests directly on the Admin workforce dashboard', () => {
    const api = source('app/api/admin/workforce/visa-requests/route.ts');
    const page = source('app/admin/workforce/page.tsx');
    expect(api).toContain("not('status', 'in', '(declined,withdrawn,completed)')");
    expect(api).toContain('newRequests');
    expect(api).toContain('processing');
    expect(api).toContain('active');
    expect(page).toContain('Visa & Sponsorship Requests');
    expect(page).toContain('/api/admin/workforce/visa-requests');
  });

  it('keeps CoS download private to the authenticated staff owner', () => {
    const route = source('app/api/staff/documents/[id]/download/route.ts');
    expect(route).toContain('getStaffSession(request)');
    expect(route).toContain(".eq('staff_id', session.staff_id)");
    expect(route).toContain("document.category === 'visa_sponsorship'");
    expect(route).toContain("!['cos_assigned', 'completed'].includes(visaCase.status)");
    expect(route).toContain("'private, no-store, max-age=0'");
  });
});


describe('CONAGS UK switch invoice terms', () => {
  it('uses £500 upfront and £1,500 deferred across 13 weekly deductions', () => {
    const helper = source('lib/laurem-visa-payment-plan.ts');
    const migration = source('supabase/migrations/20260927190000_uk_switch_split_invoice.sql');
    const staffApi = source('app/api/staff/visa-sponsorship/route.ts');
    expect(helper).toContain('UK_SWITCH_UPFRONT_AMOUNT_PENCE = 50_000');
    expect(helper).toContain('UK_SWITCH_DEFERRED_AMOUNT_PENCE = 150_000');
    expect(helper).toContain('UK_SWITCH_WEEK_COUNT = 13');
    expect(helper).toContain('UK_SWITCH_WEEKLY_AMOUNT_PENCE = 11_538');
    expect(helper).toContain('UK_SWITCH_FINAL_WEEK_AMOUNT_PENCE = 11_544');
    expect(migration).toContain('£500 is due immediately and is required before CONAGS starts the visa sponsorship application process.');
    expect(migration).toContain('The remaining £1,500 is not due now.');
    expect(helper).toContain("value.includes('healthcare assistant') || value.includes('support worker')");
    expect(migration).toContain('v_invoice_amount_pence := 50000');
    expect(migration).toContain('v_invoice_due_date := current_date');
    expect(migration).toContain("'weekly_deduction_count', 13");
    expect(migration).toContain("'weekly_deduction_pence', 11538");
    expect(migration).toContain("'final_weekly_deduction_pence', 11544");
    expect(staffApi).toContain("Request CONAGS support to switch your UK visa.");
    expect(staffApi).toContain("initial service invoice is £500, payable within 3 days of the invoice issue date");
    expect(migration).toContain('v_invoice_amount_pence := 200000');
    expect(helper).toContain(": 'full_upfront';");
  });

  it('does not show Processing COS merely because an invoice is unpaid', () => {
    const staffApi = source('app/api/staff/visa-sponsorship/route.ts');
    const dashboardApi = source('app/api/staff/workforce-dashboard/route.ts');
    expect(staffApi).toContain("['preparing_sms', 'submitted_to_sms', 'cos_pending']");
    expect(staffApi).not.toContain("['awaiting_payment', 'preparing_sms', 'submitted_to_sms', 'cos_pending']");
    expect(dashboardApi).toContain("['preparing_sms', 'submitted_to_sms', 'cos_pending']");
  });

  it('keeps International Nurse requests on the full upfront path', () => {
    const api = source('app/api/staff/visa-sponsorship/route.ts');
    const helper = source('lib/laurem-visa-payment-plan.ts');
    expect(helper).toContain("value.includes('registered nurse') || value === 'nurse' || value.includes(' nurse')");
    expect(api).toContain("roleBasedPathway(role: string | null | undefined, application");
    expect(api).toContain("if (isInternationalNurseRole(role)) return 'international_sponsorship';");
  });
});
