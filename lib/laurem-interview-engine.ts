import { randomInt } from 'node:crypto';
import type { LauremCanonicalRole } from '@/lib/laurem-role-policy';
import { getLauremRound1Bank, getLauremRound2Bank, ROUND1_QUESTIONS_PER_ATTEMPT, ROUND1_PASS_PERCENT } from '@/lib/laurem-interview-banks';
import type { ObjectiveInterviewQuestion, PracticalInterviewQuestion } from '@/lib/laurem-interview-banks';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickBalanced<T extends { category: string }>(bank: T[], count: number): T[] {
  const groups = new Map<string, T[]>();
  for (const question of bank) groups.set(question.category, [...(groups.get(question.category) || []), question]);
  const categories = shuffle([...groups.keys()]);
  const target = Math.floor(count / categories.length);
  const remainder = count % categories.length;
  const selected: T[] = [];
  categories.forEach((category, index) => selected.push(...shuffle(groups.get(category) || []).slice(0, target + (index < remainder ? 1 : 0))));
  return shuffle(selected).slice(0, count);
}

export function prepareRound1Questions(questions: ObjectiveInterviewQuestion[]) {
  return questions.map((question) => {
    const options = question.options.map((text, index) => ({ text, correct: index === question.correctIndex }));
    const shuffled = shuffle(options);
    return { ...question, options: shuffled.map((option) => option.text), correctIndex: shuffled.findIndex((option) => option.correct) };
  });
}

export function selectRound1Questions(role: LauremCanonicalRole) {
  return prepareRound1Questions(pickBalanced(getLauremRound1Bank(role), ROUND1_QUESTIONS_PER_ATTEMPT));
}

export function selectRound2Questions(role: LauremCanonicalRole) {
  return shuffle(getLauremRound2Bank(role)).slice(0, ROUND1_QUESTIONS_PER_ATTEMPT);
}

export function publicRound1Questions(questions: ObjectiveInterviewQuestion[]) {
  return questions.map(({ correctIndex: _correctIndex, ...question }) => question);
}

export function scoreRound1(questions: ObjectiveInterviewQuestion[], answers: Record<string, unknown>) {
  let score = 0;
  for (const question of questions) {
    const answer = Number(answers[question.id]);
    if (Number.isInteger(answer) && answer === question.correctIndex) score += 1;
  }
  return { score, total: questions.length, percent: questions.length ? Math.round((score * 10000) / questions.length) / 100 : 0, passed: questions.length > 0 && (score * 100) / questions.length >= ROUND1_PASS_PERCENT };
}

export function publicRound2Questions(questions: PracticalInterviewQuestion[]) {
  return questions.map((question) => ({ id: question.id, category: question.category, text: question.text, guidance: question.guidance }));
}
