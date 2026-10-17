import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearStaffSession, getStaffSession, hashPassword, verifyPassword } from '@/lib/laurem-staff-auth';
import { recordLauremAuditEvent } from '@/lib/laurem-audit';

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Your Staff Portal session is no longer active. Please sign in again.' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword || newPassword.length < 10) {
    return NextResponse.json({ error: 'Current password and a new password of at least 10 characters are required.' }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: 'Your new password must be different from your current password.' }, { status: 400 });
  }

  const client = db();
  const { data: staff, error: staffError } = await client
    .from('laurem_staff_profiles')
    .select('id,application_id,laurem_id,email,password_hash,employment_status,activated_at,session_version')
    .eq('id', session.staff_id)
    .maybeSingle();

  if (staffError) return NextResponse.json({ error: 'Unable to verify your account right now.' }, { status: 503 });
  if (!staff || staff.employment_status !== 'active' || !staff.activated_at || !staff.password_hash || !verifyPassword(currentPassword, staff.password_hash)) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
  }

  const { error } = await client.rpc('laurem_change_staff_password', {
    p_staff_id: staff.id,
    p_password_hash: hashPassword(newPassword),
    p_expected_session_version: session.session_version,
  });

  if (error) {
    const message = error.message || '';
    if (message.includes('STAFF_PASSWORD_CHANGE_SESSION_CHANGED')) {
      return NextResponse.json({ error: 'Your session changed while this request was being processed. Please sign in again.' }, { status: 409 });
    }
    if (message.includes('STAFF_PASSWORD_CHANGE_NOT_ELIGIBLE')) {
      return NextResponse.json({ error: 'This Staff Portal account is not currently eligible to change its password.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to change your password right now.' }, { status: 500 });
  }

  await recordLauremAuditEvent({ lifecycleArea: 'staff_account', entityType: 'staff_profile', entityId: staff.id, staffId: staff.id, applicationId: staff.application_id, actorType: 'staff', actor: staff.email, action: 'password_changed', reason: 'Staff member changed the Staff Portal password through an authenticated session.' });

  const response = NextResponse.json({
    ok: true,
    message: 'Your Staff Portal password has been changed. All existing sessions were signed out for security. Please sign in again.',
  });
  clearStaffSession(response);
  return response;
}
