import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { checkReleaseHealth } from '@/lib/laurem-release-health';
import { getRequestId, logOperationalError, withRequestId } from '@/lib/laurem-operational';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return withRequestId(NextResponse.json({ error: 'Unauthorised', requestId }, { status: 401 }), requestId);

  try {
    const health = await checkReleaseHealth(db());
    return withRequestId(NextResponse.json(health, {
      status: health.ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    }), requestId);
  } catch (error) {
    logOperationalError({ requestId, event: 'admin.system.health_failed', actor: session.email, reason: error });
    return withRequestId(NextResponse.json({
      ok: false,
      timestamp: new Date().toISOString(),
      dependencies: {
        environment: { ok: false, missing: [] },
        database: { ok: false, latencyMs: 0, error: 'Health check failed.' },
        schema: {
          ok: false,
          missing: [],
          contract: {
            ok: false,
            contractVersion: null,
            expectedTableCount: null,
            missingTables: [],
            rlsDisabledTables: [],
            missingColumns: [],
            missingIndexes: [],
            baselineMigrationPresent: false,
            latestMigration: null,
            error: 'Health check failed.',
          },
        },
        storage: { ok: false, bucketsPresent: [], missingBuckets: [], error: 'Health check failed.' },
        readiness: { ok: false, requiredFunctionCount: 0, missingFunctions: [], error: 'Health check failed.' },
      },
    }, { status: 503, headers: { 'cache-control': 'no-store' } }), requestId);
  }
}
