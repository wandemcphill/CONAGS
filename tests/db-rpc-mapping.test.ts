import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS Supabase RPC mapping', () => {
  const source = readFileSync(resolve(process.cwd(), 'lib/db.ts'), 'utf8');

  it('does not double-prefix already namespace-qualified RPC names', () => {
    expect(source).toContain("if (name.startsWith('laurem_')) return name;");
    expect(source).toContain("throw new Error(`CONAGS database namespace violation: RPC \"${name}\" is outside the CONAGS namespace.`);");
  });

  it('still maps legacy logical CONAGS RPC names into the CONAGS namespace', () => {
    expect(source).toContain("if (LAUREM_RPC_NAMES.has(name)) return `laurem_${name}`;");
  });
});
