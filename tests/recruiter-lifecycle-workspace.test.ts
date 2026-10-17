import { describe, expect, it } from 'vitest';
import { buildRecruiterLifecycleWorkspace } from '@/lib/laurem-recruiter-workspace';

describe('CONAGS recruiter lifecycle workspace', () => {
  it('exposes the contract/readiness/staff gates and employment actions', () => {
    const workspace = buildRecruiterLifecycleWorkspace({
      status: 'Offer', contractAccepted: false, contractRoleMatches: false, requiredReadinessOpen: 2,
      staffExists: false, staffContractBound: false,
    });
    expect(workspace.phase).toBe('Offer and contract');
    expect(workspace.gates.contract).toBe('blocked');
    expect(workspace.gates.readiness).toBe('blocked');
    expect(workspace.gates.staff).toBe('not_started');
    expect(workspace.blockers.map((item) => item.code)).toEqual(['CONTRACT_REQUIRED', 'READINESS_INCOMPLETE']);
    expect(workspace.actions.map((item) => item.key)).toEqual(['prepare_contract', 'open_readiness']);
  });

  it('exposes Hired portal progression only when the canonical policy permits it', () => {
    const workspace = buildRecruiterLifecycleWorkspace({
      status: 'Hired', contractAccepted: true, contractRoleMatches: true, requiredReadinessOpen: 0,
      staffExists: true, staffContractBound: true, staffStatus: 'pending', lifecycle: { portalProvision: { ok: true } },
    });
    expect(workspace.gates.portal).toBe('not_started');
    expect(workspace.actions.map((item) => item.key)).toContain('portal_provision');
  });

  it('keeps terminal states explicit instead of inventing a normal next step', () => {
    const workspace = buildRecruiterLifecycleWorkspace({
      status: 'Rejected', contractAccepted: false, contractRoleMatches: false, requiredReadinessOpen: 0,
      staffExists: false, staffContractBound: false,
    });
    expect(workspace.actions.map((item) => item.key)).toContain('terminal_review');
    expect(workspace.actions.map((item) => item.key)).not.toContain('prepare_onboarding');
  });
  it('does not offer onboarding preparation before contract and readiness gates are cleared', () => {
    const workspace = buildRecruiterLifecycleWorkspace({
      status: 'Offer',
      contractAccepted: true,
      contractRoleMatches: true,
      requiredReadinessOpen: 1,
      staffExists: false,
      staffContractBound: false,
    });
    expect(workspace.actions.map((item) => item.key)).toEqual(['open_readiness']);
  });
});
