export type RecruiterLifecyclePolicy = {
  ok: boolean;
  code?: string;
  reason?: string;
  repair_action?: string;
  staff_status?: string | null;
  application_status?: string;
};

export type RecruiterLifecycleWorkspace = {
  phase: string;
  phaseDescription: string;
  blockers: Array<{ code: string; title: string; detail: string }>;
  actions: Array<{ key: string; label: string; description: string }>;
  gates: {
    contract: 'ready' | 'blocked' | 'not_started';
    readiness: 'ready' | 'blocked' | 'not_started';
    staff: 'ready' | 'blocked' | 'not_started';
    portal: 'ready' | 'blocked' | 'not_started';
  };
};

type Input = {
  status: string;
  contractAccepted: boolean;
  contractRoleMatches: boolean;
  requiredReadinessOpen: number;
  staffExists: boolean;
  staffContractBound: boolean;
  staffStatus?: string | null;
  staffActivatedAt?: string | null;
  round1Status?: string | null;
  activeSecondInvitation?: boolean;
  scheduledInterviewCount?: number;
  lifecycle?: Partial<Record<'prepareOnboarding' | 'markHired' | 'portalProvision' | 'portalActivate', RecruiterLifecyclePolicy | null>>;
};

function pushUnique(target: RecruiterLifecycleWorkspace['blockers'], code: string, title: string, detail: string) {
  if (!target.some((item) => item.code === code)) target.push({ code, title, detail });
}

