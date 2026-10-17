import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, createStaffSession, setStaffSession, hashActivationToken, requestIp, STAFF_SESSION_TTL_SECONDS } from '@/lib/laurem-staff-auth';

const IDENTIFIER = /^[A-Z0-9-]{3,64}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.laurem_id === 'string' ? body.laurem_id.trim().toUpperCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!id || !password) return NextResponse.json({ error: 'CONAGS ID and password are required.' }, { status: 400 });
  if (!IDENTIFIER.test(id)) return NextResponse.json({ error: 'Invalid CONAGS ID or password.' }, { status: 401 });

  const ip = requestIp(req) || 'unknown';
  const client = db();
  const bucket = `staff-login:${ip}:${id}`;
  const { data: limiter, error: limiterError } = await client.rpc('laurem_consume_staff_auth_attempt', { p_bucket_key: bucket, p_max_attempts: 10, p_window_seconds: 900, p_lock_seconds: 900 });
  if (limiterError) return NextResponse.json({ error: 'Unable to process sign-in.' }, { status: 503 });
  if (!limiter?.allowed) return NextResponse.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limiter.retry_after || 900) } });

  const accountBucket = `staff-login-account:${id}`;
  const { data: accountLimiter, error: accountLimiterError } = await client.rpc('laurem_consume_staff_auth_attempt', {
    p_bucket_key: accountBucket,
    p_max_attempts: 20,
    p_window_seconds: 900,
    p_lock_seconds: 900,
  });
  if (accountLimiterError) return NextResponse.json({ error: 'Unable to process sign-in.' }, { status: 503 });
  if (!accountLimiter?.allowed) return NextResponse.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(accountLimiter.retry_after || 900) } });

  const { data: staff } = await client.from('laurem_staff_profiles')
    .select('id,laurem_id,employee_number,email,full_name,password_hash,employment_status,activated_at,session_version')
    .or(`laurem_id.eq.${id},employee_number.eq.${id}`).maybeSingle();

  if (
    !staff
    || !staff.password_hash
    || !staff.activated_at
    || !['pending', 'active'].includes(staff.employment_status)
    || !verifyPassword(password, staff.password_hash)
  ) {
    await client.from('laurem_staff_security_events').insert({
      staff_id: staff?.id || null,
      event_type: 'staff.login.failed',
      actor: staff?.email || id,
      ip_address: ip,
      user_agent: req.headers.get('user-agent'),
      details: { reason: 'invalid_credentials_or_inactive_account' },
    });
    return NextResponse.json({ error: 'Invalid CONAGS ID or password.' }, { status: 401 });
  }

  const token = createStaffSession({ id: staff.id, laurem_id: staff.laurem_id || staff.employee_number, email: staff.email, session_version: staff.session_version });
  const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_SECONDS * 1000).toISOString();
  const { error: sessionError } = await client.from('laurem_staff_portal_sessions').insert({ staff_id: staff.id, token_hash: hashActivationToken(token), expires_at: expiresAt, ip_address: ip, user_agent: req.headers.get('user-agent') });
  if (sessionError) return NextResponse.json({ error: 'Unable to create staff session.' }, { status: 500 });

  const now = new Date().toISOString();
  await client.from('laurem_staff_profiles').update({ last_login_at: now, updated_at: now }).eq('id', staff.id);
  await client.from('laurem_staff_security_events').insert({ staff_id: staff.id, event_type: 'staff.login.succeeded', actor: staff.email, ip_address: ip, user_agent: req.headers.get('user-agent'), details: {} });
  const response = NextResponse.json({ ok: true, staff: { laurem_id: staff.laurem_id || staff.employee_number, full_name: staff.full_name } });
  setStaffSession(response, token);
  return response;
}
