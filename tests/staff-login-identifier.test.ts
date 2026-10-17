import { describe, expect, it } from 'vitest';

function isSafeIdentifier(value: string) {
  return /^[A-Z0-9-]{3,64}$/.test(value);
}

describe('staff login identifier validation', () => {
  it('accepts CONAGS IDs and employee numbers', () => {
    expect(isSafeIdentifier('LAU-001234')).toBe(true);
    expect(isSafeIdentifier('EMP-123')).toBe(true);
    expect(isSafeIdentifier('1007')).toBe(true);
  });

  it('rejects filter syntax and malformed identifiers', () => {
    expect(isSafeIdentifier('LAU-001234,or')).toBe(false);
    expect(isSafeIdentifier('LAU-001234)')).toBe(false);
    expect(isSafeIdentifier('x y')).toBe(false);
    expect(isSafeIdentifier('')).toBe(false);
  });
});
