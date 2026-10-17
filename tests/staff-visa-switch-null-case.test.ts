import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('staff Visa Switch workspace', () => {
  it('does not dereference a missing visa case before the request is created', () => {
    const page = readFileSync('app/staff/visa-sponsorship/page.tsx', 'utf8');
    expect(page).toContain("const c=data.case;const invoice=data.invoice;");
    expect(page).toContain("const isVisaSwitch=c?.pathway==='visa_switch';");
    expect(page).toContain('{!c?<StaffPanel className="staff-visa-request-panel">');
  });
});
