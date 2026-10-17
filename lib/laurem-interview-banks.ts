import type { LauremCanonicalRole } from '@/lib/laurem-role-policy';

export type ObjectiveInterviewQuestion = {
  id: string;
  category: string;
  text: string;
  options: string[];
  correctIndex: number;
};

export type PracticalInterviewQuestion = {
  id: string;
  category: string;
  text: string;
  guidance?: string;
};

export const ROUND1_QUESTIONS_PER_ATTEMPT = 20;
export const ROUND1_BANK_SIZE = 30;
export const ROUND2_BANK_SIZE = 30;
export const ROUND1_PASS_PERCENT = 80;

const roleProfiles: Record<LauremCanonicalRole, {
  person: string;
  coreDuty: string;
  safetyTask: string;
  professionalStandard: string;
  roleKnowledge: string;
  equipment: string;
  record: string;
}> = {
  'Healthcare Assistant': {
    person: 'a person receiving care',
    coreDuty: 'supporting everyday care, dignity and comfort',
    safetyTask: 'supporting safe personal care and mobility',
    professionalStandard: 'working within your role and competence',
    roleKnowledge: 'basic care, observation and escalation',
    equipment: 'appropriate personal protective equipment and moving aids',
    record: 'care observations and support provided',
  },
  'Support Worker': {
    person: 'a person you support',
    coreDuty: 'supporting independence, wellbeing and daily living',
    safetyTask: 'supporting safe routines, mobility and community activity',
    professionalStandard: 'working within your role, training and competence',
    roleKnowledge: 'care planning, observation and escalation',
    equipment: 'appropriate PPE and approved support equipment',
    record: 'support notes, incidents and relevant observations',
  },
  'Senior Support Worker': {
    person: 'a person you support',
    coreDuty: 'coordinating safe, person-centred support and helping colleagues',
    safetyTask: 'leading safe care, escalation and shift coordination',
    professionalStandard: 'delegating safely while remaining accountable for oversight',
    roleKnowledge: 'care planning, incident management and team coordination',
    equipment: 'approved PPE, mobility equipment and support resources',
    record: 'support records, handovers, incidents and shift documentation',
  },
  'Registered Nurse': {
    person: 'a patient or service user',
    coreDuty: 'providing safe, person-centred nursing care',
    safetyTask: 'assessing risk, recognising deterioration and escalating appropriately',
    professionalStandard: 'working within professional competence and NMC standards',
    roleKnowledge: 'assessment, clinical judgement, medicines and escalation',
    equipment: 'clinical equipment, PPE and approved moving aids',
    record: 'clinical records, observations, medicines and care plans',
  },
  'Physiotherapist': {
    person: 'a patient or service user',
    coreDuty: 'supporting safe assessment, rehabilitation and functional independence',
    safetyTask: 'assessing mobility, falls risk and safe rehabilitation',
    professionalStandard: 'working within professional competence and HCPC standards',
    roleKnowledge: 'assessment, rehabilitation, mobility and clinical reasoning',
    equipment: 'therapy equipment, mobility aids and appropriate PPE',
    record: 'assessment findings, treatment plans, progress and outcomes',
  },
};

