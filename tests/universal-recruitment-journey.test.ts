import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const jobs = readFileSync(resolve(process.cwd(), 'lib/laurem-jobs.ts'), 'utf8');
const secondApi = readFileSync(resolve(process.cwd(), 'app/api/admin/second-interviews/route.ts'), 'utf8');
const round2Api = readFileSync(resolve(process.cwd(), 'app/api/second-interview/route.ts'), 'utf8');
const contractApi = readFileSync(resolve(process.cwd(), 'app/api/admin/contracts/route.ts'), 'utf8');
const contractAccept = readFileSync(resolve(process.cwd(), 'app/api/contracts/accept/route.ts'), 'utf8');
const standardContractPage = readFileSync(resolve(process.cwd(), 'app/admin/applications/[id]/contract/standard/page.tsx'), 'utf8');

const canonicalRoles = ['Healthcare Assistant','Support Worker','Senior Support Worker','Registered Nurse','Physiotherapist'];

describe('universal recruitment journey', () => {
  it('publishes exactly the five canonical roles', () => {
    for (const role of canonicalRoles) expect(jobs).toContain(`title: '${role}'`);
    expect(jobs).not.toContain("title: 'Care Worker'");
  });

  it('issues second stage from a passed Round 1 assessment without a nurse-only gate', () => {
    expect(secondApi).toContain("attempt.status!=='passed'");
    expect(secondApi).toContain("/second-interview/${token}");
    expect(secondApi).not.toContain("role_applied === 'Registered Nurse'");
    expect(round2Api).toContain("eq('second_interview_id',invite.id)");
  });

  it('supports standard and international contract generation through one CONAGS workflow', () => {
    expect(contractApi).toContain("contract_type: internationalNurse ? 'international_nurse' : 'standard'");
    expect(contractApi).toContain('renderLauremContract');
    expect(contractApi).toContain('renderLauremInternationalNurseContract');
    expect(standardContractPage).toContain('unified CONAGS contract workflow');
  });

  it('prevents candidate access to an unissued contract', () => {
    expect(contractAccept).toContain("!['issued', 'viewed'].includes(String(contract.status))");
    expect(contractAccept).toContain('not yet available for candidate review');
  });
});
