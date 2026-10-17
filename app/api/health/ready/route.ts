import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestId, operationalError, withRequestId } from '@/lib/laurem-operational';
import { REQUIRED_ENVIRONMENT } from '@/lib/laurem-release-health';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function releaseCommit() {
  return process.env.RENDER_GIT_COMMIT
    || process.env.RENDER_GIT_COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GIT_COMMIT_SHA
    || null;
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const started = Date.now();
  const missingEnvironment = REQUIRED_ENVIRONMENT.filter((key) => !process.env[key]?.trim());
  try {
    if (missingEnvironment.length > 0) {
      return operationalError(requestId, 'Service is not ready.', 503, 'RELEASE_NOT_READY');
    }
    const client = db();
    const { error } = await client.from('recruitment_applications').select('id', { head: true, count: 'exact' });
    if (error) throw error;
    const { data: readiness, error: readinessError } = await client.rpc('laurem_verify_release_readiness');
    if (readinessError || !readiness || typeof readiness !== 'object' || (readiness as Record<string, unknown>).ok !== true) {
      throw readinessError || new Error('RELEASE_READINESS_FAILED');
    }
    return withRequestId(NextResponse.json({
      ok: true,
      service: 'conags-care',
      timestamp: new Date().toISOString(),
      commit: releaseCommit(),
      database: { ok: true, latencyMs: Date.now() - started },
      release: { ok: true },
    }, { status: 200 }), requestId);
  } catch (error) {
    return operationalError(requestId, 'Service is not ready.', 503, 'RELEASE_NOT_READY');
  }
}
