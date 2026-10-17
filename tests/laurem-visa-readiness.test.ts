import { describe, expect, it } from 'vitest';
import { buildLauremVisaReadiness, canAdvanceLauremVisaToSmsSubmission } from '@/lib/laurem-visa-readiness';

const base = {
  pathway: 'visa_switch',
  staff: { id: 'staff-1' },
  application: { id: 'application-1' },
  additionalInformation: {
    passport_number: 'P1234567',
    passport_expiry_date: '2030-12-01',
    passport_country: 'NG',
    current_visa_type: 'Graduate',
    current_visa_start_date: '2024-09-01',
    current_visa_end_date: '2027-06-01',
    address_is_current: 'yes',
    address_proof_provided: 'yes',
    right_to_work_status: 'yes',
    right_to_work_proof_provided: 'yes',
  },
};

// The readiness contract is deliberately application-level because the underlying visa case schema is already sufficient.
describe('CONAGS visa operational readiness', () => {
  it('requires linked identity, passport data, current switch-route visa data and paid invoice', () => {
    const notReady = buildLauremVisaReadiness({ ...base, invoiceStatus: 'issued' });
    expect(notReady.ready).toBe(false);
    expect(notReady.missing).toContain('CONAGS sponsorship-support invoice is paid');

    const ready = buildLauremVisaReadiness({ ...base, invoiceStatus: 'paid' });
    expect(ready.ready).toBe(true);
    expect(ready.readyForSmsSubmission).toBe(true);
    expect(ready.missing).not.toContain('Current UK visa start date recorded');
    expect(ready.missing).not.toContain('Current UK visa end date recorded');
    expect(ready.missing).toEqual([]);
  });

  it('does not require current UK visa fields for international sponsorship', () => {
    const ready = buildLauremVisaReadiness({
      ...base,
      pathway: 'international_sponsorship',
      additionalInformation: {
        passport_number: 'P1234567',
        passport_expiry_date: '2030-12-01',
        passport_country: 'NG',
        address_is_current: 'yes',
        address_proof_provided: 'yes',
      },
      invoiceStatus: 'paid',
    });
    expect(ready.ready).toBe(true);
  });

  it('requires a current address and UK right-to-work confirmation for switch cases', () => {
    const addressMissing = buildLauremVisaReadiness({
      ...base,
      invoiceStatus: 'paid',
      additionalInformation: { ...base.additionalInformation, address_is_current: 'no', current_address: '12 New Street', address_proof_provided: 'yes' },
    });
    expect(addressMissing.ready).toBe(true);
    expect(addressMissing.missing).not.toContain('Application address confirmed as current or updated');

    const proofMissing = buildLauremVisaReadiness({
      ...base,
      invoiceStatus: 'paid',
      additionalInformation: { ...base.additionalInformation, address_is_current: 'yes', address_proof_provided: 'no', right_to_work_status: 'yes', right_to_work_proof_provided: 'yes' },
    });
    expect(proofMissing.ready).toBe(false);
    expect(proofMissing.missing).toContain('Proof of current address provided to CONAGS');

    const shareCodeRequired = buildLauremVisaReadiness({
      ...base,
      invoiceStatus: 'paid',
      additionalInformation: { ...base.additionalInformation, right_to_work_status: 'yes', right_to_work_proof_provided: 'no' },
    });
    expect(shareCodeRequired.ready).toBe(false);
    expect(shareCodeRequired.missing).toContain('UK status share code recorded when required');

    const withShareCode = buildLauremVisaReadiness({
      ...base,
      invoiceStatus: 'paid',
      additionalInformation: { ...base.additionalInformation, right_to_work_status: 'yes', right_to_work_proof_provided: 'no', uk_status_share_code: 'ABC123XYZ' },
    });
    expect(withShareCode.ready).toBe(false);
    expect(withShareCode.missing).toContain('Right-to-work proof provided to CONAGS');
    expect(withShareCode.missing).not.toContain('UK status share code recorded when required');
  });

  it('gates SMS preparation and submission on readiness', () => {
    const notReady = buildLauremVisaReadiness({ ...base, invoiceStatus: 'issued' });
    const ready = buildLauremVisaReadiness({ ...base, invoiceStatus: 'paid' });

    expect(canAdvanceLauremVisaToSmsSubmission({ targetStatus: 'preparing_sms', readiness: notReady })).toBe(false);
    expect(canAdvanceLauremVisaToSmsSubmission({ targetStatus: 'submitted_to_sms', readiness: notReady })).toBe(false);
    expect(canAdvanceLauremVisaToSmsSubmission({ targetStatus: 'preparing_sms', readiness: ready })).toBe(true);
    expect(canAdvanceLauremVisaToSmsSubmission({ targetStatus: 'submitted_to_sms', readiness: ready })).toBe(true);
    expect(canAdvanceLauremVisaToSmsSubmission({ targetStatus: 'admin_review', readiness: notReady })).toBe(true);
  });
});
