import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';

const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Document id is required.' }, { status: 400 });

  try {
    const client = db();
    const { data: document, error } = await client
      .from('recruitment_documents')
      .select('id,storage_path,original_filename,mime_type')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

    const { data: signed, error: signedError } = await client.storage
      .from('laurem-private-documents')
      .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: document.original_filename,
      });

    if (signedError || !signed?.signedUrl) throw signedError || new Error('Unable to create signed URL.');

    return NextResponse.json({
      document: {
        id: document.id,
        filename: document.original_filename,
        mimeType: document.mime_type,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        url: signed.signedUrl,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.document.download_url_failed',
      actor: session.email,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to prepare document download.' }, { status: 500 });
  }
}
