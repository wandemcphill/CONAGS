export type InterviewQuestion = {
  id: string;
  category: string;
  text: string;
  guidance?: string;
};

export type NursePathway = 'uk' | 'international';

/**
 * Full interview bank for Conags recruitment/admin workflows.
 * Candidate-facing screens use the focused selection in laurem-calm-interviews.ts.
 */
export const LAUREM_NURSE_FIRST_COMMON_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'nurse_about_you',
    category: 'Getting to know you',
    text: 'What kind of nursing have you done, and what do you enjoy most about your work?',
  },
  {
    id: 'nurse_motivation',
    category: 'Motivation',
    text: 'What interests you about joining Conags Care?',
  },
  {
    id: 'nurse_person_centred_care',
    category: 'Person-centred care',
    text: 'What does great person-centred care look like in your day-to-day practice?',
  },
  {
    id: 'nurse_communication',
    category: 'Communication',
    text: 'Tell us about a time you made a difficult conversation easier for a patient, family member or colleague.',
  },
  {
    id: 'nurse_teamwork',
    category: 'Teamwork',
    text: 'Tell us about a time you worked well with others to solve a problem or improve care.',
  },
  {
    id: 'nurse_raise_concern',
    category: 'Professional judgement',
    text: 'Tell us about a time you raised a safety concern. What did you do?',
  },
];

export const LAUREM_NURSE_CLINICAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'nurse_deteriorating_patient',
    category: 'Clinical judgement',
    text: 'A person suddenly becomes more unwell during your shift. What would you do first?',
    guidance: 'Talk through your immediate priorities, observations, escalation and documentation.',
  },
  {
    id: 'nurse_medication_safety',
    category: 'Medication safety',
    text: 'You notice a possible medication error. What would you do next?',
  },
  {
    id: 'nurse_infection_control',
    category: 'Infection prevention',
    text: 'What do you do in everyday practice to help prevent infection?',
  },
  {
    id: 'nurse_safeguarding',
    category: 'Safeguarding',
    text: 'You are worried that a vulnerable person may be experiencing abuse or neglect. How would you respond?',
  },
  {
    id: 'nurse_capacity_consent',
    category: 'Consent and rights',
    text: 'A person refuses care that you believe is important. How would you handle the situation?',
    guidance: 'Consider communication, consent, capacity where relevant, escalation and documentation.',
  },
  {
    id: 'nurse_documentation',
    category: 'Record keeping',
    text: 'What makes a nursing record clear, accurate and safe?',
  },
  {
    id: 'nurse_scope_competence',
    category: 'Professional standards',
    text: 'What does working within your competence mean to you?',
  },
  {
    id: 'nurse_delegation',
    category: 'Leadership and delegation',
    text: 'How do you make sure work you delegate is safe and appropriate for the person receiving it?',
  },
];

export const LAUREM_NURSE_UK_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'nurse_uk_right_to_work',
    category: 'Right to work',
    text: 'What is your current UK right-to-work status, and are there any restrictions or expiry dates we should know about?',
  },
  {
    id: 'nurse_uk_registration',
    category: 'Professional registration',
    text: 'What is your current NMC registration status?',
  },
  {
    id: 'nurse_uk_availability',
    category: 'Availability',
    text: 'What shifts and locations are you comfortable working, including nights or weekends where required?',
  },
];

export const LAUREM_NURSE_INTERNATIONAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'nurse_intl_current_country',
    category: 'International pathway',
    text: 'Which country are you currently living and practising in, and what is your current nursing role?',
  },
  {
    id: 'nurse_intl_nmc_status',
    category: 'Professional registration',
    text: 'What stage are you currently at with UK NMC registration?',
    guidance: 'Mention any completed or outstanding registration steps you are comfortable sharing.',
  },
  {
    id: 'nurse_intl_english',
    category: 'Communication',
    text: 'How have you demonstrated the English-language competence needed for UK nursing practice?',
  },
  {
    id: 'nurse_intl_relocation',
    category: 'Relocation',
    text: 'What is your expected timeframe for relocating to the UK?',
  },
  {
    id: 'nurse_intl_dependants',
    category: 'Relocation',
    text: 'Are there any relocation arrangements or considerations you would like Conags to know about?',
  },
  {
    id: 'nurse_intl_adaptation',
    category: 'Adaptability',
    text: 'How would you prepare for working in a new healthcare system and workplace culture?',
  },
  {
    id: 'nurse_intl_sponsorship',
    category: 'Sponsorship',
    text: 'What do you understand about employer sponsorship, and what would you expect the employer to support you with?',
  },
];

export const LAUREM_NURSE_SECOND_COMMON_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'nurse_second_safeguarding',
    category: 'Safeguarding',
    text: 'You notice unexplained bruising and a change in a vulnerable person’s behaviour. What would you do?',
  },
  {
    id: 'nurse_second_medication_error',
    category: 'Medication safety',
    text: 'You discover a medication error. What happens next?',
  },
  {
    id: 'nurse_second_deterioration',
    category: 'Clinical escalation',
    text: 'A person suddenly deteriorates. How would you prioritise your response?',
  },
  {
    id: 'nurse_second_conflict',
    category: 'Professionalism',
    text: 'A colleague disagrees with you in front of a patient. How would you handle it?',
  },
  {
    id: 'nurse_second_end_of_life',
    category: 'Compassionate care',
    text: 'How would you support a person and family receiving end-of-life care?',
  },
];

export const LAUREM_NURSE_SECOND_UK_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'nurse_second_uk_local_practice',
    category: 'UK practice',
    text: 'Tell us about your experience working within UK healthcare or social care policy and multidisciplinary practice.',
  },
];

export const LAUREM_NURSE_SECOND_INTERNATIONAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'nurse_second_intl_cultural_adaptation',
    category: 'International adaptation',
    text: 'What do you think will be the biggest adjustment when practising nursing in the UK?',
  },
  {
    id: 'nurse_second_intl_patient_safety',
    category: 'Patient safety',
    text: 'What would you do if a UK policy differed from how you were previously taught to work?',
  },
];

export function getLauremNurseFirstInterviewQuestions(pathway: NursePathway): InterviewQuestion[] {
  return [
    ...LAUREM_NURSE_FIRST_COMMON_QUESTIONS,
    ...LAUREM_NURSE_CLINICAL_QUESTIONS,
    ...(pathway === 'international' ? LAUREM_NURSE_INTERNATIONAL_QUESTIONS : LAUREM_NURSE_UK_QUESTIONS),
  ];
}

export function getLauremNurseSecondInterviewQuestions(pathway: NursePathway): InterviewQuestion[] {
  return [
    ...LAUREM_NURSE_SECOND_COMMON_QUESTIONS,
    ...(pathway === 'international' ? LAUREM_NURSE_SECOND_INTERNATIONAL_QUESTIONS : LAUREM_NURSE_SECOND_UK_QUESTIONS),
  ];
}

export const LAUREM_NURSE_ALL_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  ...LAUREM_NURSE_FIRST_COMMON_QUESTIONS,
  ...LAUREM_NURSE_CLINICAL_QUESTIONS,
  ...LAUREM_NURSE_UK_QUESTIONS,
  ...LAUREM_NURSE_INTERNATIONAL_QUESTIONS,
  ...LAUREM_NURSE_SECOND_COMMON_QUESTIONS,
  ...LAUREM_NURSE_SECOND_UK_QUESTIONS,
  ...LAUREM_NURSE_SECOND_INTERNATIONAL_QUESTIONS,
];
