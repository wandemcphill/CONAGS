import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const applicationId = new URL(request.url).searchParams.get('applicationId');
  if (!applicationId) return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });
  try {
    const { data, error } = await db().from('recruitment_documents')
      .select('id,application_id,document_request_id,document_type,original_filename,mime_type,file_size_bytes,status,uploaded_by,uploaded_at,reviewed_by,reviewed_at,review_note,superseded_at,superseded_by,checksum_sha256')
      .eq('application_id', applicationId).order('uploaded_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ documents: data || [] });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.documents.list_failed', actor: session.email, reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to load documents.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Document id is required.' }, { status: 400 });
  const body = await request.json().catch(() => null) as { status?: string; reviewNote?: string; metadata?: unknown } | null;
  const status = body?.status || '';
  if (!['pending','approved','rejected'].includes(status)) return NextResponse.json({ error: 'Invalid document status.' }, { status: 400 });
  const note = typeof body?.reviewNote === 'string' ? body.reviewNote.trim() : '';
  if (status === 'rejected' && !note) return NextResponse.json({ error: 'A review note is required when rejecting a document.' }, { status: 400 });

  try {
    const client = db();
    const { data: document, error: documentError } = await client.from('recruitment_documents')
      .select('id,application_id,document_request_id,document_type,original_filename,mime_type,file_size_bytes,status,uploaded_by,uploaded_at,reviewed_by,reviewed_at,review_note,superseded_at,superseded_by,checksum_sha256')
      .eq('id', id).maybeSingle();
    if (documentError) throw documentError;
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

    const { data: review, error: reviewError } = await client.rpc('laurem_record_evidence_review', {
      p_application_id: document.application_id,
      p_evidence_type: document.document_type,
      p_document_id: document.id,
      p_status: status,
      p_actor: session.email,
      p_note: note || null,
      p_metadata: typeof body?.metadata === 'object' && body.metadata !== null ? body.metadata : {},
    });
    if (reviewError) throw reviewError;

    const { data: updated, error: updatedError } = await client.from('recruitment_documents')
      .select('id,application_id,document_request_id,document_type,original_filename,mime_type,file_size_bytes,status,uploaded_by,uploaded_at,reviewed_by,reviewed_at,review_note,superseded_at,superseded_by,checksum_sha256')
      .eq('id', document.id).single();
    if (updatedError) throw updatedError;

    return NextResponse.json({ document: updated, evidence: review });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin.document.review_failed', actor: session.email, reason: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to review document.' }, { status: 500 });
  }
}
