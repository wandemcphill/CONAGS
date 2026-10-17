import { describe, expect, it } from 'vitest';
import {
  assertLauremVisaCoSAssignment,
  assertLauremVisaStatusTransition,
  canTransitionLauremVisaCase,
  isLauremVisaTerminalStatus,
} from '@/lib/laurem-visa-lifecycle';

describe('CONAGS visa lifecycle state machine', () => {
  it('allows forward operational transitions and terminal exits', () => {
    expect(canTransitionLauremVisaCase('requested', 'admin_review')).toBe(true);
    expect(canTransitionLauremVisaCase('admin_review', 'awaiting_payment')).toBe(true);
    expect(canTransitionLauremVisaCase('preparing_sms', 'submitted_to_sms')).toBe(true);
    expect(canTransitionLauremVisaCase('cos_pending', 'cos_assigned')).toBe(true);
    expect(canTransitionLauremVisaCase('cos_assigned', 'completed')).toBe(true);
    expect(canTransitionLauremVisaCase('admin_review', 'declined')).toBe(true);
    expect(canTransitionLauremVisaCase('admin_review', 'withdrawn')).toBe(true);
  });

  it('rejects backwards and terminal-state rewrites', () => {
    expect(canTransitionLauremVisaCase('cos_assigned', 'requested')).toBe(false);
    expect(canTransitionLauremVisaCase('completed', 'cos_assigned')).toBe(false);
    expect(isLauremVisaTerminalStatus('completed')).toBe(true);
    expect(isLauremVisaTerminalStatus('declined')).toBe(true);
    expect(isLauremVisaTerminalStatus('withdrawn')).toBe(true);
    expect(() => assertLauremVisaStatusTransition('completed', 'requested')).toThrow();
  });

  it('allows a CoS to advance any open case but never a terminal case', () => {
    expect(() => assertLauremVisaCoSAssignment('submitted_to_sms')).not.toThrow();
    expect(() => assertLauremVisaCoSAssignment('cos_pending')).not.toThrow();
    expect(() => assertLauremVisaCoSAssignment('cos_assigned')).not.toThrow();
    expect(() => assertLauremVisaCoSAssignment('requested')).toThrow();
    expect(() => assertLauremVisaCoSAssignment('admin_review')).toThrow();
    expect(() => assertLauremVisaCoSAssignment('completed')).toThrow();
    expect(() => assertLauremVisaCoSAssignment('declined')).toThrow();
    expect(() => assertLauremVisaCoSAssignment('withdrawn')).toThrow();
  });
});
