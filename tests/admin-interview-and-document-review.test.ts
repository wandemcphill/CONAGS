import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CONAGS recruiter interview and document review', () => {
  const api = readFileSync(resolve(process.cwd(), 'app/api/admin/applications/[id]/route.ts'), 'utf8');
  const page = readFileSync(resolve(process.cwd(), 'app/admin/applications/[id]/page.tsx'), 'utf8');
  const reissue = readFileSync(resolve(process.cwd(), 'app/api/admin/document-packs/reissue/route.ts'), 'utf8');

  it('returns question snapshots and answers for both assessment rounds', () => {
    expect(api).toContain('question_snapshot,answers');
    expect(api).toContain("from('interview_attempts')");
    expect(page).toContain('Assessment review');
    expect(page).toContain('assessment.question_snapshot');
    expect(page).toContain('assessment.answers');
  });

  it('shows recorded Round 1 scoring without inventing a Round 2 score', () => {
    expect(page).toContain('Score:');
    expect(page).toContain('Correct');
    expect(page).toContain('Incorrect');
    expect(page).toContain('Round 2 is not automatically scored');
    expect(page).toContain('No score is being invented here.');
  });

  it('reissues only the current Job Description and Handbook pack after an accepted contract', () => {
    expect(reissue).toContain("contract.status !== 'accepted'");
    expect(reissue).toContain("getLauremRecruitmentDocumentPack");
    expect(reissue).toContain("laurem_issue_candidate_document_pack");
    expect(reissue).toContain("candidate_document_pack_reissued");
    expect(reissue).toContain('previously accepted employment contract remains the accepted contract record');
  });
});
