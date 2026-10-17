import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { sendLauremEmail } from '@/lib/laurem-email';
import { lauremCompany } from '@/lib/laurem-company-config';
import { renderLauremJobDescription } from '@/lib/laurem-job-description';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { assertLauremVisaCoSAssignment, isLauremVisaStatus, type LauremVisaStatus } from '@/lib/laurem-visa-lifecycle';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf','text/plain','text/markdown','image/png','image/jpeg']);
function clean(value: FormDataEntryValue | null) { return typeof value === 'string' ? value.trim() : ''; }
function appUrl() { return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''); }
function hashBytes(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }

export async function GET(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staffId } = await params;
  const client = db();
  const [{ data: staff, error: staffError }, { data: documents, error: documentError }] = await Promise.all([
    client.from('staff_profiles').select('id,laurem_id,employee_number,full_name,email,job_title,employment_status').eq('id', staffId).maybeSingle(),
    client.from('staff_documents').select('id,staff_id,category,title,description,original_filename,mime_type,file_size_bytes,status,requires_signature,signature_status,signature_name,signed_at,issuer_name,issuer_title,employer_name,issued_by_actor,issued_at,first_viewed_at,last_viewed_at,viewed_count').eq('staff_id', staffId).order('issued_at',{ascending:false}),
  ]);
  if (staffError || documentError) return NextResponse.json({ error: 'Unable to load staff employment documents.' }, { status: 500 });
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  return NextResponse.json({ staff, documents: documents || [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staffId } = await params;
  try {
    const form = await request.formData();
    const title = clean(form.get('title'));
    const category = clean(form.get('category'));
    const description = clean(form.get('description'));
    const template = clean(form.get('template'));
    const contentInput = clean(form.get('content')) || null;
    const content = template === 'job_description' ? null : contentInput;
    const requiresSignature = category === 'job_description' || template === 'job_description' || clean(form.get('requiresSignature')) === 'true';
    const fileEntry = form.get('file');
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
    if (!title) return NextResponse.json({ error: 'Document title is required.' }, { status: 400 });
    if (!['contract','job_description','offer_letter','policy','handbook','payslip','compliance','visa_sponsorship','other'].includes(category)) return NextResponse.json({ error: 'Invalid document category.' }, { status: 400 });
    if (!file && !content && template !== 'job_description') return NextResponse.json({ error: 'Provide document content, select the job description template, or upload a PDF/file.' }, { status: 400 });
    if (file && file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'Files must be 10 MB or smaller.' }, { status: 400 });
    if (file && !ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Upload a PDF, text, Markdown, PNG or JPEG document. Text content can also be entered directly.' }, { status: 400 });

    const client = db();
    const { data: staff, error: staffError } = await client.from('staff_profiles').select('id,full_name,email,job_title,employment_status').eq('id', staffId).maybeSingle();
    if (staffError) throw staffError;
    if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    if (!['pending','active'].includes(staff.employment_status)) return NextResponse.json({ error: 'Documents can only be issued to pending or active staff.' }, { status: 409 });

    let storagePath: string | null = null;
    let mimeType = 'text/plain';
    let originalFilename: string | null = null;
    let fileSizeBytes: number | null = null;
    let contentText: string | null = content;
    let documentHash = '';

    if (template === 'job_description') {
      contentText = renderLauremJobDescription(staff.job_title, staff.full_name);
      documentHash = createHash('sha256').update(contentText, 'utf8').digest('hex');
      mimeType = 'text/plain';
    } else if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      mimeType = file.type || 'application/octet-stream';
      originalFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
      fileSizeBytes = file.size;
      documentHash = hashBytes(bytes);
      storagePath = `staff/${staffId}/${randomUUID()}-${originalFilename || 'document'}`;
      const { error: uploadError } = await client.storage.from('laurem-private-documents').upload(storagePath, bytes, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;
    } else {
      contentText = `${content}\n\nEMPLOYER DOCUMENT CONTROL\nFor and on behalf of ${lauremCompany.documentIssuer.employer}\nName: ${lauremCompany.documentIssuer.name}\nTitle: ${lauremCompany.documentIssuer.title}`;
      documentHash = createHash('sha256').update(contentText, 'utf8').digest('hex');
      mimeType = 'text/plain';
    }

    const { data: document, error: insertError } = await client.from('staff_documents').insert({
      staff_id: staffId, category, title, description: description || null, original_filename: originalFilename, mime_type: mimeType, file_size_bytes: fileSizeBytes, storage_path: storagePath, content_text: contentText, document_sha256: documentHash, source_type: template === 'job_description' ? 'job_description' : 'manual', source_key: template === 'job_description' ? staff.job_title.trim().toLowerCase() : randomUUID(), status: 'issued', requires_signature: requiresSignature, signature_status: requiresSignature ? 'pending' : 'not_required', issuer_name: lauremCompany.documentIssuer.name, issuer_title: lauremCompany.documentIssuer.title, employer_name: lauremCompany.documentIssuer.employer, issued_by_actor: session.email, issued_at: new Date().toISOString()
    }).select('id,staff_id,category,title,description,original_filename,mime_type,file_size_bytes,status,requires_signature,signature_status,issuer_name,issuer_title,employer_name,issued_by_actor,issued_at').single();
    if (insertError || !document) throw insertError || new Error('Unable to create staff document.');

    await client.from('staff_document_events').insert({ document_id: document.id, staff_id: staffId, event_type: 'created', actor_type: 'admin', actor: session.email, metadata: { category, requires_signature: requiresSignature, document_sha256: documentHash } });

    if (category === 'visa_sponsorship') {
      const { data: visaCase, error: visaCaseError } = await client.from('staff_visa_cases')
        .select('id,status')
        .eq('staff_id', staffId)
        .not('status', 'in', '(declined,withdrawn)')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (visaCaseError) throw visaCaseError;
      if (visaCase) {
        const now = new Date().toISOString();
        const currentStatus = String(visaCase.status) as LauremVisaStatus;
        if (!isLauremVisaStatus(currentStatus)) throw new Error('Invalid visa case state stored in the database.');
        let nextStatus = currentStatus;
        if (currentStatus !== 'completed') {
          assertLauremVisaCoSAssignment(currentStatus);
          nextStatus = 'cos_assigned';
          const { error: visaUpdateError } = await client.from('staff_visa_cases')
            .update({ status: nextStatus, cos_assigned_at: now, updated_at: now })
            .eq('id', visaCase.id)
            .eq('status', currentStatus);
          if (visaUpdateError) throw visaUpdateError;
        }

        await client.from('staff_visa_case_events').insert({
          visa_case_id: visaCase.id,
          staff_id: staffId,
          event_type: 'document_uploaded',
          actor_type: 'admin',
          actor: session.email,
          metadata: {
            document_id: document.id,
            document_title: title,
            document_category: category,
            previous_case_status: currentStatus,
            next_case_status: nextStatus,
          },
        });
      }
    }

    await createLauremStaffNotification(client, {
      staffId,
      category: category === 'visa_sponsorship' ? 'visa_sponsorship' : 'documents',
      title: `New employment document: ${title}`,
      body: requiresSignature ? 'A new document requires your review and electronic signature.' : 'A new document is available in your Staff Portal.',
      actionUrl: `/staff/documents/${document.id}`,
    });

    const portalLink = `${appUrl()}/staff/documents/${document.id}`;
    const email = await sendLauremEmail(client, {
      eventType: 'staff.document.issued',
      entityId: document.id,
      idempotencyKey: `staff.document.issued/${document.id}/${document.issued_at}`,
      payload: {
        from: process.env.RESEND_FROM_EMAIL || 'CONAGS Care <onboarding@resend.dev>',
        to: [staff.email],
        reply_to: lauremCompany.publicEmails.manager,
        subject: `New employment document: ${title}`,
        text: `Hello ${staff.full_name},\n\nA new CONAGS employment document has been added to your Staff Portal.\n\nDocument: ${title}\n${requiresSignature ? 'Action required: review and sign online.' : 'Please review it in your portal.'}\n\nOpen document: ${portalLink}\n\nKind regards,\n${lauremCompany.documentIssuer.name}\n${lauremCompany.documentIssuer.title}\n${lauremCompany.documentIssuer.employer}` ,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#173a31"><p style="font-weight:800;color:#0f766e">CONAGS CARE</p><h1>New employment document</h1><p>Hello ${staff.full_name},</p><p>A new employment document has been added to your private Staff Portal.</p><p><strong>${title}</strong></p><p>${requiresSignature ? 'Please review the document and complete your electronic signature online.' : 'Please review the document in your Staff Portal.'}</p><p><a href="${portalLink}" style="display:inline-block;background:#0f766e;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:800">Open document</a></p><p>Kind regards,<br>${lauremCompany.documentIssuer.name}<br>${lauremCompany.documentIssuer.title}<br>${lauremCompany.documentIssuer.employer}</p></div>`
      },
    });
    return NextResponse.json({ document, email: { status: email.status, error: email.status === 'failed' ? email.error : null } }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'admin.staff_document.create_failed', reason:error instanceof Error?error.message:String(error) }));
    return NextResponse.json({ error: 'Unable to create staff employment document.' }, { status: 500 });
  }
}