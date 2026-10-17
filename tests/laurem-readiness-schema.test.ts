import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS readiness schema alignment', () => {
  const source = readFileSync(resolve(process.cwd(), 'lib/laurem-onboarding-readiness.ts'), 'utf8');
  const isolationMigration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260909_shared_supabase_isolation.sql'),
    'utf8',
  );

  it('does not select an evidence-review column that the CONAGS schema does not define', () => {
    expect(source).not.toContain('metadata,expires_at,created_at,updated_at');
    expect(source).not.toContain('review.expires_at');
    const match = isolationMigration.match(/create table if not exists public\.laurem_recruitment_evidence_reviews \(([\s\S]*?)\n\);/i);
    expect(match?.[1]).toBeTruthy();
    expect(match?.[1]).not.toContain('expires_at');
  });

  it('continues to use evidence review status as the readiness authority', () => {
    expect(source).toContain("review.status === 'approved' ? 'completed' : review.status === 'waived' ? 'waived' : 'pending'");
    expect(source).toContain('Evidence review ${override.reviewId} is authoritative for this readiness item.');
  });


  it('keeps candidate document post-sign onboarding lookups aligned with the CONAGS application schema', () => {
    const candidateRoute = readFileSync(resolve(process.cwd(), 'app/api/candidate-documents/route.ts'), 'utf8');
    expect(candidateRoute).not.toContain('start_date,nmc_number,application_data,status');
    expect(candidateRoute).not.toContain('application.nmc_number');
    expect(candidateRoute).toContain("typeof applicationData.nmc_number === 'string'");
    expect(candidateRoute).toContain("status', 'accepted'");
    expect(candidateRoute).toContain('waitingForContract');
  });
});