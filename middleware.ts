import { NextRequest, NextResponse } from 'next/server';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function middleware(request: NextRequest) {
  const incoming = request.headers.get('x-request-id')?.trim() || '';
  const requestId = REQUEST_ID_PATTERN.test(incoming) ? incoming : `req_${crypto.randomUUID()}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  if (request.nextUrl.pathname.startsWith('/api/staff/')) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return response;
}

export const config = { matcher: ['/api/:path*'] };