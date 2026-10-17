import { describe, expect, it } from 'vitest';
import { LAUREM_CANONICAL_ROLES } from '@/lib/laurem-role-policy';
import { getLauremRound1Bank, getLauremRound2Bank, ROUND1_QUESTIONS_PER_ATTEMPT, ROUND1_BANK_SIZE, ROUND2_BANK_SIZE, ROUND1_PASS_PERCENT } from '@/lib/laurem-interview-banks';
import { scoreRound1, selectRound1Questions, selectRound2Questions } from '@/lib/laurem-interview-engine';

describe('CONAGS interview engine', () => {
  it('has a 30-question bank for every supported role and round', () => {
    for (const role of LAUREM_CANONICAL_ROLES) {
      expect(getLauremRound1Bank(role)).toHaveLength(ROUND1_BANK_SIZE);
      expect(getLauremRound2Bank(role)).toHaveLength(ROUND2_BANK_SIZE);
    }
  });

  it('selects 20 stable-question objects for round one with hidden answer keys', () => {
    for (const role of LAUREM_CANONICAL_ROLES) {
      const selected = selectRound1Questions(role);
      expect(selected).toHaveLength(ROUND1_QUESTIONS_PER_ATTEMPT);
      expect(new Set(selected.map((q) => q.id)).size).toBe(ROUND1_QUESTIONS_PER_ATTEMPT);
      expect(selected.every((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length)).toBe(true);
    }
  });

  it('selects a different random subset rather than a fixed first 20', () => {
    const a = selectRound1Questions('Support Worker').map((q) => q.id).join('|');
    const b = selectRound1Questions('Support Worker').map((q) => q.id).join('|');
    expect(a).not.toBe(b);
  });

  it('randomises option positions so answer A is not always correct', () => {
    const samples = Array.from({ length: 8 }, () => selectRound1Questions('Registered Nurse'));
    const positions = samples.flat().map((q) => q.correctIndex);
    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it('uses the configured 80 percent pass mark', () => {
    const questions = selectRound1Questions('Healthcare Assistant');
    const answers = Object.fromEntries(questions.map((q) => [q.id, q.correctIndex]));
    expect(scoreRound1(questions, answers)).toMatchObject({ score: 20, total: 20, percent: 100, passed: true });
    const failed = questions.reduce<Record<string, number>>((acc, q, i) => { acc[q.id] = i < 15 ? q.correctIndex : (q.correctIndex + 1) % q.options.length; return acc; }, {});
    expect(scoreRound1(questions, failed).percent).toBeLessThan(ROUND1_PASS_PERCENT);
  });

  it('selects 20 second-stage practical questions per role', () => {
    for (const role of LAUREM_CANONICAL_ROLES) {
      expect(selectRound2Questions(role)).toHaveLength(ROUND1_QUESTIONS_PER_ATTEMPT);
    }
  });
});
