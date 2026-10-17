import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ['application/pdf', ['pdf']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
  ['application/msword', ['doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx']],
]);

function extensionFor(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function signatureMatches(type: string, bytes: Buffer) {
  if (type === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'application/msword') return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return bytes.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]));
  return false;
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-invitation-token') || '';
  if (!token) return NextResponse.json({ error: 'Invitation token is required.' }, { status: 400 });
  try {
    const client = db();
    const { data: invite } = await client.from('recruitment_invites')
      .select('id,expires_at,used_at').eq('token_hash', hashToken(token)).maybeSingle();
    if (!invite) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This recruitment invitation has expired.' }, { status: 410 });
    }

    const { data: application } = await client.from('recruitment_applications').select('id').eq('invite_id', invite.id).maybeSingle();
    if (!application) return NextResponse.json({ error: 'Submit your application before uploading documents.' }, { status: 409 });

    const form = await request.formData();
    const file = form.get('file');
    const documentType = String(form.get('documentType') || 'Supporting document').trim().slice(0, 120) || 'Supporting document';
    if (!(file instanceof File)) return NextResponse.json({ error: 'A document file is required.' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'Documents must be between 1 byte and 10 MB.' }, { status: 400 });
    const extensions = allowedTypes.get(file.type);
    if (!extensions) return NextResponse.json({ error: 'Unsupported document type. Upload PDF, JPG, PNG, DOC or DOCX.' }, { status: 400 });
    if (!extensions.includes(extensionFor(file.name))) return NextResponse.json({ error: 'File extension does not match the declared document type.' }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180) || 'document';
    const path = `${application.id}/${crypto.randomUUID()}-${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!signatureMatches(file.type, bytes)) return NextResponse.json({ error: 'The uploaded file does not match its declared document type.' }, { status: 400 });
    const checksumSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const { error: uploadError } = await client.storage
      .from('laurem-private-documents')
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await client.from('recruitment_documents').insert({
      application_id: application.id,
      document_type: documentType,
      original_filename: file.name.slice(0, 255),
      storage_path: path,
      mime_type: file.type,
      file_size_bytes: file.size,
      checksum_sha256: checksumSha256,
      uploaded_by: 'candidate',
    }).select('id,document_type,original_filename,status,uploaded_at,checksum_sha256,superseded_at,superseded_by').single();
    if (error) {
      await client.storage.from('laurem-private-documents').remove([path]);
      throw error;
    }

    await client.from('recruitment_document_requests').upsert({
      application_id: application.id,
      document_type: documentType,
      status: 'uploaded',
    }, { onConflict: 'application_id,document_type' });

    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'candidate.document.upload_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to upload document.' }, { status: 500 });
  }
}
