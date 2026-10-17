import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { ensureLauremOnboardingReadiness, getLauremOnboardingReadiness, LAUREM_STAFF_LIFECYCLE_READINESS_KEYS } from '@/lib/laurem-onboarding-readiness';
import { readinessKeyForEvidenceType } from '@/lib/laurem-evidence';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
  if (!applicationId) return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });
  try {
    const client = db();
    const { data: application, error } = await client.from('recruitment_applications').select('id,status,role_applied,living_in_uk').eq('id', applicationId).maybeSingle();
    if (error) throw error;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    return NextResponse.json(await getLauremOnboardingReadiness(client, application));
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.onboarding.readiness_get_failed', actor: session.email, reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to load onboarding readiness.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
  if (!applicationId) return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const itemKey = typeof body?.itemKey === 'string' ? body.itemKey : '';
  const status = typeof body?.status === 'string' ? body.status : '';
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!itemKey || !['pending', 'completed', 'waived'].includes(status)) return NextResponse.json({ error: 'A valid itemKey and status are required.' }, { status: 400 });
  if (status === 'waived' && !notes) return NextResponse.json({ error: 'A note is required when waiving a readiness item.' }, { status: 400 });

  try {
    const client = db();
    const { data: application, error: appError } = await client.from('recruitment_applications').select('id,status,role_applied,living_in_uk').eq('id', applicationId).maybeSingle();
    if (appError) throw appError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    await ensureLauremOnboardingReadiness(client, application);

    const { data: item, error: itemError } = await client.from('recruitment_onboarding_checklist').select('id,required,status').eq('application_id', applicationId).eq('item_key', itemKey).maybeSingle();
    if (itemError) throw itemError;
    if (!item) return NextResponse.json({ error: 'Readiness item not found.' }, { status: 404 });
    if (!LAUREM_STAFF_LIFECYCLE_READINESS_KEYS.has(itemKey)) {
      return NextResponse.json({ error: 'This checklist item is informational and cannot block staff contract or portal lifecycle operations.' }, { status: 400 });
    }
    if (status === 'waived' && !item.required) return NextResponse.json({ error: 'Optional readiness items cannot be waived.' }, { status: 400 });

    const { data: evidenceRows, error: evidenceError } = await client.from('recruitment_evidence_reviews').select('id,evidence_type,status,created_at').eq('application_id', applicationId).in('status', ['pending', 'approved', 'waived']).order('created_at', { ascending: false });
    if (evidenceError) throw evidenceError;
    const hasAuthoritativeEvidence = (evidenceRows || []).some((review) => readinessKeyForEvidenceType(review.evidence_type) === itemKey);
    if (hasAuthoritativeEvidence) return NextResponse.json({ error: 'This readiness item is controlled by the recruitment evidence lifecycle. Review or replace the underlying evidence instead of editing the checklist directly.' }, { status: 409 });

    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    const completedBy = status === 'completed' || status === 'waived' ? session.email : null;
    const { data, error } = await client.from('recruitment_onboarding_checklist').update({ status, completed_at: completedAt, completed_by: completedBy, notes: notes || null, updated_at: new Date().toISOString() }).eq('id', item.id).select('*').single();
    if (error) throw error;

    const { error: historyError } = await client.from('recruitment_status_history').insert({ application_id: applicationId, from_status: application.status || null, to_status: application.status || 'Onboarding', changed_by: session.email, note: `Onboarding readiness item ${itemKey} changed from ${item.status} to ${status}` });
    if (historyError) throw historyError;

    return NextResponse.json({ item: data, ...(await getLauremOnboardingReadiness(client, application)) });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.onboarding.readiness_update_failed', actor: session.email, reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to update onboarding readiness.' }, { status: 500 });
  }
}
