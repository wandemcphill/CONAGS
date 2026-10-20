import { describe, expect, it } from 'vitest';
import { EXPECTED_PORTAL_TABLES, REQUIRED_PRIVATE_BUCKETS } from '@/lib/laurem-release-health';

describe('CONAGS release health schema coverage', () => {
  it('checks every CONAGS-owned physical table used by the portal', () => {
    expect(EXPECTED_PORTAL_TABLES).toContain('legacy_contract_signatures');
    expect(EXPECTED_PORTAL_TABLES).toContain('workforce_audit_events');
    expect(EXPECTED_PORTAL_TABLES).toHaveLength(38);
    expect(REQUIRED_PRIVATE_BUCKETS).toEqual(['conags-private-documents', 'laurem-staff-photos', 'interview-recordings']);
  });
});
