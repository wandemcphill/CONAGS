import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { getLauremRecruitmentDocumentPack } from '@/lib/laurem-recruitment-documents';
import { lauremCompany } from '@/lib/laurem-company-config';
import { sendLauremEmail } from '@/lib/laurem-email';

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as { applicationId?: string } | null;
  const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : '';
  if (!applicationId) return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });

  try {
    const client = db();

    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id,full_name,email,role_applied,living_in_uk,status')
      .eq('id', applicationId)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const { data: contract, error: contractError } = await client
      .from('recruitment_contracts')
      .select('id,status,accepted_at,job_title,contract_content')
      .eq('application_id', applicationId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (contractError) throw contractError;
    if (!contract || contract.status !== 'accepted' || !contract.accepted_at || !contract.contract_content) {
      return NextResponse.json({ error: 'An accepted employment contract is required before the employment documents can be reissued.' }, { status: 409 });
    }
    if (String(contract.job_title || '').trim().toLowerCase() !== String(application.role_applied || '').trim().toLowerCase()) {
      return NextResponse.json({ error: 'The accepted contract role does not match the application role.' }, { status: 409 });
    }

    const rawDocumentToken = makeToken();
    const documentPackExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const documents = getLauremRecruitmentDocumentPack({
      role: application.role_applied,
      staffName: application.full_name,
      livingInUk: application.living_in_uk,
    });
    const jobHash = createHash('sha256').update(documents.jobDescription, 'utf8').digest('hex');
    const handbookHash = createHash('sha256').update(documents.handbookContent, 'utf8').digest('hex');

    const packResult = await client.rpc('laurem_issue_candidate_document_pack', {
      p_application_id: application.id,
      p_token_hash: hashToken(rawDocumentToken),
      p_expires_at: documentPackExpiresAt,
      p_job_description: documents.jobDescription,
      p_job_description_sha256: jobHash,
      p_handbook_title: documents.handbookTitle,
      p_handbook_content: documents.handbookContent,
      p_handbook_sha256: handbookHash,
      p_actor: session.email,
    });
    if (packResult.error) throw packResult.error;

    const pack = Array.isArray(packResult.data) ? packResult.data[0]?.pack : packResult.data?.pack;
    const documentPackUrl = appUrl() + '/candidate-documents/' + rawDocumentToken;

    const email = await sendLauremEmail(client, {
      eventType: 'candidate_document_pack_reissued',
      entityId: application.id,
      idempotencyKey: 'candidate-document-pack-reissued:' + application.id + ':' + String(pack?.id || rawDocumentToken),
      payload: {
        from: lauremCompany.candidateCommunications.senderAddress,
        to: [application.email],
        reply_to: lauremCompany.candidateCommunications.replyToAddress,
        subject: 'Your CONAGS employment documents have been reissued',
        text: 'Dear ' + application.full_name + ',\n\nYour CONAGS Job Description and Handbook have been reissued so you can review the current formatted copies online. Your previously accepted employment contract remains the accepted contract record.\n\nReview your employment documents here:\n' + documentPackUrl + '\n\nKind regards,\n' + lauremCompany.tradingName + ' Recruitment',
        html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">' + lauremCompany.tradingName.toUpperCase() + ' RECRUITMENT</p><h1 style="font-size:28px">Your employment documents have been reissued</h1><p>Dear ' + application.full_name + ',</p><p>Your <strong>Job Description</strong> and <strong>Handbook</strong> have been reissued so you can review the current formatted copies online.</p><p>Your previously accepted employment contract remains the accepted contract record and does not need to be signed again.</p><p><a href="' + documentPackUrl + '" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Review employment documents</a></p><p>Kind regards,<br>' + lauremCompany.tradingName + ' Recruitment</p></div>',
      },
    });

    return NextResponse.json({
      ok: true,
      documentPackUrl,
      packId: pack?.id || null,
      email: { status: email.status, error: email.status === 'failed' ? email.error : undefined },
      note: 'The accepted contract was not replaced or reissued as a new signable contract.',
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'admin.document_pack.reissue_failed',
      actor: session.email,
      reason: error instanceof Error ? error.message : String(error),
      applicationId,
    }));
    return NextResponse.json({ error: 'Unable to reissue the employment documents.' }, { status: 500 });
  }
}
