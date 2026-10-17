import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Round 1 lifecycle handoff', () => {
  it('uses the canonical lifecycle transition when Interview 1 is first opened', () => {
    const route = readFileSync('app/api/interview/route.ts', 'utf8');
    expect(route).toContain("client.rpc('laurem_transition_application_status'");
    expect(route).toContain("p_to_status: 'Interview'");
    expect(route).toContain("p_actor: 'candidate.interview1.open'");
    expect(route).not.toContain("recruitment_applications').update({status:'Interview'");
  });
});
