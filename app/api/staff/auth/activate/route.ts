import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createStaffSession, hashActivationToken, setStaffSession, requestIp, STAFF_SESSION_TTL_SECONDS } from '@/lib/laurem-staff-auth';
import { ensureLauremMailbox } from '@/lib/laurem-messaging';

function activationResponse(
  body: Record<string, unknown>,
  status = 200,
): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const token = params.get('token')?.trim() || '';
  const email = params.get('email')?.trim().toLowerCase() || '';
  if (!token || !email) {
    return activationResponse(
      { ok: false, code: 'ACTIVATION_INVALID', error: 'This activation link is incomplete.' },
      400,
    );
  }

  const client = db();
  const tokenHash = hashActivationToken(token);
  const { data: candidate } = await client.from('laurem_staff_profiles')
    .select('id,activated_at,activation_expires_at,password_hash')
    .eq('email', email)
    .eq('activation_token_hash', tokenHash)
    .maybeSingle();

  if (candidate) {
    if (candidate.activated_at || candidate.password_hash) {
      return activationResponse({
        ok: false,
        code: 'ACTIVATION_USED',
        error: 'This activation link has already been used. Please sign in to your CONAGS Staff Portal.',
        loginUrl: '/staff/login?activation=used',
      }, 409);
    }
    if (!candidate.activation_expires_at || new Date(candidate.activation_expires_at).getTime() <= Date.now()) {
      return activationResponse(
        { ok: false, code: 'ACTIVATION_EXPIRED', error: 'This activation link has expired. Please request a new activation link.' },
        410,
      );
    }
    return activationResponse({ ok: true, status: 'ready' });
  }

  // Do not reveal whether the supplied email belongs to an existing staff account.
  return activationResponse(
    { ok: false, code: 'ACTIVATION_INVALID', error: 'This activation link is invalid or expired.' },
    400,
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!token || !email || password.length < 10) {
    return activationResponse(
      { error: 'A valid activation token, email and password of at least 10 characters are required.' },
      400,
    );
  }

  const client = db();
  const activationTokenHash = hashActivationToken(token);
  const { data: candidate } = await client.from('laurem_staff_profiles')
    .select('id,laurem_id,employee_number,email,session_version')
    .eq('email', email)
    .eq('activation_token_hash', activationTokenHash)
    .maybeSingle();

  // Keep invalid-token responses uniform so activation does not become an account-enumeration oracle.
  if (!candidate) {
    return activationResponse({ error: 'This activation link is invalid or expired.' }, 400);
  }

  const expectedSessionVersion = Math.max(candidate.session_version || 1, 1);
  const tokenForSession = createStaffSession({
    id: candidate.id,
    laurem_id: candidate.laurem_id || candidate.employee_number,
    email: candidate.email,
    session_version: expectedSessionVersion + 1,
  });
  const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_SECONDS * 1000).toISOString();

  const { data: updated, error } = await client.rpc('laurem_activate_staff_account_with_session', {
    p_email: email,
    p_token_hash: activationTokenHash,
    p_password_hash: hashPassword(password),
    p_session_token_hash: hashActivationToken(tokenForSession),
    p_session_expires_at: expiresAt,
    p_expected_session_version: expectedSessionVersion,
    p_ip_address: requestIp(req),
    p_user_agent: req.headers.get('user-agent'),
  });
  if (error || !updated) {
    const reason = error?.message || '';
    if (reason.includes('ACTIVATION_USED') || reason.includes('ACTIVATION_INVALID') || reason.includes('ACTIVATION_EXPIRED') || reason.includes('ACTIVATION_CHANGED')) {
      const used = reason.includes('ACTIVATION_USED');
      return activationResponse({
        ok: false,
        code: used ? 'ACTIVATION_USED' : 'ACTIVATION_INVALID',
        error: used
          ? 'This activation link has already been used. Please sign in to your CONAGS Staff Portal.'
          : 'This activation link is invalid or expired. Please request a new activation link.',
        ...(used ? { loginUrl: '/staff/login?activation=used' } : {}),
      }, used ? 409 : 400);
    }
    return activationResponse({ error: 'Unable to activate staff account.' }, 500);
  }

  const mailbox = await ensureLauremMailbox(client, updated);
  const response = activationResponse({
    ok: true,
    staff: {
      laurem_id: updated.laurem_id || updated.employee_number,
      address: mailbox ? mailbox.handle + '@' + mailbox.namespace : null,
    },
  });
  setStaffSession(response, tokenForSession);
  return response;
}
