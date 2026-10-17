import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('professional job description templates', () => {
  const generator = readFileSync(
    resolve(process.cwd(), 'lib/laurem-job-description.ts'),
    'utf8',
  );
  const healthcareAssistant = readFileSync(
    resolve(process.cwd(), 'docs/job-descriptions/laurem-healthcare-assistant.md'),
    'utf8',
  );

  it('uses version-controlled role templates instead of a hard-coded generated block', () => {
    expect(generator).toContain('renderTemplate(');
    expect(generator).toContain('docs/job-descriptions/laurem-healthcare-assistant.md');
    expect(generator).not.toContain('return [');
    expect(generator).not.toContain("'KEY RESPONSIBILITIES'");
  });

  it('contains formal job-purpose, responsibilities, person-specification and document-control sections', () => {
    for (const heading of [
      '## 1. Job purpose',
      '## 2. Key responsibilities',
      '## 4. Person specification',
      '## 5. Competence and delegated duties',
      '## 8. Performance and development',
      '## 10. Document control',
      '## Employee acknowledgement',
    ]) {
      expect(healthcareAssistant).toContain(heading);
    }
  });

  it('keeps employment terms in the contract rather than inventing them in the job description', () => {
    expect(healthcareAssistant).toContain(
      'Working hours, pay, holidays, notice and other contractual terms are governed by the employment contract.',
    );
    expect(healthcareAssistant).toContain(
      'This document should be read together with the employment contract and Staff Handbook.',
    );
  });
});
