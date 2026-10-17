import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('all-candidate assessment review', () => {
  const api = readFileSync(resolve(process.cwd(), 'app/api/admin/assessments/route.ts'), 'utf8');
  const page = readFileSync(resolve(process.cwd(), 'app/admin/assessments/page.tsx'), 'utf8');
  const adminPage = readFileSync(resolve(process.cwd(), 'app/admin/page.tsx'), 'utf8');

  it('loads every interview attempt regardless of pass/fail outcome', () => {
    expect(api).toContain("from('interview_attempts')");
    expect(api).not.toContain(".eq('status', 'passed')");
    expect(api).not.toContain(".eq('status', 'failed')");
    expect(api).toContain('question_snapshot,answers,status,score,total_questions,pass_percent,percent');
  });

  it('joins assessment records to the candidate record for staff review', () => {
    expect(api).toContain("from('recruitment_applications')");
    expect(api).toContain('full_name,email,role_applied,status');
    expect(api).toContain('application: applications.get(attempt.application_id)');
  });

  it('renders question snapshots and candidate answers for both rounds', () => {
    expect(page).toContain('All recruitment assessments');
    expect(page).toContain('including failed assessments');
    expect(page).toContain('View questions & answers');
    expect(page).toContain('Candidate answer');
    expect(page).toContain('Correct answer');
    expect(page).toContain('Round 2 recruiter review');
  });

  it('makes the complete assessment review discoverable from the recruiter workspace', () => {
    expect(adminPage).toContain('href="/admin/assessments"');
    expect(adminPage).toContain('Assessment review');
  });
});
