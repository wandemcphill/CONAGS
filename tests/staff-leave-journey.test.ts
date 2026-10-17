import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

describe('staff leave journey', () => {
  it('provides a dedicated leave surface for dashboard actions', () => {
    expect(existsSync('app/staff/leave/page.tsx')).toBe(true);
    const page = readFileSync('app/staff/leave/page.tsx', 'utf8');
    expect(page).toContain("fetch('/api/staff/leave'");
    expect(page).toContain("method:'POST'");
    expect(page).toContain("method:'PATCH'");
    expect(page).toContain('Cancel request');
    expect(page).toContain('CONAGS note');
  });

  it('keeps the dashboard leave action routed to the dedicated surface', () => {
    const page = readFileSync('app/staff/page.tsx', 'utf8');
    expect(page).toContain("router.push('/staff/leave')");
  });
});
