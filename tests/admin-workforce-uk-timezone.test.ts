import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('admin workforce UK scheduling timezone', () => {
  it('formats assignment inputs and converts them using Europe/London rather than browser local time', () => {
    const page = readFileSync('app/admin/workforce/page.tsx', 'utf8');
    expect(page).toContain("timeZone: 'Europe/London'");
    expect(page).toContain('function londonLocalToIso');
    expect(page).toContain('const scheduledStartIso = londonLocalToIso(scheduledStart);');
    expect(page).toContain('const scheduledEndIso = londonLocalToIso(scheduledEnd);');
    expect(page).not.toContain('new Date(scheduledStart).toISOString()');
    expect(page).not.toContain('new Date(scheduledEnd).toISOString()');
  });
});
