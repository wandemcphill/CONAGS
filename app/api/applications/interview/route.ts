import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';
import { getLauremCalmFirstInterviewQuestions } from '@/lib/laurem-calm-interviews';
import type { NursePathway } from '@/lib/laurem-nurse-interviews';

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-invitation-token') || '';
  if (!token) return NextResponse.json({ error: 'Invitation token is required.' }, { status: 400 });

  let body: { pathway?: NursePathway; answers?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const answers = body.answers || {};
  const client = db();

  try {
    const { data: invite, error: inviteError } = await client
      .from('recruitment_invites')
      .select('id,role,expires_at')
      .eq('token_hash', hashToken(token))
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This invitation has expired.' }, { status: 410 });
    }
    if (invite.role && !/nurse/i.test(invite.role)) {
      return NextResponse.json({ error: 'This invitation is not for a nursing application.' }, { status: 400 });
    }

    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id,role_applied,invite_id,living_in_uk')
      .eq('invite_id', invite.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) {
      return NextResponse.json({ error: 'Please submit your application before completing the nursing interview.' }, { status: 409 });
    }
    if (!/nurse/i.test(application.role_applied || '')) {
      return NextResponse.json({ error: 'This application is not for a nursing role.' }, { status: 400 });
    }

    const pathway: NursePathway = application.living_in_uk === 'No' ? 'international' : 'uk';
    const questions = getLauremCalmFirstInterviewQuestions(pathway);
    for (const question of questions) {
      if (typeof answers[question.id] !== 'string' || !answers[question.id].trim()) {
        return NextResponse.json({ error: `Please answer question ${question.id}.` }, { status: 400 });
      }
      if (answers[question.id].length > 6000) {
        return NextResponse.json({ error: 'One or more answers are too long.' }, { status: 400 });
      }
    }

    const { data: existing } = await client
      .from('recruitment_nurse_interview_responses')
      .select('id')
      .eq('application_id', application.id)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'Your nursing interview has already been submitted.' }, { status: 409 });

    const { error } = await client.from('recruitment_nurse_interview_responses').insert({
      invite_id: invite.id,
      application_id: application.id,
      pathway,
      answers,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, application_id: application.id }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'nurse_interview.submit_failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to submit the nursing interview right now.' }, { status: 500 });
  }
}
