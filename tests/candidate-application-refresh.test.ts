import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('candidate application refresh recovery', () => {
  it('persists application draft and step in session storage until submission', () => {
    const page = readFileSync('app/apply/[token]/page.tsx', 'utf8');
    expect(page).toContain("sessionStorage.getItem(key)");
    expect(page).toContain("sessionStorage.setItem(key");
    expect(page).toContain("sessionStorage.removeItem");
    expect(page).toContain("laurem:application-draft:");
    expect(page).toContain('browser tab until you submit');
  });
});
