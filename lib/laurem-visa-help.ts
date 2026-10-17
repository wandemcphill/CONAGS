import { getLauremSponsorshipOccupation } from '@/lib/laurem-sponsorship-occupation';

export const VISA_HELP_STATUSES = [
  'draft',
  'triaged',
  'awaiting_staff',
  'legal_review',
  'awaiting_documents',
  'ready_for_submission',
  'submitted',
  'closed',
] as const;
export type VisaHelpStatus = (typeof VISA_HELP_STATUSES)[number];

export type VisaHelpRecommendation = {
  route:
    | 'health_and_care_worker'
    | 'skilled_worker'
    | 'outside_uk_skilled_worker'
    | 'legal_review_required'
    | 'not_switchable_from_current_permission';
  title: string;
  decision: 'provisional' | 'requires_legal_review' | 'not_switchable';
  reason: string;
  dependantPosition: 'generally_permitted' | 'restricted' | 'separate_assessment';
  conditions: string[];
  blockedReasons: string[];
  sourceUrls: string[];
};

const BLOCKED_SWITCH_TYPES = new Set([
  'Standard Visitor visa',
  'Short-term study visa',
  'Seasonal Worker visa',
  'Domestic worker in a private household visa',
  'Parent of a Child Student visa',
  'Immigration bail',
  'No current UK immigration permission',
]);