const commonObjectiveTemplates: Array<[string, string, string[], number]> = [
  ['Person-centred care', 'What is the best starting point when planning {coreDuty}?', ['Follow the person\'s needs, preferences and agreed plan', 'Use the same approach for everyone', 'Choose the quickest option', 'Ask a colleague to decide without speaking to the person'], 0],
  ['Dignity', 'Which action best protects dignity during care?', ['Explain what you are doing, seek consent and protect privacy', 'Discuss the person in front of others', 'Rush the task without explanation', 'Ignore the person\'s preferences'], 0],
  ['Communication', 'A person does not understand your explanation. What should you do?', ['Adapt your communication and check their understanding', 'Repeat the same words more loudly', 'Move on without checking', 'Ask another person to answer for them'], 0],
  ['Consent', 'Before providing non-emergency care, what should you normally do?', ['Check consent and explain what will happen', 'Assume consent because care is planned', 'Start first and explain later', 'Ask a visitor instead of the person'], 0],
  ['Safeguarding', 'You notice a possible safeguarding concern. What is the safest response?', ['Follow safeguarding procedures and report the concern promptly', 'Investigate it yourself in secret', 'Ignore it unless the person complains', 'Post about it in a staff group'], 0],
  ['Infection prevention', 'Which practice is most important for reducing infection risk?', ['Effective hand hygiene at the appropriate times', 'Wearing gloves for every task without hand hygiene', 'Reusing single-use items', 'Keeping the same gloves between people'], 0],
  ['PPE', 'When should you use {equipment}?', ['When the risk assessment or procedure requires it', 'Whenever you want regardless of risk', 'Only when a colleague is watching', 'Only after an incident'], 0],
  ['Incident response', 'A person has an unexpected fall. What is your first priority?', ['Make the person safe, assess immediate risk and follow the escalation procedure', 'Move them immediately without checking', 'Leave them alone', 'Complete paperwork before checking them'], 0],
  ['Escalation', 'You are concerned that {person} is becoming unwell. What should you do?', ['Make the appropriate observations and escalate according to the care plan and local procedure', 'Wait until the next shift', 'Keep the concern to yourself', 'Only mention it if symptoms become severe'], 0],
  ['Documentation', 'What makes {record} useful and safe?', ['Accurate, timely, factual and relevant entries', 'Opinions presented as facts', 'Late entries with no explanation', 'Deleting information you dislike'], 0],
  ['Professional boundaries', 'Which action best reflects professional boundaries?', ['Keep the relationship professional and follow organisational guidance', 'Accept inappropriate gifts from people you support', 'Share personal passwords', 'Connect with every service user on social media'], 0],
  ['Confidentiality', 'When should confidential information be shared?', ['Only with appropriate people for a legitimate care or safeguarding purpose', 'With friends who are curious', 'In public spaces', 'On social media'], 0],
  ['Teamwork', 'What is the safest approach when handing over important information?', ['Give a clear, relevant and accurate handover', 'Assume others already know', 'Leave out concerns to keep it brief', 'Wait until someone asks'], 0],
  ['Competence', 'What does {professionalStandard} involve?', ['Recognising your limits and seeking help when needed', 'Doing tasks you have not been trained for', 'Avoiding supervision', 'Taking responsibility only when things go well'], 0],
  ['Health and safety', 'You identify a hazard in the work area. What should you do?', ['Make the situation safer if appropriate and report it through the correct process', 'Ignore it', 'Move the hazard somewhere else', 'Wait for an accident'], 0],
  ['Equality', 'How should you respond to different needs or preferences?', ['Provide respectful, equitable support without unlawful discrimination', 'Treat everyone identically even when reasonable adjustments are needed', 'Make assumptions based on background', 'Refuse reasonable adjustments'], 0],
  ['Mental capacity', 'A person may have difficulty making a particular decision. What is the appropriate approach?', ['Support them to make the decision and follow applicable capacity guidance', 'Assume they lack capacity', 'Let a relative decide automatically', 'Ignore their view'], 0],
  ['De-escalation', 'A person becomes distressed or upset. What is usually the best first approach?', ['Remain calm, listen and use the least restrictive supportive response', 'Argue with them', 'Raise your voice', 'Threaten consequences immediately'], 0],
  ['Medication boundaries', 'You are asked to do a medication task outside your competence. What should you do?', ['Do not perform it and seek the appropriate competent support', 'Do it quickly', 'Ask another untrained colleague', 'Guess the dose'], 0],
  ['Emergency response', 'In an emergency, which principle comes first?', ['Protect immediate safety, follow emergency procedures and call for appropriate help', 'Finish routine paperwork', 'Wait for a manager to arrive before doing anything', 'Leave the scene'], 0],
  ['Whistleblowing', 'You are worried that a serious unsafe practice is being ignored. What should you do?', ['Use the appropriate escalation or whistleblowing route', 'Keep silent to avoid trouble', 'Discuss it publicly online', 'Delete records'], 0],
  ['Digital safety', 'What is the safest way to protect a candidate or service user record?', ['Use approved systems and keep credentials secure', 'Share passwords with colleagues', 'Store files on a public USB', 'Send sensitive data to a personal social account'], 0],
  ['Care planning', 'Why should you follow the current care or treatment plan?', ['It provides agreed guidance while still requiring you to notice and escalate changes', 'It removes the need for judgement', 'It means you never ask questions', 'It is optional'], 0],
  ['Observation', 'Why are changes in a person\'s normal presentation important?', ['They may indicate a change in need or health requiring assessment or escalation', 'They are always insignificant', 'They should be ignored unless dramatic', 'They are only relevant to managers'], 0],
  ['Respect', 'Which approach best supports a person\'s independence?', ['Offer appropriate support while encouraging them to do what they can safely do themselves', 'Do everything for them', 'Refuse support', 'Make decisions without asking'], 0],
  ['Record keeping', 'What should you do if you make an error in a record?', ['Correct it according to the approved record-keeping procedure without hiding the original entry', 'Delete the whole record', 'Change the date secretly', 'Ask someone else to sign for you'], 0],
  ['Learning', 'You are unsure how to carry out a task safely. What is the best action?', ['Pause and obtain appropriate guidance or supervision', 'Guess', 'Copy a colleague without asking', 'Proceed because the task looks simple'], 0],
  ['Respectful challenge', 'You believe a colleague is about to take an unsafe action. What should you do?', ['Raise the concern respectfully and escalate if necessary', 'Stay silent', 'Wait until after an incident', 'Mock the colleague'], 0],
  ['Professionalism', 'Which behaviour best demonstrates professionalism?', ['Reliability, honesty, respectful communication and safe practice', 'Hiding mistakes', 'Blaming others', 'Ignoring feedback'], 0],
  ['Role knowledge', 'Which principle best describes {roleKnowledge}?', ['Use role-appropriate knowledge, observe carefully and escalate outside your scope', 'Work beyond your scope whenever busy', 'Avoid documenting decisions', 'Ignore the agreed plan'], 0],
];

