import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS recruitment lifecycle integrity', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260910_laurem_application_lifecycle_integrity.sql'),
    'utf8',
  );
  const applicationRoute = readFileSync(resolve(process.cwd(), 'app/api/applications/route.ts'), 'utf8');
  const secondInterviewRoute = readFileSync(resolve(process.cwd(), 'app/api/admin/second-interviews/route.ts'), 'utf8');

  it('moves submitted applications into the recruiter Application stage', () => {
    expect(migration).toContain("set status = 'Application'");
    expect(migration).toContain("alter column status set default 'Application'");
    expect(migration).toContain("status = 'Submitted'");
  });

  it('requires an explicit application pathway', () => {
    expect(applicationRoute).toContain('Please choose your application pathway.');
    expect(applicationRoute).toContain("payload.pathway === 'uk' || payload.pathway === 'international'");
    expect(migration).toContain('PATHWAY_REQUIRED');
    expect(migration).toContain("payload_pathway not in ('uk', 'international')");
  });

  it('requires a completed first assessment before Second Interview', () => {
    expect(migration).toContain("app_row.status='Interview'");
    expect(migration).toContain("i.status = 'Completed'");
    expect(migration).toContain('first_interview_not_completed');
    expect(secondInterviewRoute).toContain('The candidate must pass the first assessment before a second-stage invitation can be issued.');
    expect(secondInterviewRoute).toContain("eq('round',1)");
    expect(secondInterviewRoute).toContain("attempt.status!=='passed'");
  });

  it('supports every canonical CONAGS role rather than a nurse-only second stage', () => {
    expect(secondInterviewRoute).toContain('normalizeLauremRole(app.role_applied||\'\')');
    expect(secondInterviewRoute).not.toContain("toLowerCase()!=='registered nurse'");
    expect(secondInterviewRoute).toContain('selectRound2Questions(role)');
  });
});
