import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909_evidence_lifecycle.sql'),
  'utf8',
);
const authorityMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910_evidence_authority.sql'),
  'utf8',
);

describe('recruitment evidence persistence contract', () => {
  it('records review state, reviewer metadata and expiry', () => {
    expect(baseMigration).toContain("status text not null check (status in ('pending','approved','rejected','waived','expired','superseded'))");
    expect(baseMigration).toContain('reviewed_by text');
    expect(baseMigration).toContain('reviewed_at timestamptz');
    expect(authorityMigration).toContain('add column if not exists expires_at timestamptz');
  });

  it('preserves history and consolidates review plus readiness synchronization', () => {
    expect(baseMigration).toContain('create table if not exists recruitment_evidence_audit');
    expect(baseMigration).toContain('previous_status text');
    expect(baseMigration).toContain('new_status text');
    expect(authorityMigration).toContain('p_readiness_item_key text default null');
    expect(authorityMigration).toContain('update recruitment_onboarding_checklist');
  });

  it('supersedes the active decision before inserting a replacement', () => {
    const supersede = authorityMigration.indexOf("set status = 'superseded'");
    const insert = authorityMigration.indexOf('insert into recruitment_evidence_reviews');
    expect(supersede).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(supersede);
  });

  it('tracks candidate document replacement without deleting prior evidence', () => {
    expect(authorityMigration).toContain('superseded_at = now()');
    expect(authorityMigration).toContain('superseded_by = new.id');
    expect(authorityMigration).toContain('trg_candidate_document_replacement');
  });

  it('removes the earlier overloaded evidence function signature', () => {
    expect(authorityMigration).toContain('drop function if exists laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb)');
    expect(authorityMigration).toContain('grant execute on function laurem_record_evidence_review(uuid,text,uuid,text,text,text,jsonb,text,timestamptz) to service_role');
  });
});
