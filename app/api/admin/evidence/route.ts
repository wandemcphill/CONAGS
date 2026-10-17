import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { getLauremOnboardingReadiness } from '@/lib/laurem-onboarding-readiness';

const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'waived', 'expired', 'superseded']);

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
  if (!applicationId) return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });

  try {
    const client = db();
    const { data: application, error: appError } = await client
      .from('recruitment_applications')
      .select('id,role_applied,living_in_uk')
      .eq('id', applicationId)
      .maybeSingle();
    if (appError) throw appError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const { data: reviews, error } = await client
      .from('recruitment_evidence_reviews')
      .select('id,application_id,evidence_type,document_id,status,reviewed_by,reviewed_at,review_note,metadata,created_at,updated_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ evidence: reviews || [], readiness: await getLauremOnboardingReadiness(client, application) });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.evidence.list_failed', actor: session.email, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to load recruitment evidence.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const applicationId = typeof body?.applicationId === 'string' ? body.applicationId : '';
  const evidenceType = typeof body?.evidenceType === 'string' ? body.evidenceType.trim() : '';
  const documentId = typeof body?.documentId === 'string' ? body.documentId : null;
  const status = typeof body?.status === 'string' ? body.status : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!applicationId || !evidenceType || !allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'applicationId, evidenceType and a valid status are required.' }, { status: 400 });
  }
  if (['rejected', 'waived'].includes(status) && !note) {
    return NextResponse.json({ error: 'A review note is required for rejected or waived evidence.' }, { status: 400 });
  }

  try {
    const client = db();
    const { data: application, error: appError } = await client
      .from('recruitment_applications')
      .select('id,role_applied,living_in_uk')
      .eq('id', applicationId)
      .maybeSingle();
    if (appError) throw appError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    if (documentId) {
      const { data: document, error: documentError } = await client
        .from('recruitment_documents')
        .select('id,application_id')
        .eq('id', documentId)
        .maybeSingle();
      if (documentError) throw documentError;
      if (!document || document.application_id !== applicationId) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    }

    const { data: review, error: reviewError } = await client.rpc('laurem_record_evidence_review', {
      p_application_id: applicationId,
      p_evidence_type: evidenceType,
      p_document_id: documentId,
      p_status: status,
      p_actor: session.email,
      p_note: note || null,
      p_metadata: typeof body?.metadata === 'object' && body.metadata !== null ? body.metadata : {},
    });
    if (reviewError) throw reviewError;

    return NextResponse.json({
      evidence: review,
      readiness: await getLauremOnboardingReadiness(client, application),
    }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.evidence.review_failed', actor: session.email, reason: error instanceof Error ? error.message : 'unknown' }));
    const message = error instanceof Error ? error.message : '';
    if (message.includes('EVIDENCE_DOCUMENT_APPLICATION_MISMATCH')) return NextResponse.json({ error: 'Evidence document does not belong to this application.' }, { status: 409 });
    return NextResponse.json({ error: 'Unable to record evidence review.' }, { status: 500 });
  }
}
