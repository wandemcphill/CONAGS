import { NextRequest, NextResponse } from 'next/server';
import { getRequestId, withRequestId } from '@/lib/laurem-operational';

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
  return withRequestId(NextResponse.json({
    ok: true,
    service: 'conags-care',
    timestamp: new Date().toISOString(),
    commit: releaseCommit(),
  }, { status: 200 }), requestId);
}
