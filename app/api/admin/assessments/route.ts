import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { getRequestId, operationalError, withRequestId } from '@/lib/laurem-operational';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') || 50);
  const requestedOffset = Number(url.searchParams.get('offset') || 0);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 50;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;

  try {
    const client = db();

    const countResult = await client
      .from('interview_attempts')
      .select('id', { count: 'exact', head: true });
    if (countResult.error) throw countResult.error;

    const attemptsResult = await client
      .from('interview_attempts')
      .select('id,application_id,round,role,pathway,question_ids,question_snapshot,answers,status,score,total_questions,pass_percent,percent,second_interview_id,started_at,submitted_at,created_at,updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (attemptsResult.error) throw attemptsResult.error;

    const attempts = attemptsResult.data || [];
    const applicationIds = [...new Set(attempts.map((attempt: any) => attempt.application_id).filter(Boolean))];

    const applicationsResult = applicationIds.length
      ? await client
          .from('recruitment_applications')
          .select('id,full_name,email,role_applied,status,country_of_residence,living_in_uk')
          .in('id', applicationIds)
      : { data: [], error: null };

    if (applicationsResult.error) throw applicationsResult.error;

    const applications = new Map((applicationsResult.data || []).map((application: any) => [application.id, application]));

    const rows = attempts.map((attempt: any) => ({
      ...attempt,
      application: applications.get(attempt.application_id) || null,
    }));

    return withRequestId(NextResponse.json({
      assessments: rows,
      total: countResult.count || 0,
      limit,
      offset,
      hasMore: offset + rows.length < (countResult.count || 0),
    }), requestId);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.assessments.list_failed',
      actor: session.email,
      reason: error instanceof Error ? error.message : String(error),
      limit,
      offset,
    }));
    return operationalError(requestId, 'Unable to load recruitment assessments.', 500, 'ASSESSMENTS_LOAD_FAILED');
  }
}
