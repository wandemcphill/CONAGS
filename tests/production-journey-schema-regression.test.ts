import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260911_production_recruitment_journey_hardening.sql'),
  'utf8',
);

describe('production recruitment journey schema guards', () => {
  it('does not reference the nonexistent living_in_ireland application column', () => {
    expect(migration).not.toContain('living_in_ireland');
  });

  it('requires Round 2 completion before Offer', () => {
    expect(migration).toContain("if p_to_status='Offer'");
    expect(migration).toContain("a.round=2 and a.status='submitted'");
    expect(migration).toContain('Round 2 must be completed before Offer.');
  });

  it('prevents Documents from bypassing Offer into Onboarding', () => {
    expect(migration).toContain("app_row.status='Documents' and p_to_status in('Sponsorship','Offer','Rejected','Withdrawn')");
    expect(migration).not.toContain("app_row.status='Documents' and p_to_status in('Sponsorship','Offer','Onboarding','Rejected','Withdrawn')");
  });

  it('treats approved evidence as authoritative onboarding readiness', () => {
    expect(migration).toContain('laurem_recruitment_evidence_reviews');
    expect(migration).toContain("r.status in('approved','waived')");
    expect(migration).toContain("c.item_key='identity_verified'");
    expect(migration).toContain("c.item_key='qualification_evidence_verified'");
    expect(migration).toContain("c.item_key='references_verified'");
    expect(migration).toContain("c.item_key='right_to_work_verified'");
  });
});
