import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('professional standard staff handbook', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'docs/handbooks/laurem-staff-handbook.md'),
    'utf8',
  );
  const documentSource = readFileSync(
    resolve(process.cwd(), 'lib/laurem-recruitment-documents.ts'),
    'utf8',
  );

  it('contains formal document governance and role boundaries', () => {
    expect(source).toContain('Document title:');
    expect(source).toContain('**Document owner:** Conags Care Group Limited');
    expect(source).toContain('It does not replace your contract');
    expect(source).toContain('Working within your competence');
  });

  it('covers core employee, care and compliance responsibilities', () => {
    for (const section of [
      'Safeguarding',
      'Professional boundaries',
      'Attendance, punctuality and rota responsibilities',
      'Confidentiality and information governance',
      'Health, safety and infection prevention',
      'Training, supervision and competence',
      'Raising concerns and speaking up',
      'Pay, timesheets and deductions',
      'Immigration and right-to-work responsibilities',
      'Leaving Conags',
      'Acknowledgement',
    ]) {
      expect(source).toContain('## ');
      expect(source).toContain(section);
    }
  });

  it('loads the version-controlled handbook instead of a second hard-coded copy', () => {
    expect(documentSource).toContain(
      "readHandbook('docs/handbooks/laurem-staff-handbook.md')",
    );
    expect(documentSource).not.toContain('const STANDARD_HANDBOOK =');
  });
});
