import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Mega-Build 23 staff command centre navigation', () => {
  it('provides keyboard quick navigation without changing staff route contracts', () => {
    const palette = readFileSync('components/StaffCommandPalette.tsx', 'utf8');
    const shell = readFileSync('components/StaffShell.tsx', 'utf8');
    expect(palette).toContain("e.key.toLowerCase()==='k'");
    expect(palette).toContain('ArrowDown');
    expect(palette).toContain('ArrowUp');
    expect(palette).toContain('router.push');
    expect(palette).toContain('/staff/shifts');
    expect(palette).toContain('/staff/attendance');
    expect(palette).toContain('/staff/timesheets');
    expect(palette).toContain('/staff/documents');
    expect(palette).toContain('/staff/visa-sponsorship');
    expect(shell).toContain('StaffCommandPalette');
  });
});
