import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';

const SIGNED_URL_TTL_SECONDS = 300;
const ATTESTATION = 'I confirm that I have read this document, understand it, and agree to sign it electronically.';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const client = db();
  const { data: document, error } = await client.from('laurem_staff_documents')
    .select('id,staff_id,category,title,description,original_filename,mime_type,file_size_bytes,storage_path,content_text,document_sha256,status,requires_signature,signature_status,signature_name,signature_method,signed_at,signature_attestation,issuer_name,issuer_title,employer_name,issued_at,first_viewed_at,last_viewed_at,viewed_count')
    .eq('id', id).eq('staff_id', session.staff_id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load document.' }, { status: 500 });
  if (!document || document.status !== 'issued') return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  if (document.category === 'visa_sponsorship') {
    const { data: visaCase } = await client.from('laurem_staff_visa_cases')
      .select('status')
      .eq('staff_id', session.staff_id)
      .not('status', 'in', '(declined,withdrawn)')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!visaCase || !['cos_assigned', 'completed'].includes(visaCase.status)) {
      return NextResponse.json({ error: 'The Certificate of Sponsorship is not active yet.' }, { status: 409 });
    }
  }

  const now = new Date().toISOString();
  await client.from('laurem_staff_documents').update({ first_viewed_at: document.first_viewed_at || now, last_viewed_at: now, viewed_count: Number(document.viewed_count || 0) + 1, updated_at: now }).eq('id', id).eq('staff_id', session.staff_id);
  await client.from('laurem_staff_document_events').insert({ document_id: id, staff_id: session.staff_id, event_type: 'viewed', actor_type: 'staff', actor: session.email, metadata: { document_sha256: document.document_sha256 } });

  let previewUrl: string | null = null;
  if (document.storage_path) {
    const { data: signed, error: signedError } = await client.storage.from('laurem-private-documents').createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signedError) return NextResponse.json({ error: 'Unable to prepare document preview.' }, { status: 500 });
    previewUrl = signed?.signedUrl || null;
  }
  return NextResponse.json({
    document: {
      ...document,
      requires_signature: document.category === 'job_description' || document.requires_signature,
      signature_status: document.category === 'job_description' && document.signature_status === 'not_required' ? 'pending' : document.signature_status,
      content_text: document.storage_path ? null : document.content_text,
      previewUrl,
    },
    attestation: ATTESTATION,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const signedName = typeof body?.signedName === 'string' ? body.signedName.trim() : '';
  const signatureData = typeof body?.signatureData === 'string' ? body.signatureData.trim() : null;
  const attestation = typeof body?.attestation === 'string' ? body.attestation.trim() : '';
  if (!signedName || !attestation) return NextResponse.json({ error: 'Your full name and electronic signature attestation are required.' }, { status: 400 });
  if (signatureData && signatureData.length > 300000) return NextResponse.json({ error: 'Signature drawing is too large.' }, { status: 400 });
  try {
    const client = db();
    const { data: document } = await client.from('laurem_staff_documents')
      .select('category,status')
      .eq('id', id)
      .eq('staff_id', session.staff_id)
      .maybeSingle();
    if (!document || document.status !== 'issued') return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    if (document.category === 'visa_sponsorship') {
      const { data: visaCase } = await client.from('laurem_staff_visa_cases')
        .select('status')
        .eq('staff_id', session.staff_id)
        .not('status', 'in', '(declined,withdrawn)')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!visaCase || !['cos_assigned', 'completed'].includes(visaCase.status)) {
        return NextResponse.json({ error: 'The Certificate of Sponsorship is not active yet.' }, { status: 409 });
      }
    }
    const { data, error } = await client.rpc('laurem_sign_staff_document', {
      p_document_id: id, p_staff_id: session.staff_id, p_signed_name: signedName, p_signature_data: signatureData || null, p_attestation: attestation, p_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, p_user_agent: request.headers.get('user-agent') || null,
    });
    if (error) throw error;
    return NextResponse.json(data || { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const known = { DOCUMENT_NOT_FOUND:404, STAFF_NOT_FOUND:404, STAFF_NOT_ELIGIBLE:409, DOCUMENT_UNAVAILABLE:409, SIGNATURE_NOT_REQUIRED:409, DOCUMENT_ALREADY_SIGNED:409, DOCUMENT_NOT_SIGNABLE:409, NAME_REQUIRED:400, NAME_TOO_LONG:400, ATTESTATION_REQUIRED:400, ATTESTATION_INVALID:400 } as Record<string,number>;
    const key = Object.keys(known).find((item) => message.includes(item));
    return NextResponse.json({ error: key ? message : 'Unable to sign this document.' }, { status: key ? known[key] : 409 });
  }
}