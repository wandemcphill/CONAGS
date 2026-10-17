import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getEnhancedDbsFeePence, getPvgOfficialFeePence } from '../lib/laurem-staff-operations';
import { calculateThreeYearContractEndDate } from '../lib/laurem-contract-dates';

const source=(path:string)=>readFileSync(path,'utf8');

describe('CONAGS staff operations and compliance',()=>{
  it('defines the four workforce regions and care-setting choices',()=>{
    const helper=source('lib/laurem-staff-operations.ts');
    const page=source('app/staff/availability/page.tsx');
    for(const value of ['London','West Midlands','Manchester','Glasgow','Care home','Supported living / 1-to-1','Live-in care','Shared Lives / adult placement','Domiciliary / home care','Community care calls / double-up']){expect(helper+page).toContain(value);}
    expect(page).toContain('stable shift / long-term posting');
    expect(page).toContain('I can drive for community care calls');
  });
  it('uses the official Enhanced DBS fee schedule',()=>{
    expect(getEnhancedDbsFeePence(new Date('2026-09-27T00:00:00Z'))).toBe(4950);
    expect(getEnhancedDbsFeePence(new Date('2026-10-05T00:00:00Z'))).toBe(4100);
    expect(source('lib/laurem-staff-operations.ts')).toContain('£41.00 from 5 October 2026');
  });
  it('uses the current social-care PVG waiver period',()=>{
    expect(getPvgOfficialFeePence(new Date('2026-09-27T00:00:00Z'))).toBe(0);
    expect(getPvgOfficialFeePence(new Date('2027-08-01T00:00:00Z'))).toBe(5900);
    expect(source('supabase/migrations/20260927203000_staff_operations_rota_training_compliance.sql')).toContain('v_amount:=0');
  });
  it('stores a single selectable training city and separate service coverage regions',()=>{
    const api=source('app/api/staff/rota/route.ts');
    const page=source('app/staff/availability/page.tsx');
    const migration=source('supabase/migrations/20260927210000_training_location_preferences.sql');
    for(const value of ['Birmingham','London','Glasgow','Manchester']) expect(api+page+source('lib/laurem-staff-operations.ts')).toContain(value);
    for(const value of ['London','West Midlands','Manchester','Glasgow']) expect(page).toContain(value);
    expect(api).toContain('preferred_training_location');
    expect(migration).toContain('laurem_staff_rota_requests_training_location_chk');
    expect(page).toContain('Where would you like to cover shifts?');
  });
  it('calculates a calendar three-year sponsored contract end date',()=>{
    expect(calculateThreeYearContractEndDate('2026-09-27')).toBe('2029-09-27');
    expect(calculateThreeYearContractEndDate('2024-02-29')).toBe('2027-02-28');
    const api=source('app/api/admin/contracts/route.ts');
    expect(api).toContain('calculateThreeYearContractEndDate');
    expect(source('lib/laurem-contract.ts')).toContain('calculateThreeYearContractEndDate');
    expect(source('lib/laurem-international-nurse-contract.ts')).toContain('three calendar years');
  });
  it('shows the planned three-year sponsorship term in the staff visa workspace',()=>{
    expect(source('app/api/staff/visa-sponsorship/route.ts')).toContain('sponsorshipTermEndDate');
    expect(source('app/staff/visa-sponsorship/page.tsx')).toContain('Planned CONAGS sponsorship term');
  });
  it('keeps DBS/PVG requests separate from visa sponsorship invoices',()=>{
    expect(source('app/api/staff/compliance/route.ts')).toContain("laurem_request_staff_compliance");
    expect(source('app/api/staff/compliance/route.ts')).toContain('laurem_staff_compliance_cases');
    expect(source('supabase/migrations/20260927203000_staff_operations_rota_training_compliance.sql')).toContain("compliance_type in ('dbs','pvg')");
    expect(source('app/api/staff/compliance/route.ts')).toContain("to:[lauremCompany.portalNotifications.internalRecipient]");
  });
  it('makes training due and training week visible to staff',()=>{
    const page=source('app/staff/training/page.tsx');
    const api=source('app/api/staff/training/route.ts');
    expect(page).toContain('Mandatory one-week training');
    expect(page).toContain('TRAINING DUE');
    expect(api).toContain('laurem_staff_training_assignments');
  });
  it('gives Admin queues for rota, training and disclosure requests',()=>{
    const admin=source('app/admin/workforce/page.tsx');
    expect(admin).toContain('Rota requests');
    expect(admin).toContain('Training schedule');
    expect(admin).toContain('DBS & PVG requests');
    expect(source('app/api/admin/workforce/rota-requests/route.ts')).toContain("'approved'");
    expect(source('app/api/admin/workforce/training/route.ts')).toContain('Mandatory one-week induction training');
    expect(source('app/api/admin/workforce/compliance-requests/route.ts')).toContain('markPaid');
  });
  it('does not alter the UK visa switch split workflow',()=>{
    const api = source('app/api/staff/visa-sponsorship/route.ts');
    expect(api).toContain('Request CONAGS support to switch your UK visa.');
    expect(api).toContain('initial service invoice is £500');
    expect(api).toContain('remaining £1,500 is not payable now');
    expect(source('lib/laurem-visa-payment-plan.ts')).toContain('UK_SWITCH_UPFRONT_AMOUNT_PENCE = 50_000');
  });
});