const roleSpecificObjectiveTemplates: Array<[string, string, string[], number]> = [
  ['Role practice', 'For {role}, what should you do when a task falls outside your training or registration?', ['Pause and seek an appropriately competent person', 'Carry it out anyway', 'Ask the person to teach you', 'Guess from memory'], 0],
  ['Risk assessment', 'Before supporting {safetyTask}, what is especially important?', ['Check the current plan, risks and relevant equipment', 'Use equipment without checking', 'Ignore previous incidents', 'Assume the environment is safe'], 0],
  ['Professional development', 'If you identify a knowledge gap affecting safe practice, what is best?', ['Seek supervision, training or guidance and record learning where required', 'Hide the gap', 'Avoid asking questions', 'Take on more complex work'], 0],
  ['Team escalation', 'You disagree with an important care decision. What is safest?', ['Raise the concern respectfully using the appropriate escalation route', 'Refuse all future work', 'Discuss it with friends', 'Change the plan without agreement'], 0],
  ['Person choice', 'A person has a reasonable preference that does not create an unsafe situation. What should you do?', ['Respect and incorporate the preference where possible', 'Ignore it', 'Choose for them', 'Treat it as a refusal of care'], 0],
  ['Record quality', 'Which entry is best for {record}?', ['A factual note describing what was observed, done and escalated', 'A personal opinion about the person', 'A vague statement with no time', 'A copy of yesterday\'s note'], 0],
  ['Escalation threshold', 'When should you escalate a significant change in condition or risk?', ['Promptly, according to the urgency and local procedure', 'Only at the end of the week', 'Only after an incident', 'Never'], 0],
  ['Equipment safety', 'Before using unfamiliar {equipment}, what should you do?', ['Confirm training, suitability and the relevant instructions', 'Use it immediately', 'Ask the person to operate it', 'Ignore the instructions'], 0],
  ['Professional accountability', 'Who remains responsible for safe practice when work is delegated?', ['The person delegating remains responsible for appropriate delegation and oversight', 'Nobody', 'Only the patient', 'Only the person receiving the task'], 0],
  ['Reflective practice', 'After a difficult event, what is a useful professional response?', ['Reflect on what happened, identify learning and escalate concerns where needed', 'Forget it immediately', 'Blame one colleague', 'Delete notes'], 0],
];