export function buildRecruiterLifecycleWorkspace(input: Input): RecruiterLifecycleWorkspace {
  const blockers: RecruiterLifecycleWorkspace['blockers'] = [];
  const actions: RecruiterLifecycleWorkspace['actions'] = [];
  const criticalEmploymentStage = ['Offer', 'Onboarding', 'Hired'].includes(input.status);

  if (criticalEmploymentStage && !input.contractAccepted) {
    pushUnique(blockers, 'CONTRACT_REQUIRED', 'Accepted contract required', 'The candidate cannot enter onboarding or employment conversion until an accepted contract is present.');
  } else if (criticalEmploymentStage && !input.contractRoleMatches) {
    pushUnique(blockers, 'CONTRACT_ROLE_MISMATCH', 'Contract role mismatch', 'The accepted contract must match the candidate’s canonical applied role.');
  }

  if (criticalEmploymentStage && input.requiredReadinessOpen > 0) {
    pushUnique(blockers, 'READINESS_INCOMPLETE', 'Readiness is incomplete', input.requiredReadinessOpen + ' required readiness item' + (input.requiredReadinessOpen === 1 ? '' : 's') + ' remain open.');
  }

  if (['Onboarding', 'Hired'].includes(input.status) && !input.staffExists) {
    pushUnique(blockers, 'STAFF_REQUIRED', 'Workforce identity missing', 'Prepare the staff record through the gated onboarding action before continuing employment conversion.');
  } else if (['Onboarding', 'Hired'].includes(input.status) && input.staffExists && !input.staffContractBound) {
    pushUnique(blockers, 'STAFF_CONTRACT_BINDING_REQUIRED', 'Staff contract binding required', 'The workforce identity must remain bound to the accepted contract.');
  }

  if (input.status === 'Hired' && input.staffExists && !input.staffActivatedAt && input.lifecycle?.portalProvision && !input.lifecycle.portalProvision.ok) {
    pushUnique(blockers, input.lifecycle.portalProvision.code || 'PORTAL_POLICY_BLOCKED', 'Portal provisioning blocked', input.lifecycle.portalProvision.reason || 'The canonical portal lifecycle policy is blocking provisioning.');
  }

  const phaseMap: Record<string, [string, string]> = {
    Enquiry: ['Enquiry', 'Initial recruiter outreach and invitation.'],
    Invited: ['Invitation sent', 'Candidate access has been issued and the application is awaiting submission.'],
    Application: ['Application submitted', 'The application is ready for recruiter screening.'],
    Screening: ['Screening', 'Candidate screening and first-stage assessment are being completed.'],
    Interview: ['Interview', 'First interview and assessment review are in progress.'],
    'Second Interview': ['Second stage', 'Second-stage assessment/interview is in progress.'],
    Documents: ['Evidence collection', 'Recruitment evidence and required documents are being reviewed.'],
    Sponsorship: ['Sponsorship', 'The candidate is in sponsorship/work-permission processing.'],
    Offer: ['Offer and contract', 'Contract, readiness and onboarding conversion are the next employment gates.'],
    Onboarding: ['Onboarding', 'Workforce identity and onboarding completion are being prepared for employment.'],
    Hired: ['Hired', 'Employment conversion is complete and the portal lifecycle can continue.'],
    Rejected: ['Rejected', 'This application is in a terminal state.'],
    Withdrawn: ['Withdrawn', 'This application is in a terminal state.'],
  };
  const phase = phaseMap[input.status]?.[0] || 'Unknown state';
  const phaseDescription = phaseMap[input.status]?.[1] || 'The application state is not recognised by the canonical recruiter workspace.';

  if (input.status === 'Application') actions.push({ key: 'advance_screening', label: 'Move to screening', description: 'Start the recruiter screening stage.' });
  if (input.status === 'Interview' && !input.scheduledInterviewCount) actions.push({ key: 'schedule_interview', label: 'Schedule first interview', description: 'Create the interview slot and send the candidate the meeting details.' });
  if (input.status === 'Interview' && input.round1Status === 'passed' && !input.activeSecondInvitation) actions.push({ key: 'issue_second_stage', label: 'Issue second stage', description: 'Send the second-stage assessment after the passed first assessment.' });
  if (criticalEmploymentStage && !input.contractAccepted) actions.push({ key: 'prepare_contract', label: 'Prepare contract', description: 'Open the contract composer for this candidate.' });
  if (criticalEmploymentStage && input.requiredReadinessOpen > 0) actions.push({ key: 'open_readiness', label: 'Open readiness gate', description: 'Review and complete or appropriately waive the outstanding readiness items.' });
  if (['Offer', 'Onboarding', 'Hired'].includes(input.status) && input.contractAccepted && input.contractRoleMatches && input.requiredReadinessOpen === 0 && !input.staffExists) actions.push({ key: 'prepare_onboarding', label: 'Prepare onboarding', description: 'Create or repair the workforce identity and onboarding package.' });
  if (input.status === 'Onboarding' && input.lifecycle?.markHired?.ok) actions.push({ key: 'mark_hired', label: 'Mark Hired', description: 'Move the candidate to Hired now that the canonical employment gates are satisfied.' });
  if (input.status === 'Hired' && input.lifecycle?.portalProvision?.ok) actions.push({ key: 'portal_provision', label: 'Provision staff portal', description: 'Issue the one-time staff portal activation credential.' });
  if (input.status === 'Hired' && input.staffExists && input.staffStatus === 'active') actions.push({ key: 'open_staff', label: 'Open Staff 360', description: 'Continue into workforce operations for this employee.' });
  if (input.status === 'Rejected' || input.status === 'Withdrawn') actions.push({ key: 'terminal_review', label: 'Review terminal state', description: 'Re-entry requires an explicit admin override reason and canonical lifecycle gates.' });

  return {
    phase,
    phaseDescription,
    blockers,
    actions,
    gates: {
      contract: !criticalEmploymentStage ? 'not_started' : input.contractAccepted && input.contractRoleMatches ? 'ready' : 'blocked',
      readiness: !criticalEmploymentStage ? 'not_started' : input.requiredReadinessOpen === 0 ? 'ready' : 'blocked',
      staff: input.staffExists ? (input.staffContractBound ? 'ready' : 'blocked') : 'not_started',
      portal: input.staffActivatedAt ? 'ready' : (input.status === 'Hired' ? (input.lifecycle?.portalProvision?.ok ? 'not_started' : 'blocked') : 'not_started'),
    },
  };
}
