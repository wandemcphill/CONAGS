import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('staff timesheet rejection recovery', () => {
  it('exposes the existing PATCH/resubmit workflow to staff', () => {
    const page = readFileSync('app/staff/timesheets/page.tsx', 'utf8');
    expect(page).toContain("method: editingId ? 'PATCH' : 'POST'");
    expect(page).toContain("...(editingId ? { submit: true } : {})");
    expect(page).toContain('Edit & resubmit');
    expect(page).toContain('CONAGS review note:');
    expect(page).toContain('Correct the rejected timesheet below');
  });
});
