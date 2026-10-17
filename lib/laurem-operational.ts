import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function getRequestId(request: Request) {
  const candidate = request.headers.get('x-request-id')?.trim() || '';
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : `req_${randomUUID()}`;
}

export function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set('x-request-id', requestId);
  response.headers.set('cache-control', response.headers.get('cache-control') || 'no-store, max-age=0');
  return response;
}

export function operationalError(requestId: string, message: string, status: number, code = 'OPERATIONAL_ERROR') {
  const response = NextResponse.json({ error: message, code, requestId }, { status });
  return withRequestId(response, requestId);
}

function serializeOperationalReason(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object') {
    try { return JSON.stringify(reason); } catch { return 'unserializable_error'; }
  }
  return String(reason);
}

export function logOperationalError(input: { requestId: string; event: string; actor?: string | null; reason: unknown; metadata?: Record<string, unknown> }) {
  console.error(JSON.stringify({
    level: 'error',
    requestId: input.requestId,
    event: input.event,
    actor: input.actor || null,
    reason: serializeOperationalReason(input.reason),
    metadata: input.metadata || undefined,
  }));
}