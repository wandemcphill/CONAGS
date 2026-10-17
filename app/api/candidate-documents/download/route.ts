import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';
import { lauremCompany } from '@/lib/laurem-company-config';
import { renderLauremPrintableHtml } from '@/lib/laurem-document-renderer';

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
}

function filename(title: string) {
  return (
    title
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() + '.html'
  );
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const token = params.get('token')?.trim() || '';
    const documentId = params.get('documentId')?.trim() || '';
    if (!token || !documentId) return NextResponse.json({ error: 'Document token and document id are required.' }, { status: 400 });

    const client = db();
    const { data: pack, error: packError } = await client
      .from('laurem_candidate_document_packs')
      .select('id,status,expires_at')
      .eq('token_hash', hashToken(token))
      .maybeSingle();
    if (packError) throw packError;
    if (!pack) return NextResponse.json({ error: 'Document pack not found.' }, { status: 404 });
    if (pack.status === 'pending' && new Date(pack.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This document pack has expired.' }, { status: 410 });
    }
    if (pack.status === 'revoked' || pack.status === 'expired') {
      return NextResponse.json({ error: 'This document pack is no longer available.' }, { status: 409 });
    }

    const { data: document, error: documentError } = await client
      .from('laurem_candidate_documents')
      .select('id,document_type,title,content_text,signature_status,signature_name,signed_at')
      .eq('id', documentId)
      .eq('pack_id', pack.id)
      .maybeSingle();
    if (documentError) throw documentError;
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    if (document.signature_status !== 'signed') {
      return NextResponse.json({ error: 'Sign this document online before downloading the signed copy.' }, { status: 409 });
    }

    await client.from('laurem_candidate_document_events').insert({
      pack_id: pack.id,
      document_id: document.id,
      application_id: (await client.from('laurem_candidate_document_packs').select('application_id').eq('id', pack.id).single()).data?.application_id,
      event_type: 'viewed',
      actor_type: 'candidate',
      actor: 'candidate',
      metadata: { action: 'download_signed_copy' },
    });

    const html = renderLauremPrintableHtml({
      documentType: document.document_type as 'job_description' | 'handbook',
      title: document.title,
      content: document.content_text,
      assetBaseUrl: appUrl(),
      signature: {
        name: document.signature_name,
        signedAt: document.signed_at,
      },
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename(document.title) + '"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'candidate_document_download_failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to download the signed document.' }, { status: 500 });
  }
}