const practicalTemplates: Array<[string, string, string, string?]> = [
  ['Person-centred care', 'Talk us through how you would plan {coreDuty} for a new person you were supporting.', 'Consider how you would learn the person\'s preferences, review the current plan, gain consent and involve the person in choices.'],
  ['Dignity', 'How would you protect dignity during a task involving personal care or sensitive information?', 'Consider privacy, explanation, consent, respectful language and the person\'s preferences.'],
  ['Communication', 'A person is upset and says they do not understand what is happening. What would you do?', 'Consider listening, adapting communication, checking understanding and allowing time.'],
  ['Safeguarding', 'You notice a possible sign of abuse or neglect. Describe exactly what you would do.', 'Consider immediate safety, factual recording, reporting and safeguarding escalation.'],
  ['Infection prevention', 'Explain how you would reduce infection risk during an ordinary shift.', 'Consider hand hygiene, PPE, equipment, waste and local infection-control procedure.'],
  ['Deterioration', 'A person suddenly seems much less well than usual. Talk us through your response.', 'Consider observations, immediate safety, escalation, documentation and handover.'],
  ['Incident response', 'Someone you are supporting has a fall. What would you do from the moment you notice?', 'Consider immediate assessment, not moving the person unnecessarily, escalation and incident reporting.'],
  ['Conflict', 'A colleague challenges your decision during a busy shift. How would you handle it?', 'Consider staying professional, discussing the facts and escalating safety concerns where necessary.'],
  ['Confidentiality', 'A friend asks you about someone you support. How would you respond?', 'Consider confidentiality, legitimate need to know and approved communication routes.'],
  ['Professional boundaries', 'A person you support offers you an expensive personal gift. What would you do?', 'Consider boundaries, organisational policy and transparent reporting.'],
  ['Consent', 'A person refuses a planned intervention that you believe is beneficial. How would you respond?', 'Consider capacity where relevant, informed choice, communication and escalation.'],
  ['Mental capacity', 'How would you support a person who may struggle to make a particular decision?', 'Consider decision-specific support, communication and applicable legal or organisational guidance.'],
  ['Documentation', 'Show us how you would make a useful record after a significant event.', 'Consider factual language, times, actions, observations, escalation and avoiding unsupported opinions.'],
  ['Working within scope', 'Describe a situation where you would stop and seek a more senior or registered professional.', 'Consider competence, role boundaries, risk and escalation.'],
  ['Teamwork', 'What information would you make sure is included in a good handover?', 'Consider current risks, changes, actions taken, outstanding actions and relevant person-centred information.'],
  ['Equality and inclusion', 'Give an example of how you would make support more accessible for someone with a particular need.', 'Consider reasonable adjustments, respectful communication and avoiding assumptions.'],
  ['Emergency', 'A serious emergency happens while you are the only staff member nearby. Talk us through your first actions.', 'Consider immediate safety, calling for help, emergency procedure and staying within competence.'],
  ['Unsafe practice', 'You see a colleague repeatedly doing something you believe is unsafe. What do you do?', 'Consider speaking up, immediate risk, escalation and formal reporting.'],
  ['Learning', 'Tell us about a time you learned from a mistake or difficult situation.', 'Consider reflection, honesty, learning and what changed afterwards.'],
  ['Resilience', 'Describe how you maintain safe practice during a demanding shift.', 'Consider prioritisation, asking for help, breaks where appropriate and maintaining professional standards.'],
  ['Role-specific judgement', 'What is the most important professional responsibility for a {role} when risk is increasing?', 'Consider early recognition, acting within scope, escalation and clear records.'],
  ['Role-specific assessment', 'How would you approach a new task that requires {roleKnowledge}?', 'Consider assessment, current guidance, competence and documentation.'],
  ['Equipment', 'Before using {equipment}, what checks would you make?', 'Consider training, suitability, condition and the person\'s safety.'],
  ['Care planning', 'How should your practice respond when the current plan no longer matches the person\'s needs?', 'Consider recognising change, escalating, updating plans through the right route and documenting.'],
  ['Professional standards', 'How do you demonstrate {professionalStandard} on a normal shift?', 'Give a practical example rather than only listing values.'],
  ['Prioritisation', 'You have several competing tasks. How do you decide what to do first?', 'Consider immediate risk, urgency, planned care, delegation and communicating delays.'],
  ['Feedback', 'Tell us about a time useful feedback changed your practice.', 'Focus on what you learned and what you changed.'],
  ['Person independence', 'How would you balance support and independence for {person}?', 'Consider what the person can do safely, choice, risk and graded support.'],
  ['Ethical judgement', 'You are under pressure to take a shortcut that may affect safety. What would you do?', 'Consider professional duty, speaking up, escalation and documenting where appropriate.'],
  ['Closing scenario', 'Imagine you finish a difficult shift involving several incidents. What would you do before handing over and going home?', 'Consider records, outstanding actions, handover, escalation and reflection.'],
];

