import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';

export const LAUREM_STAFF_COOKIE = 'laurem_staff_session';
export const STAFF_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ITERATIONS = 150000;
const KEY_LENGTH = 32;

function secret() {
  const value = process.env.STAFF_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || '';
  if (!value) throw new Error('STAFF_SESSION_SECRET or ADMIN_SESSION_SECRET must be configured.');
  return value;
}

export function requestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('base64url')) {
  const digest = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256').toString('base64url');
  return `pbkdf2_sha256$${ITERATIONS}$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, iterations, salt, digest] = stored.split('$');
  if (algorithm !== 'pbkdf2_sha256' || !iterations || !salt || !digest) return false;
  const actual = crypto.pbkdf2Sync(password, salt, Number(iterations), KEY_LENGTH, 'sha256').toString('base64url');
  return actual.length === digest.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(digest));
}

export function makeActivationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashActivationToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sign(value: string) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

export function createStaffSession(staff: { id: string; laurem_id: string; email: string; session_version: number }) {
  const payload = Buffer.from(JSON.stringify({
    staff_id: staff.id,
    laurem_id: staff.laurem_id,
    email: staff.email.trim().toLowerCase(),
    session_version: staff.session_version,
    exp: Date.now() + STAFF_SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(12).toString('base64url'),
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readStaffSession(request: NextRequest) {
  const token = request.cookies.get(LAUREM_STAFF_COOKIE)?.value;
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.staff_id && data.laurem_id && data.email && data.exp > Date.now()
      ? { ...data, token_hash: hashActivationToken(token) }
      : null;
  } catch {
    return null;
  }
}

export async function getStaffSession(req: NextRequest) {
  const token = readStaffSession(req);
  if (!token) return null;
  const client = db();
  const { data: staff } = await client
    .from('laurem_staff_profiles')
    .select('id,laurem_id,email,employment_status,activated_at,password_hash,session_version')
    .eq('id', token.staff_id)
    .maybeSingle();
  if (
    !staff
    || !['pending', 'active'].includes(staff.employment_status)
    || !staff.activated_at
    || !staff.password_hash
    || staff.session_version !== token.session_version
  ) return null;
  if ((staff.laurem_id || '') !== token.laurem_id || staff.email.trim().toLowerCase() !== token.email) return null;
  const { data: session } = await client.from('staff_portal_sessions')
    .select('id,expires_at,revoked_at')
    .eq('token_hash', token.token_hash)
    .eq('staff_id', staff.id)
    .maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
  await client.from('staff_portal_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id).is('revoked_at', null);
  return token;
}

export function setStaffSession(response: NextResponse, token: string) {
  response.cookies.set(LAUREM_STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STAFF_SESSION_TTL_SECONDS,
  });
}

export function clearStaffSession(response: NextResponse) {
  response.cookies.set(LAUREM_STAFF_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
