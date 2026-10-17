import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { createAndSendLauremInvite } from '@/lib/laurem-recruitment-invites';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32_000) {
    return NextResponse.json({ error: 'Request payload is too large.' }, { status: 413 });
  }

  let body: { candidateName?: string; candidateEmail?: string; role?: string };
  try {
    body = JSON.parse(raw) as { candidateName?: string; candidateEmail?: string; role?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const candidateName = body.candidateName?.trim() || '';
  const candidateEmail = body.candidateEmail?.trim().toLowerCase() || '';
  const role = normalizeLauremRole(body.role);
  if (!candidateName || !candidateEmail) {
    return NextResponse.json({ error: 'Candidate name and email are required.' }, { status: 400 });
  }
  if (!role) return NextResponse.json({ error: 'Invalid CONAGS recruitment role.' }, { status: 400 });

  try {
    const result = await createAndSendLauremInvite(
      { candidateName, candidateEmail, role },
      session.email,
    );

    return NextResponse.json({
      invite: result.invite,
      link: result.link,
      role: result.role,
      email: {
        status: result.email.status,
        attempts: result.email.attempts,
        providerId: result.email.providerId,
        deliveryId: result.email.deliveryId,
        ...(result.email.status === 'failed' ? { error: result.email.error } : {}),
      },
    }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.invite.create_failed',
      actor: session.email,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to create invitation.' }, { status: 500 });
  }
}
