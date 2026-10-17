export type VisaHelpMilestoneType =
  | 'assessment'
  | 'support_review'
  | 'documents'
  | 'cos'
  | 'application'
  | 'identity'
  | 'decision'
  | 'post_decision';

export type VisaHelpMilestoneTemplate = {
  milestone_type: VisaHelpMilestoneType;
  title: string;
  position: number;
};

export function visaHelpMilestoneTemplates(): VisaHelpMilestoneTemplate[] {
  return [
    { milestone_type:'assessment', title:'Route assessment', position:10 },
    { milestone_type:'support_review', title:'CONAGS legal/support review', position:20 },
    { milestone_type:'documents', title:'Required evidence complete', position:30 },
    { milestone_type:'cos', title:'Certificate of Sponsorship', position:40 },
    { milestone_type:'application', title:'Visa application submitted', position:50 },
    { milestone_type:'identity', title:'Identity / biometrics completed', position:60 },
    { milestone_type:'decision', title:'UKVI decision window', position:70 },
    { milestone_type:'post_decision', title:'Post-decision status and right-to-work check', position:80 },
  ];
}

export function calculateVisaDecisionDueAt(input: {
  submittedAt?: string | null;
  outsideUk: boolean;
  processingWeeks?: number | null;
}) {
  if (!input.submittedAt) return null;
  const submitted = new Date(input.submittedAt);
  if (Number.isNaN(submitted.getTime())) return null;
  const weeks = Number(input.processingWeeks || (input.outsideUk ? 3 : 8));
  const safeWeeks = weeks > 0 && weeks <= 24 ? weeks : (input.outsideUk ? 3 : 8);
  return new Date(submitted.getTime() + safeWeeks * 7 * 24 * 60 * 60 * 1000).toISOString();
}

export function defaultVisaHelpMilestoneStatus(input: {
  milestoneType: VisaHelpMilestoneType;
  recommendationDecision?: 'provisional' | 'requires_legal_review' | 'not_switchable' | null;
  legalTeamRequested?: boolean;
  caseStatus?: string | null;
  submittedAt?: string | null;
}) {
  const requiresReview = Boolean(input.legalTeamRequested) || input.recommendationDecision !== 'provisional';
  if (input.milestoneType === 'assessment') return input.recommendationDecision ? 'completed' : 'in_progress';
  if (input.milestoneType === 'support_review') return requiresReview ? (input.caseStatus === 'closed' ? 'completed' : 'in_progress') : 'skipped';
  if (input.milestoneType === 'application') return ['submitted','closed'].includes(String(input.caseStatus || '')) ? 'completed' : 'pending';
  if (input.milestoneType === 'decision') return input.submittedAt ? 'in_progress' : 'pending';
  if (input.milestoneType === 'post_decision') return input.caseStatus === 'closed' ? 'in_progress' : 'pending';
  return 'pending';
}


export function buildInitialVisaHelpMilestones(input: {
  staffId: string;
  caseId: string;
  recommendationDecision?: 'provisional' | 'requires_legal_review' | 'not_switchable' | null;
  legalTeamRequested?: boolean;
  caseStatus?: string | null;
  submittedAt?: string | null;
  outsideUk: boolean;
}) {
  const dueAt = calculateVisaDecisionDueAt({ submittedAt: input.submittedAt, outsideUk: input.outsideUk });
  return visaHelpMilestoneTemplates().map(template => ({
    visa_help_case_id: input.caseId,
    staff_id: input.staffId,
    milestone_type: template.milestone_type,
    title: template.title,
    status: defaultVisaHelpMilestoneStatus({
      milestoneType: template.milestone_type,
      recommendationDecision: input.recommendationDecision,
      legalTeamRequested: input.legalTeamRequested,
      caseStatus: input.caseStatus,
      submittedAt: input.submittedAt,
    }),
    due_at: template.milestone_type === 'decision' ? dueAt : null,
    position: template.position,
  }));
}