function lower(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function getVisaHelpRules(role: string | null | undefined) {
  const occupation = getLauremSponsorshipOccupation(role);
  const code = occupation?.code || '';
  const roleLower = lower(role);
  const isNurse = code === '2237' || roleLower.includes('nurse');
  const isCareRole = ['6135', '6136'].includes(code);
  const isNursingAssistant = code === '6131';
  const needsThreeMonths = ['6131', '6135', '6136'].includes(code);

  return {
    occupation,
    code,
    isNurse,
    isCareRole,
    isNursingAssistant,
    needsThreeMonths,
  };
}

export function recommendVisaHelp(input: {
  role: string;
  livingInUk: boolean;
  currentVisaType?: string | null;
  currentVisaEndDate?: string | null;
  studentCourseFinished?: boolean | null;
  jobStartsAfterCourse?: boolean | null;
  phdStudy24Months?: boolean | null;
  monthsWorkingForLaurem?: number | null;
  wantsDependants?: boolean | null;
  dependantsInsideUk?: boolean | null;
}) : VisaHelpRecommendation {
  const {
    occupation,
    isNurse,
    isCareRole,
    isNursingAssistant,
    needsThreeMonths,
  } = getVisaHelpRules(input.role);

  const currentVisa = String(input.currentVisaType || '').trim();

  if (!occupation) {
    return {
      route: 'legal_review_required',
      title: 'Sponsored occupation needs review',
      decision: 'requires_legal_review',
      reason: 'CONAGS could not match the staff role to a configured sponsored occupation code. Confirm the actual sponsored duties and occupation code before selecting an immigration route.',
      dependantPosition: 'separate_assessment',
      conditions: ['Confirm the role, sponsored duties and occupation code with CONAGS before submission.'],
      blockedReasons: ['No configured sponsored occupation match for the recorded role.'],
      sourceUrls: ['https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations'],
    };
  }
  const student = currentVisa === 'Student visa';
  const prohibited = BLOCKED_SWITCH_TYPES.has(currentVisa);
  const expired = Boolean(input.currentVisaEndDate && input.currentVisaEndDate < new Date().toISOString().slice(0, 10));

  if (!input.livingInUk) {
    if (isCareRole) {
      return {
        route: 'legal_review_required',
        title: 'Overseas care-worker route is not open to new applications',
        decision: 'requires_legal_review',
        reason: 'Current UK guidance closed the Health and Care Worker route to new overseas applications for care workers and senior care workers from 22 July 2025. This case must not be routed into a new overseas care-worker application without a separate legal basis.',
        dependantPosition: 'restricted',
        conditions: [
          'Confirm whether the applicant has an exceptional or transitional basis that changes the route position.',
          'Do not issue a routine overseas care-worker visa instruction from this screen.',
          'Escalate the case to CONAGS legal/support review before sponsor-side immigration steps.'
        ],
        blockedReasons: ['SOC 6135/6136 care-worker route is closed to new overseas applications under current guidance.'],
        sourceUrls: [
          'https://www.gov.uk/government/publications/applying-for-health-and-social-care-jobs-in-the-uk-from-abroad/part-1-applying-for-health-and-social-care-jobs-in-the-uk-from-abroad',
          'https://www.gov.uk/health-care-worker-visa/your-job',
        ],
      };
    }

    const route = isNurse || isNursingAssistant
      ? 'health_and_care_worker'
      : 'outside_uk_skilled_worker';
    return {
      route,
      title: route === 'health_and_care_worker' ? 'Health and Care Worker visa' : 'Skilled Worker visa from outside the UK',
      decision: 'provisional',
      reason: 'The staff record indicates the applicant is outside the UK. CONAGS can complete sponsor-side preparation, while the applicant completes the relevant visa application from outside the UK.',
      dependantPosition: 'generally_permitted',
      conditions: [
        'A valid Certificate of Sponsorship is required.',
        'The occupation code used by CONAGS must match the actual sponsored duties.',
        'Identity, English-language and other documentary requirements depend on the route and applicant circumstances.',
      ],
      blockedReasons: [],
      sourceUrls: [
        'https://www.gov.uk/skilled-worker-visa/apply-from-outside-the-uk',
        'https://www.gov.uk/health-care-worker-visa',
      ],
    };
  }

  if (!currentVisa) {
    return {
      route: 'legal_review_required',
      title: 'Immigration route needs review',
      decision: 'requires_legal_review',
      reason: 'The applicant is in the UK but has not identified their current immigration permission. Do not select a switch route until the current permission is confirmed.',
      dependantPosition: 'separate_assessment',
      conditions: ['Upload or provide current UK immigration permission before legal review.'],
      blockedReasons: [],
      sourceUrls: ['https://www.gov.uk/skilled-worker-visa/switch-to-this-visa'],
    };
  }

  if (prohibited) {
    return {
      route: 'not_switchable_from_current_permission',
      title: 'Do not switch in-country on this permission',
      decision: 'not_switchable',
      reason: 'GOV.UK excludes this current permission from in-country switching to the Skilled Worker route. The application needs an outside-UK strategy or legal review.',
      dependantPosition: 'separate_assessment',
      conditions: ['Do not submit an in-country Skilled Worker switch on this current permission.'],
      blockedReasons: [`Current permission: ${currentVisa}`],
      sourceUrls: ['https://www.gov.uk/skilled-worker-visa/switch-to-this-visa'],
    };
  }

  if (expired) {
    return {
      route: 'legal_review_required',
      title: 'Current permission date requires immediate review',
      decision: 'requires_legal_review',
      reason: 'The current visa end date recorded in the case is before today. CONAGS should not make a routine switch recommendation until status and any application already lodged are checked.',
      dependantPosition: 'separate_assessment',
      conditions: ['Confirm current eVisa/status and whether an extension or application has already been submitted.'],
      blockedReasons: ['Recorded current visa end date has passed.'],
      sourceUrls: ['https://www.gov.uk/browse/visas-immigration'],
    };
  }

  if (student && !(input.studentCourseFinished || input.jobStartsAfterCourse || input.phdStudy24Months)) {
    return {
      route: 'legal_review_required',
      title: 'Student route conditions not yet satisfied',
      decision: 'requires_legal_review',
      reason: 'A Student visa holder can only switch under the Skilled Worker rules when the applicable course or work-start requirement is met, or the PhD exception applies.',
      dependantPosition: isCareRole ? 'restricted' : 'generally_permitted',
      conditions: [
        'Confirm course completion or that the sponsored job starts after the course finishes.',
        'For a PhD exception, confirm at least 24 months of full-time study where required.',
      ],
      blockedReasons: ['Student visa switching conditions have not been established.'],
      sourceUrls: ['https://www.gov.uk/skilled-worker-visa/switch-to-this-visa'],
    };
  }

  if (needsThreeMonths && Number(input.monthsWorkingForLaurem || 0) < 3) {
    return {
      route: 'legal_review_required',
      title: 'Three-month sponsor employment checkpoint',
      decision: 'requires_legal_review',
      reason: 'For the care and nursing-assistant occupation codes covered by the current Health and Care Worker guidance, switching from another UK visa requires at least 3 months of lawful work in the sponsored job for the sponsor.',
      dependantPosition: isCareRole ? 'restricted' : 'generally_permitted',
      conditions: [
        'Record the date lawful work for CONAGS started.',
        'Confirm at least 3 months have been completed before relying on this switch route.',
        'Keep the current visa valid and obtain legal review if the timing is close to expiry.',
      ],
      blockedReasons: ['Less than 3 months of lawful work for CONAGS is recorded.'],
      sourceUrls: ['https://www.gov.uk/health-care-worker-visa/your-job'],
    };
  }

  return {
    route: 'health_and_care_worker',
    title: 'Health and Care Worker visa',
    decision: 'provisional',
    reason: 'The applicant appears potentially switchable into the sponsored Health and Care Worker route, subject to the final occupation, salary, sponsor and personal eligibility checks.',
    dependantPosition: isCareRole ? 'restricted' : 'generally_permitted',
    conditions: [
      'A Certificate of Sponsorship and eligible sponsored job are required.',
      'English-language and documentary requirements must be satisfied or an accepted exemption must apply.',
      'Apply before current permission expires and follow the application instructions for identity and biometrics.',
    ],
    blockedReasons: [],
    sourceUrls: [
      'https://www.gov.uk/health-care-worker-visa',
      'https://www.gov.uk/skilled-worker-visa/documents-you-must-provide',
      'https://www.gov.uk/skilled-worker-visa/knowledge-of-english',
    ],
  };
}

export function buildVisaHelpDocumentChecklist(input: {
  role: string;
  route: VisaHelpRecommendation['route'];
  outsideUk: boolean;
  hasDependants: boolean;
}) {
  const rules = getVisaHelpRules(input.role);
  const checklist = [
    { key: 'passport', label: 'Valid passport or identity document', required: true },
    { key: 'current_immigration_status', label: 'Current UK immigration permission / eVisa evidence', required: !input.outsideUk },
    { key: 'cos', label: 'Certificate of Sponsorship reference', required: true },
    { key: 'english', label: 'Evidence of English or an applicable exemption', required: true },
    { key: 'employment', label: 'CONAGS employment contract / offer and job details', required: true },
    { key: 'occupation_code', label: 'Sponsored occupation code confirmation', required: true },
    { key: 'maintenance', label: 'Maintenance funds evidence or sponsor maintenance confirmation, where required', required: true },
    { key: 'travel_immigration_history', label: 'Relevant travel and UK immigration history', required: true },
    { key: 'criminal_record', label: 'Criminal record certificate, where the route requires one', required: Boolean(input.outsideUk) },
    { key: 'tb_certificate', label: 'TB test certificate, where nationality/residence makes it applicable', required: false },
    { key: 'translations', label: 'Certified translations for documents not in English or Welsh', required: false },
  ];

  if (rules.isNurse) {
    checklist.push({ key: 'professional_registration', label: 'NMC / professional registration evidence where applicable', required: true });
    checklist.push({ key: 'professional_english', label: 'Professional-body English assessment evidence, where relied upon', required: false });
  }

  if (input.hasDependants) {
    checklist.push({ key: 'dependant_identity', label: 'Dependants passports / identity documents', required: true });
    checklist.push({ key: 'relationship_evidence', label: 'Marriage, civil partnership, birth or other relationship evidence', required: true });
    checklist.push({ key: 'dependant_immigration', label: 'Dependants current immigration permission and expiry dates, where in the UK', required: true });
  }

  return checklist;
}

export type VisaCostSummary = {
  currency: 'GBP';
  applicationFeePerPerson: number | null;
  estimatedApplicationFees: number | null;
  ihsPerPersonPerYear: number;
  estimatedIhsTotal: number | null;
  estimatedIhsChargeableMonths: number | null;
  totalEstimatedApplicantCost: number | null;
  ihsExempt: boolean;
  durationBand: 'up_to_3_years' | 'over_3_years' | 'not_set';
  durationMonths: number | null;
  processingTime: string;
  processingTimeInsideUk: string;
  processingTimeOutsideUk: string;
  processingStartsAfter: string;
  sourceUrls: string[];
  lastCheckedLabel: string;
  feeReviewDueLabel: string;
};

function calculateIhs(input: { outsideUk: boolean; durationMonths: number; ratePerYear: number }) {
  if (input.outsideUk && input.durationMonths <= 6) return { chargeableMonths: 0, amount: 0 };
  const chargeableMonths = Math.ceil(input.durationMonths / 6) * 6;
  return { chargeableMonths, amount: input.ratePerYear * chargeableMonths / 12 };
}

export function getVisaCostSummary(input: {
  route: VisaHelpRecommendation['route'];
  outsideUk: boolean;
  durationMonths?: number | null;
  durationYears?: number | null;
  dependantCount?: number | null;
}): VisaCostSummary {
  const rawMonths = Number(input.durationMonths || 0) || (Number(input.durationYears || 0) > 0 ? Number(input.durationYears) * 12 : 0);
  const durationMonths = Math.max(0, Math.min(120, Math.round(rawMonths)));
  const dependantCount = Math.max(0, Math.min(20, Number(input.dependantCount || 0)));
  const people = 1 + dependantCount;
  const durationBand: VisaCostSummary['durationBand'] = durationMonths <= 0 ? 'not_set' : durationMonths <= 36 ? 'up_to_3_years' : 'over_3_years';

  const base = {
    currency: 'GBP' as const,
    durationBand,
    durationMonths: durationMonths || null,
    processingStartsAfter: 'UKVI has received the online application, identity has been verified and the required documents have been provided.',
    feeReviewDueLabel: 'Re-check official fee guidance after 8 October 2026 and before payment.',
  };

  if (input.route === 'health_and_care_worker') {
    const fee = durationBand === 'up_to_3_years' ? 324 : durationBand === 'over_3_years' ? 628 : null;
    const fees = fee == null ? null : fee * people;
    return {
      ...base,
      applicationFeePerPerson: fee,
      estimatedApplicationFees: fees,
      ihsPerPersonPerYear: 0,
      estimatedIhsTotal: 0,
      estimatedIhsChargeableMonths: 0,
      totalEstimatedApplicantCost: fees,
      ihsExempt: true,
      processingTime: 'Usually 3 weeks',
      processingTimeInsideUk: 'Usually 3 weeks',
      processingTimeOutsideUk: 'Usually 3 weeks',
      sourceUrls: [
        'https://www.gov.uk/health-care-worker-visa/how-much-it-costs',
        'https://www.gov.uk/healthcare-immigration-application/who-needs-pay',
        'https://www.gov.uk/health-care-worker-visa/overview',
      ],
      lastCheckedLabel: 'Based on GOV.UK guidance retrieved for 1 October 2026',
    };
  }

  if (input.route === 'skilled_worker' || input.route === 'outside_uk_skilled_worker') {
    const fee = input.outsideUk
      ? (durationBand === 'up_to_3_years' ? 819 : durationBand === 'over_3_years' ? 1618 : null)
      : (durationBand === 'up_to_3_years' ? 943 : durationBand === 'over_3_years' ? 1865 : null);
    const ihsRate = 1035;
    const fees = fee == null ? null : fee * people;
    const ihsResult = durationMonths > 0
      ? calculateIhs({ outsideUk: input.outsideUk, durationMonths, ratePerYear: ihsRate })
      : { chargeableMonths: null, amount: null };
    const ihs = ihsResult.amount == null ? null : ihsResult.amount * people;

    return {
      ...base,
      applicationFeePerPerson: fee,
      estimatedApplicationFees: fees,
      ihsPerPersonPerYear: ihsRate,
      estimatedIhsTotal: ihs,
      estimatedIhsChargeableMonths: ihsResult.chargeableMonths,
      totalEstimatedApplicantCost: fees == null || ihs == null ? null : fees + ihs,
      ihsExempt: false,
      processingTime: input.outsideUk ? 'Usually 3 weeks' : 'Usually 8 weeks',
      processingTimeInsideUk: 'Usually 8 weeks',
      processingTimeOutsideUk: 'Usually 3 weeks',
      sourceUrls: [
        'https://www.gov.uk/skilled-worker-visa/how-much-it-costs',
        'https://www.gov.uk/healthcare-immigration-application/how-much-pay',
        'https://www.gov.uk/government/publications/visa-regulations-revised-table/home-office-immigration-and-nationality-fees-8-april-2026',
        'https://www.gov.uk/government/publications/long-term-work-visas-customer-service-standards',
      ],
      lastCheckedLabel: 'Based on GOV.UK guidance retrieved for 1 October 2026',
    };
  }

  return {
    ...base,
    applicationFeePerPerson: null,
    estimatedApplicationFees: null,
    ihsPerPersonPerYear: 0,
    estimatedIhsTotal: null,
    estimatedIhsChargeableMonths: null,
    totalEstimatedApplicantCost: null,
    ihsExempt: false,
    processingTime: 'Requires route review',
    processingTimeInsideUk: 'Requires route review',
    processingTimeOutsideUk: 'Requires route review',
    sourceUrls: ['https://www.gov.uk/browse/visas-immigration'],
    lastCheckedLabel: 'Official route review required',
  };
}
