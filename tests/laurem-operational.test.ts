import { describe, expect, it } from 'vitest';
import { getRequestId, operationalError } from '@/lib/laurem-operational';

describe('CONAGS operational request correlation', () => {
  it('accepts safe incoming request ids', () => {
    const request = new Request('https://example.test/api', { headers: { 'x-request-id': 'release-42' } });
    expect(getRequestId(request)).toBe('release-42');
  });

  it('replaces malformed incoming request ids with generated ids', () => {
    const request = new Request('https://example.test/api', { headers: { 'x-request-id': 'bad id with spaces' } });
    expect(getRequestId(request)).toMatch(/^req_/);
  });

  it('returns a stable operator-safe error contract with a request id', async () => {
    const response = operationalError('release-42', 'Service is not ready.', 503, 'RELEASE_NOT_READY');
    expect(response.status).toBe(503);
    expect(response.headers.get('x-request-id')).toBe('release-42');
    expect(await response.json()).toEqual({ error: 'Service is not ready.', code: 'RELEASE_NOT_READY', requestId: 'release-42' });
  });
});
