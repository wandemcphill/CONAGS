import { lauremHandbookConfig, type LauremHandbookAudience } from '@/lib/laurem-handbook-config';

export type OnboardingTaskSeed = {
  task_key: string;
  category: string;
  title: string;
  description: string;
  required: boolean;
  document_path?: string;
  acknowledgement_required: boolean;
  sort_order: number;
};

export function inferLauremOnboardingAudience(role: string, livingInUk?: string | null): LauremHandbookAudience | 'standard_staff' {
  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole.includes('registered nurse') && livingInUk === 'No') return 'international_nurse';
  if (normalizedRole.includes('healthcare assistant')) return 'sponsored_hca';
  return 'standard_staff';
}

function commonTasks(): OnboardingTaskSeed[] {
  return [
    { task_key: 'identity_and_rtw', category: 'Compliance', title: 'Identity and right-to-work verified', description: 'Complete and record the legally required identity and right-to-work verification.', required: true, acknowledgement_required: false, sort_order: 20 },
    { task_key: 'safeguarding', category: 'Training', title: 'Safeguarding induction', description: 'Complete Conags safeguarding induction and confirm understanding of escalation routes.', required: true, acknowledgement_required: true, sort_order: 30 },
    { task_key: 'mandatory_training', category: 'Training', title: 'Mandatory training plan completed', description: 'Complete the role-specific mandatory training programme and record certificates.', required: true, acknowledgement_required: true, sort_order: 40 },
    { task_key: 'workforce_platform', category: 'Workforce', title: 'Workforce platform orientation', description: 'Complete orientation to rota, attendance, assignments, timesheets and staff communications.', required: true, acknowledgement_required: true, sort_order: 50 },
    { task_key: 'emergency_contacts', category: 'Support', title: 'Emergency and support contacts confirmed', description: 'Confirm the employee knows the correct Conags emergency, safeguarding and management contacts.', required: true, acknowledgement_required: true, sort_order: 60 },
  ];
}

export function buildOnboardingTasks(audience: LauremHandbookAudience | 'standard_staff'): OnboardingTaskSeed[] {
  const tasks = commonTasks();
 
  if (audience === 'sponsored_hca') {
    tasks.push(
      { task_key: 'pvG_or_disclosure', category: 'Compliance', title: 'PVG or applicable disclosure status recorded', description: 'Confirm the applicable Scottish disclosure/PVG requirement and record the status before regulated work.', required: true, acknowledgement_required: false, sort_order: 70 },
      { task_key: 'role_competency', category: 'Clinical', title: 'Healthcare Assistant competency sign-off', description: 'Complete role-specific competency and supervised practice sign-off before unsupervised duties where required.', required: true, acknowledgement_required: true, sort_order: 80 },
    );
  }

  if (audience === 'international_nurse') {
    tasks.push(
      { task_key: 'uk_welcome_package', category: 'Welcome', title: 'Overseas Nurse UK Welcome Package', description: 'Complete the personalised Scotland/UK welcome and settlement package, including pre-arrival, arrival and first-30-days guidance.', required: true, document_path: lauremHandbookConfig.internationalNurse.welcomePackagePath, acknowledgement_required: true, sort_order: 70 },
      { task_key: 'sponsorship_information', category: 'Immigration', title: 'Sponsorship information acknowledged', description: 'Confirm the worker has received the role-specific sponsorship and immigration information supplied by Conags.', required: true, acknowledgement_required: true, sort_order: 80 },
      { task_key: 'nmc_pathway', category: 'Professional', title: 'NMC registration action plan confirmed', description: 'Record the current NMC registration stage, outstanding actions and named Conags support contact.', required: true, acknowledgement_required: true, sort_order: 90 },
      { task_key: 'arrival_settlement', category: 'Welcome', title: 'Arrival and settlement checks completed', description: 'Confirm accommodation, local orientation, payroll, banking, healthcare and emergency arrangements.', required: true, acknowledgement_required: false, sort_order: 100 },
      { task_key: 'clinical_induction', category: 'Clinical', title: 'Scottish clinical induction completed', description: 'Complete local clinical governance, documentation, escalation, safeguarding, medicines and infection-control induction.', required: true, acknowledgement_required: true, sort_order: 110 },
      { task_key: 'buddy_mentor', category: 'Support', title: 'Buddy or mentor introduced', description: 'Record the named buddy or mentor and first support check-in.', required: true, acknowledgement_required: false, sort_order: 120 },
      { task_key: 'nmc_registration_confirmation', category: 'Professional', title: 'NMC registration confirmed', description: 'Record the NMC PIN and verify that the employee is authorised to practise in the registered nurse role before full registered deployment.', required: true, acknowledgement_required: false, sort_order: 130 },
    );
  }

  return tasks;
}

export function calculateOnboardingStatus(tasks: Array<{ status: string; required: boolean; acknowledgement_required?: boolean; acknowledged_at?: string | null }>): 'pending' | 'in_progress' | 'complete' {
  const required = tasks.filter((task) => task.required);
  if (required.length === 0) return 'complete';
  const fullyComplete = required.every((task) =>
    (task.status === 'completed' || task.status === 'waived') &&
    (!task.acknowledgement_required || Boolean(task.acknowledged_at)),
  );
  if (fullyComplete) return 'complete';
  const hasProgress = required.some((task) => task.status === 'completed' || task.status === 'waived' || Boolean(task.acknowledged_at));
  return hasProgress ? 'in_progress' : 'pending';
}
