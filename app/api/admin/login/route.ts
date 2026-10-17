import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminSessionCookieName, makeAdminSession } from '@/lib/admin-auth';
import { consumeAdminAuthAttempt } from '@/lib/admin-auth-throttle';
import { db } from '@/lib/db';

function requestIdentity(request: NextRequest, email: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  return `${ip}:${email}`;
}

function jsonError(message: string, status: number, retryAfterSeconds = 0) {
  const response = NextResponse.json({ error: message }, { status });
  if (retryAfterSeconds > 0) response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
}

export async function POST(request: NextRequest) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredEmail || !configuredPassword) return jsonError('Admin authentication is not configured.', 503);

  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch { return jsonError('Invalid request.', 400); }
  const email = body.email?.trim().toLowerCase() || '';
  const password = body.password || '';

  const same = (a: string, b: string) => {
    const aa = Buffer.from(a); const bb = Buffer.from(b);
    return aa.length === bb.length && timingSafeEqual(aa, bb);
  };

  const credentialsMatch = same(email, configuredEmail) && same(password, configuredPassword);
  let throttle;
  try {
    throttle = await consumeAdminAuthAttempt(db(), requestIdentity(request, email), credentialsMatch);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.auth.throttle_unavailable', reason: error instanceof Error ? error.message : 'unknown' }));
    return jsonError('Admin authentication is temporarily unavailable.', 503);
  }

  if (!throttle.allowed) return jsonError('Too many failed login attempts. Try again later.', 429, throttle.retryAfterSeconds);
  if (!credentialsMatch) return jsonError('Invalid email or password.', 401);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: adminSessionCookieName, value: makeAdminSession(configuredEmail), httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 });
  return response;
}
