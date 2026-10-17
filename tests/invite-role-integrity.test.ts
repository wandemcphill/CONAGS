import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('recruitment invitation role integrity', () => {
  const route = readFileSync(resolve(process.cwd(), 'app/api/admin/invites/route.ts'), 'utf8');
  const helper = readFileSync(resolve(process.cwd(), 'lib/laurem-recruitment-invites.ts'), 'utf8');

  it('normalizes invitation roles through the canonical CONAGS role policy', () => {
    expect(route).toContain("import { normalizeLauremRole } from '@/lib/laurem-role-policy';");
    expect(route).toContain('const role = normalizeLauremRole(body.role);');
    expect(route).toContain("if (!role) return NextResponse.json({ error: 'Invalid CONAGS recruitment role.' }, { status: 400 });");
    expect(helper).toContain("import { normalizeLauremRole, type LauremCanonicalRole } from '@/lib/laurem-role-policy';");
    expect(helper).toContain('const role = normalizeLauremRole(input.role);');
  });

  it('passes the normalized role into the persistence helper', () => {
    expect(route).toContain('{ candidateName, candidateEmail, role },');
    expect(helper).toContain('role,\n      token_hash: hashToken(token),');
  });
});
