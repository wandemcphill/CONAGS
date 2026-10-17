import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { renderLauremPrintableHtml } from '@/lib/laurem-document-renderer';

const BUCKET = 'laurem-private-documents';

function safeFilename(value: string, mimeType: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 180) || 'laurem-document';

  if (/[.][A-Za-z0-9]{1,8}$/.test(cleaned)) return cleaned;

  const extension =
    mimeType === 'application/pdf' ? '.pdf' :
    mimeType === 'text/markdown' ? '.md' :
    mimeType === 'text/plain' ? '.txt' :
    mimeType === 'image/png' ? '.png' :
    mimeType === 'image/jpeg' ? '.jpg' :
    '';

  return cleaned + extension;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const client = db();
  const { data: document, error } = await client
    .from('laurem_staff_documents')
    .select('id,staff_id,title,category,original_filename,mime_type,storage_path,content_text,document_sha256,status,signature_status,signature_name,signed_at,issued_at')
    .eq('id', id)
    .eq('staff_id', session.staff_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Unable to load document.' }, { status: 500 });
  if (!document || document.status !== 'issued') {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }
  if (document.category === 'visa_sponsorship') {
    const { data: visaCase } = await client.from('laurem_staff_visa_cases')
      .select('status')
      .eq('staff_id', session.staff_id)
      .not('status', 'in', '(declined,withdrawn)')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!visaCase || !['cos_assigned', 'completed'].includes(visaCase.status)) {
      return NextResponse.json({ error: 'The Certificate of Sponsorship is not active for download yet.' }, { status: 409 });
    }
  }
  if (!document.storage_path && typeof document.content_text !== 'string') {
    return NextResponse.json({ error: 'This document is not available for download.' }, { status: 409 });
  }

  let body: Blob;
  if (document.storage_path) {
    const { data, error: downloadError } = await client.storage.from(BUCKET).download(document.storage_path);
    if (downloadError || !data) {
      return NextResponse.json({ error: 'Unable to prepare the document download.' }, { status: 500 });
    }
    body = data;
  } else {
    body = new Blob([document.content_text ?? ''], { type: document.mime_type || 'text/plain;charset=utf-8' });
  }

  const now = new Date().toISOString();
  await client
    .from('laurem_staff_documents')
    .update({ downloaded_at: now, updated_at: now })
    .eq('id', id)
    .eq('staff_id', session.staff_id);

  await client.from('laurem_staff_document_events').insert({
    document_id: id,
    staff_id: session.staff_id,
    event_type: 'downloaded',
    actor_type: 'staff',
    actor: session.email,
    metadata: {
      document_sha256: document.document_sha256,
      signature_status: document.signature_status,
      downloaded_at: now,
    },
  });

  const brandedTextDocument =
    !document.storage_path &&
    typeof document.content_text === 'string' &&
    (document.title.toLowerCase().includes('handbook') || document.title.toLowerCase().includes('job description'));

  if (brandedTextDocument) {
    const html = renderLauremPrintableHtml({
      documentType: document.title.toLowerCase().includes('handbook') ? 'handbook' : 'job_description',
      title: document.title,
      content: document.content_text,
      assetBaseUrl: new URL(request.url).origin,
      signature: document.signature_status === 'signed'
        ? { name: document.signature_name, signedAt: document.signed_at }
        : null,
    });
    const htmlFilename = safeFilename(
      document.title + (document.signature_status === 'signed' ? ' - Signed' : ''),
      'text/html',
    ).replace(/.(txt|md)$/i, '') + '.html';

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + htmlFilename.replace(/"/g, '') + '"',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const baseFilename = document.original_filename ||
    document.title + (document.signature_status === 'signed' ? ' - Signed' : '');
  const filename = safeFilename(baseFilename, document.mime_type || 'application/octet-stream');
  const encodedFilename = encodeURIComponent(filename);
  const disposition = 'attachment; filename="' + filename.replace(/"/g, '') +
    '"; filename*=UTF-8\'\'' + encodedFilename;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': document.mime_type || 'application/octet-stream',
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
