import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('candidate contract decline lifecycle', () => {
  it('ends the application on Rejected and does not continue into Documents', () => {
    const route = readFileSync('app/api/contracts/accept/route.ts', 'utf8');
    const declineIndex = route.indexOf("if (action === 'decline')");
    const rejectionIndex = route.indexOf("p_to_status: 'Rejected'", declineIndex);
    const declineReturnIndex = route.indexOf("return NextResponse.json({ ok: true, status: 'declined' });", rejectionIndex);
    const onboardingIndex = route.indexOf("p_to_status: 'Onboarding'", declineReturnIndex);

    expect(declineIndex).toBeGreaterThan(-1);
    expect(rejectionIndex).toBeGreaterThan(declineIndex);
    expect(declineReturnIndex).toBeGreaterThan(rejectionIndex);
    // Decline terminates before the acceptance-only onboarding transition.
    expect(onboardingIndex).toBeGreaterThan(declineReturnIndex);
    expect(route).not.toContain("p_to_status: 'Documents'");
  });
});
