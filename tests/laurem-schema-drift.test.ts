import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readinessApi = readFileSync(resolve(process.cwd(), 'app/api/admin/onboarding/readiness/route.ts'), 'utf8');
const evidenceLib = readFileSync(resolve(process.cwd(), 'lib/laurem-evidence.ts'), 'utf8');
const documentApi = readFileSync(resolve(process.cwd(), 'app/api/admin/documents/route.ts'), 'utf8');

describe('Conags schema drift guards', () => {
  it('does not query evidence review expires_at because the CONAGS table has no such column', () => {
    expect(readinessApi).not.toContain('evidence_type,status,expires_at');
    expect(evidenceLib).not.toContain('metadata,expires_at,created_at');
  });

  it('passes only arguments supported by laurem_record_evidence_review', () => {
    expect(documentApi).toContain('p_application_id');
    expect(documentApi).toContain('p_evidence_type');
    expect(documentApi).toContain('p_document_id');
    expect(documentApi).toContain('p_status');
    expect(documentApi).toContain('p_actor');
    expect(documentApi).toContain('p_note');
    expect(documentApi).toContain('p_metadata');
    expect(documentApi).not.toContain('p_expires_at');
    expect(documentApi).not.toContain('p_readiness_item_key');
  });
});
