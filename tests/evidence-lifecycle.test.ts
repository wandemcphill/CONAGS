import { describe, expect, it } from 'vitest';
import {
  evidenceStatusToChecklistStatus,
  normalizeEvidenceType,
  readinessKeyForEvidenceType,
} from '@/lib/laurem-evidence';

describe('recruitment evidence lifecycle mapping', () => {
  it('normalizes human document labels deterministically', () => {
    expect(normalizeEvidenceType('NMC Registration')).toBe('nmc_registration');
    expect(normalizeEvidenceType('Right-to-Work Document')).toBe('right_to_work_document');
  });

  it('maps identity evidence to the identity readiness gate', () => {
    expect(readinessKeyForEvidenceType('Passport')).toBe('identity_verified');
  });

  it('maps references, international permission and registration gates', () => {
    expect(readinessKeyForEvidenceType('Reference Letter')).toBe('references_verified');
    expect(readinessKeyForEvidenceType('International Work Permission')).toBe('international_work_permission_verified');
    expect(readinessKeyForEvidenceType('NMC Registration')).toBe('professional_registration_verified');
  });

  it('does not invent a readiness gate for unknown evidence', () => {
    expect(readinessKeyForEvidenceType('Unknown Supporting Material')).toBeNull();
  });

  it('maps evidence outcomes to checklist outcomes fail-closed', () => {
    expect(evidenceStatusToChecklistStatus('approved')).toBe('completed');
    expect(evidenceStatusToChecklistStatus('waived')).toBe('waived');
    expect(evidenceStatusToChecklistStatus('rejected')).toBe('pending');
    expect(evidenceStatusToChecklistStatus('expired')).toBe('pending');
    expect(evidenceStatusToChecklistStatus('superseded')).toBe('pending');
  });
});