function format(template: string, role: LauremCanonicalRole) {
  const p = roleProfiles[role];
  return template
    .replaceAll('{role}', role)
    .replaceAll('{person}', p.person)
    .replaceAll('{coreDuty}', p.coreDuty)
    .replaceAll('{safetyTask}', p.safetyTask)
    .replaceAll('{professionalStandard}', p.professionalStandard)
    .replaceAll('{roleKnowledge}', p.roleKnowledge)
    .replaceAll('{equipment}', p.equipment)
    .replaceAll('{record}', p.record);
}

function buildObjectiveBank(role: LauremCanonicalRole): ObjectiveInterviewQuestion[] {
  const templates = [...commonObjectiveTemplates.slice(0, 20), ...roleSpecificObjectiveTemplates];
  return templates.slice(0, ROUND1_BANK_SIZE).map(([category, text, options, correctIndex], index) => ({
    id: `${role.toLowerCase().replaceAll(' ', '_')}_r1_${String(index + 1).padStart(2, '0')}`,
    category,
    text: format(text, role),
    options: options.map((option) => format(option, role)),
    correctIndex,
  }));
}

function buildPracticalBank(role: LauremCanonicalRole): PracticalInterviewQuestion[] {
  return practicalTemplates.slice(0, ROUND2_BANK_SIZE).map(([category, text, guidance], index) => ({
    id: `${role.toLowerCase().replaceAll(' ', '_')}_r2_${String(index + 1).padStart(2, '0')}`,
    category,
    text: format(text, role),
    guidance: guidance ? format(guidance, role) : undefined,
  }));
}

export const LAUREM_INTERVIEW_BANKS: Record<LauremCanonicalRole, { round1: ObjectiveInterviewQuestion[]; round2: PracticalInterviewQuestion[] }> = {
  'Healthcare Assistant': { round1: buildObjectiveBank('Healthcare Assistant'), round2: buildPracticalBank('Healthcare Assistant') },
  'Support Worker': { round1: buildObjectiveBank('Support Worker'), round2: buildPracticalBank('Support Worker') },
  'Senior Support Worker': { round1: buildObjectiveBank('Senior Support Worker'), round2: buildPracticalBank('Senior Support Worker') },
  'Registered Nurse': { round1: buildObjectiveBank('Registered Nurse'), round2: buildPracticalBank('Registered Nurse') },
  'Physiotherapist': { round1: buildObjectiveBank('Physiotherapist'), round2: buildPracticalBank('Physiotherapist') },
};

export function getLauremRound1Bank(role: LauremCanonicalRole) {
  return LAUREM_INTERVIEW_BANKS[role].round1;
}

export function getLauremRound2Bank(role: LauremCanonicalRole) {
  return LAUREM_INTERVIEW_BANKS[role].round2;
}

export function getLauremInterviewRoleProfile(role: LauremCanonicalRole) {
  return roleProfiles[role];
}
