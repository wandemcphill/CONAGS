import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS evidence API contract', () => {
  const route = readFileSync(resolve(process.cwd(), 'app/api/admin/evidence/route.ts'), 'utf8');
  const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260909_shared_supabase_isolation.sql'), 'utf8');

  it('calls the deployed evidence RPC with its actual seven-argument signature', () => {
    expect(route).toContain('p_application_id: applicationId');
    expect(route).toContain('p_evidence_type: evidenceType');
    expect(route).toContain('p_document_id: documentId');
    expect(route).toContain('p_status: status');
    expect(route).toContain('p_actor: session.email');
    expect(route).toContain('p_note: note || null');
    expect(route).toContain('p_metadata: typeof body?.metadata === \'object\' && body.metadata !== null ? body.metadata : {}');
    expect(route).not.toContain('p_readiness_item_key');
    expect(route).not.toContain('p_expires_at');
  });

  it('matches the CONAGS evidence-review schema rather than the historical shared schema', () => {
    const match = migration.match(/create table if not exists public\.laurem_recruitment_evidence_reviews \(([\s\S]*?)\n\);/i);
    expect(match?.[1]).toBeTruthy();
    expect(match?.[1]).not.toContain('expires_at');
  });
});
