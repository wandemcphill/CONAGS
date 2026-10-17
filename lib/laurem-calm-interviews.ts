import {
  getLauremNurseFirstInterviewQuestions,
  getLauremNurseSecondInterviewQuestions,
  type InterviewQuestion,
  type NursePathway,
} from './laurem-nurse-interviews';

const FIRST_CORE_IDS = [
  'nurse_about_you',
  'nurse_motivation',
  'nurse_person_centred_care',
  'nurse_communication',
  'nurse_teamwork',
  'nurse_deteriorating_patient',
  'nurse_safeguarding',
  'nurse_raise_concern',
] as const;

const FIRST_UK_IDS = ['nurse_uk_registration', 'nurse_uk_right_to_work'] as const;
const FIRST_INTERNATIONAL_IDS = ['nurse_intl_nmc_status', 'nurse_intl_relocation'] as const;

/**
 * Candidate-facing interview set. The full question bank remains available
 * for recruitment/admin use, but candidates get a focused screening that
 * tests the important areas without turning the assessment into an essay exam.
 */
export function getLauremCalmFirstInterviewQuestions(pathway: NursePathway): InterviewQuestion[] {
  const full = getLauremNurseFirstInterviewQuestions(pathway);
  const byId = new Map(full.map((question) => [question.id, question]));
  const ids = pathway === 'international' ? [...FIRST_CORE_IDS, ...FIRST_INTERNATIONAL_IDS] : [...FIRST_CORE_IDS, ...FIRST_UK_IDS];
  return ids.flatMap((id) => {
    const question = byId.get(id);
    return question ? [question] : [];
  });
}

/** Keep second interviews focused on the five strongest role-fit scenarios. */
export function getLauremCalmSecondInterviewQuestions(pathway: NursePathway): InterviewQuestion[] {
  const full = getLauremNurseSecondInterviewQuestions(pathway);
  return full.slice(0, 5);
}

export const LAUREM_CALM_FIRST_INTERVIEW_COUNT = {
  uk: getLauremCalmFirstInterviewQuestions('uk').length,
  international: getLauremCalmFirstInterviewQuestions('international').length,
};
