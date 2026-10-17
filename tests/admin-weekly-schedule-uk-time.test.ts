import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('admin weekly schedule UK timezone', () => {
  it('uses Europe/London for week dates, displayed shift times and shift creation', () => {
    const page = readFileSync('app/admin/workforce/schedule/page.tsx', 'utf8');
    expect(page).toContain("timeZone:'Europe/London'");
    expect(page).toContain('function londonToday');
    expect(page).toContain('function londonInputToIso');
    expect(page).toContain("const startIso=londonInputToIso(selectedDay+'T'+start);");
    expect(page).toContain("const endIso=londonInputToIso(selectedDay+'T'+end);");
    expect(page).not.toContain("new Date(selectedDay+'T'+start)");
    expect(page).not.toContain("new Date(selectedDay+'T'+end)");
  });
});
