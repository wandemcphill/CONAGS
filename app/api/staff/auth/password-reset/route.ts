import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashActivationToken, hashPassword } from '@/lib/laurem-staff-auth';
import { sendLauremStaffPasswordReset } from '@/lib/laurem-staff-email';

const RESET_TTL_MINUTES = 30;
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const GENERIC_MESSAGE = 'If an eligible CONAGS Staff Portal account exists for that email, a password reset link will be sent shortly.';

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashActivationToken(token) };
}

async function consumeThrottle(client: ReturnType<typeof db>, key: string, max: number, windowSeconds: number) {
  const { data, error } = await client.rpc('laurem_consume_staff_auth_attempt', {
    p_bucket_key: key,
    p_max_attempts: max,
    p_window_seconds: windowSeconds,
    p_lock_seconds: windowSeconds,
  });
  if (error) throw error;
  return Boolean(data?.allowed);
}

export async function POST(request: NextRequest) {
  const client = db();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

  try {
    if (!await consumeThrottle(client, `staff-password-reset-ip:${ip}`, 5, 900)) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });

    if (!await consumeThrottle(client, `staff-password-reset-email:${hashActivationToken(email)}`, 3, 3600)) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const { token, hash } = createResetToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString();

    const { data: resetRows, error: resetError } = await client.rpc('laurem_issue_staff_password_reset', {
      p_email: email,
      p_token_hash: hash,
      p_expires_at: expiresAt,
    });

    if (resetError) throw resetError;
    const staff = Array.isArray(resetRows) ? resetRows[0] : resetRows;
    if (!staff) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const delivery = await sendLauremStaffPasswordReset(client, staff, token);
    await client.from('laurem_staff_security_events').insert({
      staff_id: staff.staff_id,
      event_type: 'staff.password_reset.requested',
      actor: 'staff_password_reset_request',
      ip_address: ip,
      user_agent: request.headers.get('user-agent'),
      details: { delivery_status: delivery.status, expires_at: expiresAt },
    });

    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'staff.password_reset.request_failed', reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to process the password reset request right now.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const client = db();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

  try {
    if (!await consumeThrottle(client, `staff-password-reset-complete-ip:${ip}`, 8, 900)) {
      return NextResponse.json({ error: 'Too many password reset attempts. Please try again later.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!token || password.length < 10) {
      return NextResponse.json({ error: 'A valid reset link and a password of at least 10 characters are required.' }, { status: 400 });
    }

    const tokenHash = hashActivationToken(token);
    if (!await consumeThrottle(client, `staff-password-reset-token:${tokenHash}`, 5, 900)) {
      return NextResponse.json({ error: 'Too many password reset attempts. Please request a new reset link.' }, { status: 429 });
    }

    const result = await client.rpc('laurem_complete_staff_password_reset', {
      p_token_hash: tokenHash,
      p_password_hash: hashPassword(password),
    });

    if (result.error) {
      if (result.error.message?.includes('STAFF_PASSWORD_RESET_INVALID_OR_EXPIRED') || result.error.message?.includes('STAFF_PASSWORD_RESET_ALREADY_USED')) {
        return NextResponse.json({ error: 'This password reset link is invalid or has expired. Request a new reset link.' }, { status: 410 });
      }
      if (result.error.message?.includes('STAFF_PASSWORD_RESET_NOT_ELIGIBLE')) {
        return NextResponse.json({ error: 'This Staff Portal account is not currently eligible for password reset.' }, { status: 409 });
      }
      throw result.error;
    }

    return NextResponse.json({ ok: true, message: 'Your CONAGS Staff Portal password has been changed. You can now sign in with your CONAGS ID or employee number.' });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'staff.password_reset.complete_failed', reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to update the Staff Portal password.' }, { status: 500 });
  }
}
