import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONAGS contract draft issuance flow', () => {
  it('exposes the saved contract id and status so the issue action can render', () => {
    const route = readFileSync('app/api/admin/contracts/route.ts', 'utf8');
    const page = readFileSync('app/admin/applications/[id]/contract/page.tsx', 'utf8');

    expect(route).toContain('id: contract.id');
    expect(route).toContain('status: contract.status');
    expect(route).toContain("if (body?.status !== 'issued')");
    expect(route).toContain('laurem_issue_recruitment_contract_with_token');
    expect(route).toContain('laurem_issue_candidate_document_pack');

    expect(page).toContain("fetch('/api/admin/contracts?applicationId='+encodeURIComponent(id)");
    expect(page).toContain("result.status==='draft'");
    expect(page).toContain('Issue complete offer package and email candidate');
  });
});
