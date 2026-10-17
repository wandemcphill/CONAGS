import { NextRequest, NextResponse } from 'next/server';
import { lauremCompany } from '@/lib/laurem-company-config';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { getLauremRecruitmentDocumentPack, LAUREM_RECRUITMENT_DOCUMENT_ATTESTATION } from '@/lib/laurem-recruitment-documents';
import { buildOnboardingTasks, inferLauremOnboardingAudience } from '@/lib/laurem-onboarding';
import { getLauremOnboardingReadiness } from '@/lib/laurem-onboarding-readiness';
import { sendLauremEmail } from '@/lib/laurem-email';

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
}

function errorResponse(code: string) {
  const map: Record<string, { status: number; message: string }> = {
    DOCUMENT_PACK_NOT_FOUND: { status: 404, message: 'Document pack not found.' },
    DOCUMENT_PACK_EXPIRED: { status: 410, message: 'This document pack has expired.' },
    DOCUMENT_PACK_UNAVAILABLE: { status: 409, message: 'This document pack is no longer available.' },
    DOCUMENT_NOT_FOUND: { status: 404, message: 'Document not found.' },
    DOCUMENT_NOT_SIGNABLE: { status: 409, message: 'This document is not available for signing.' },
    NAME_REQUIRED: { status: 400, message: 'Your full name is required.' },
    ATTESTATION_REQUIRED: { status: 400, message: 'Electronic-signature attestation is required.' },
    ATTESTATION_INVALID: { status: 400, message: 'Invalid electronic-signature attestation.' },
  };
  const resolved = map[code] || { status: 409, message: 'Unable to process the document.' };
  return NextResponse.json({ error: resolved.message, code }, { status: resolved.status });
}

async function loadPack(token: string) {
  const client = db();
  const tokenHash = hashToken(token);
  const { data: pack, error: packError } = await client
    .from('laurem_candidate_document_packs')
    .select('id,application_id,status,expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (packError) throw packError;
  if (!pack) throw new Error('DOCUMENT_PACK_NOT_FOUND');
  if (pack.status === 'pending' && new Date(pack.expires_at).getTime() <= Date.now()) {
    await client.from('laurem_candidate_document_packs').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', pack.id);
    throw new Error('DOCUMENT_PACK_EXPIRED');
  }

  const [{ data: application, error: applicationError }, { data: documents, error: documentsError }, { data: contract, error: contractError }] = await Promise.all([
    client.from('recruitment_applications').select('id,full_name,role_applied,living_in_uk').eq('id', pack.application_id).maybeSingle(),
    client.from('laurem_candidate_documents').select('id,document_type,title,content_text,signature_status,signature_name,signed_at,first_viewed_at,viewed_count').eq('pack_id', pack.id).order('document_type', { ascending: true }),
    client.from('recruitment_contracts').select('status,accepted_at,job_title,version,contract_content,accepted_by_name').eq('application_id', pack.application_id).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (applicationError) throw applicationError;
  if (documentsError) throw documentsError;
  if (contractError) throw contractError;
  if (!application) throw new Error('APPLICATION_NOT_FOUND');

  const now = new Date().toISOString();
  for (const document of documents || []) {
    await client
      .from('laurem_candidate_documents')
      .update({
        first_viewed_at: document.first_viewed_at || now,
        last_viewed_at: now,
        viewed_count: Number(document.viewed_count || 0) + 1,
        updated_at: now,
      })
      .eq('id', document.id);
  }

  return { client, tokenHash, pack, application, contract, documents: documents || [] };
}

async function prepareOnboardingIfReady(client: ReturnType<typeof db>, applicationId: string) {
  const { data: application, error } = await client
    .from('recruitment_applications')
    .select('id,full_name,email,role_applied,living_in_uk,start_date,application_data,status')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!application || application.status === 'Hired' || application.status === 'Onboarding') {
    return null;
  }

  const { data: acceptedContract, error: acceptedContractError } = await client
    .from('recruitment_contracts')
    .select('id,status,accepted_at,job_title')
    .eq('application_id', applicationId)
    .eq('status', 'accepted')
    .not('accepted_at', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (acceptedContractError) throw acceptedContractError;
  if (!acceptedContract || String(acceptedContract.job_title || '').trim().toLowerCase() !== String(application.role_applied || '').trim().toLowerCase()) {
    return { onboardingLink: null, waitingForReadiness: false, waitingForContract: true };
  }

  const readiness = await getLauremOnboardingReadiness(client, application);
  if (!readiness.ready) {
    return { onboardingLink: null, waitingForReadiness: true };
  }

  const audience = inferLauremOnboardingAudience(String(application.role_applied || ''), application.living_in_uk);
  const tasks = buildOnboardingTasks(audience);
  const packageTitle = audience === 'international_nurse'
    ? 'International Nurse Onboarding & Welcome Programme'
    : audience === 'sponsored_hca'
      ? 'Sponsored Healthcare Assistant Onboarding Programme'
      : 'Conags Staff Onboarding Programme';

  const rawAccessToken = makeToken();
  const accessTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const applicationData = application.application_data && typeof application.application_data === 'object'
    ? application.application_data as Record<string, unknown>
    : {};
  const nmcNumber = typeof applicationData.nmc_number === 'string'
    ? applicationData.nmc_number
    : null;

  const result = await client.rpc('laurem_prepare_staff_onboarding_atomic', {
    p_application_id: applicationId,
    p_actor: 'candidate_document_pack',
    p_audience: audience,
    p_package_title: packageTitle,
    p_tasks: tasks,
    p_location: null,
    p_nmc_number: nmcNumber,
    p_dbs_verified: Boolean(applicationData.dbs_verified),
    p_access_token_hash: hashToken(rawAccessToken),
    p_access_token_expires_at: accessTokenExpiresAt,
  });
  if (result.error) throw result.error;

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.access_token_issued) return { onboardingLink: null, waitingForReadiness: false };

  const onboardingLink = appUrl() + '/onboarding/' + rawAccessToken;
  await sendLauremEmail(client, {
    eventType: 'onboarding_access_issued',
    entityId: applicationId,
    idempotencyKey: 'onboarding-access:' + applicationId,
    payload: {
      from: lauremCompany.candidateCommunications.senderAddress,
      to: [application.email],
      reply_to: lauremCompany.candidateCommunications.replyToAddress,
      subject: 'Your CONAGS onboarding is ready',
      text: 'Dear ' + application.full_name + ',\n\nYour signed employment documents are complete and your CONAGS onboarding package is now ready.\n\nContinue here:\n' + onboardingLink + '\n\nKind regards,\nCONAGS Recruitment',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">CONAGS CARE</p><h1 style="font-size:28px">Your onboarding is ready</h1><p>Dear ' + application.full_name + ',</p><p>Your contract, Job Description and Handbook are now recorded as signed.</p><p><a href="' + onboardingLink + '" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Continue to onboarding</a></p><p>Kind regards,<br>CONAGS Recruitment</p></div>',
    },
  });

  return { onboardingLink, waitingForReadiness: false };
}

export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token')?.trim() || '';
    if (!token) return NextResponse.json({ error: 'Document token is required.' }, { status: 400 });

    const loaded = await loadPack(token);
    let onboardingLink: string | null = null;
    let waitingForReadiness = false;
    if (loaded.pack.status === 'completed') {
      const onboarding = await prepareOnboardingIfReady(loaded.client, loaded.application.id);
      onboardingLink = onboarding?.onboardingLink || null;
      waitingForReadiness = Boolean(onboarding?.waitingForReadiness);
    }
    const waitingForContract = Boolean((loaded.pack.status === 'completed' && loaded.contract?.status !== 'accepted'));
    const readiness = await getLauremOnboardingReadiness(loaded.client, loaded.application);
    return NextResponse.json({
      application: {
        full_name: loaded.application.full_name,
        role_applied: loaded.application.role_applied,
      },
      pack: loaded.pack,
      onboardingLink,
      waitingForReadiness,
      waitingForContract,
      contract: loaded.contract ? {
        status: loaded.contract.status,
        accepted_at: loaded.contract.accepted_at,
        job_title: loaded.contract.job_title,
        version: loaded.contract.version,
      } : null,
      readiness: readiness.items,
      documents: loaded.documents.map((document) => ({
        id: document.id,
        document_type: document.document_type,
        title: document.title,
        content: document.content_text,
        signature_status: document.signature_status,
        signed_name: document.signature_name,
        signed_at: document.signed_at,
      })),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DOCUMENT_PACK_FAILED';
    return errorResponse(code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as {
      token?: string;
      documentId?: string;
      signedName?: string;
      signatureData?: string;
      attestation?: string;
    } | null;

    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
    const signedName = typeof body?.signedName === 'string' ? body.signedName.trim() : '';
    const signatureData = typeof body?.signatureData === 'string' ? body.signatureData.trim() : '';
    const attestation = typeof body?.attestation === 'string' ? body.attestation.trim() : '';

    if (!token || !documentId) return NextResponse.json({ error: 'Document token and document id are required.' }, { status: 400 });

    const response = await db().rpc('laurem_sign_candidate_document', {
      p_token_hash: hashToken(token),
      p_document_id: documentId,
      p_signed_name: signedName,
      p_signature_data: signatureData || null,
      p_attestation: attestation || LAUREM_RECRUITMENT_DOCUMENT_ATTESTATION,
      p_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      p_user_agent: request.headers.get('user-agent') || null,
    });
    if (response.error) {
      const code = response.error.message || 'DOCUMENT_SIGN_FAILED';
      return errorResponse(code);
    }

    const result = Array.isArray(response.data) ? response.data[0] : response.data;
    let onboardingLink: string | null = null;
    let waitingForReadiness = false;
    let waitingForContract = false;
    if (result?.pack_status === 'completed') {
      const loaded = await loadPack(token);
      const onboarding = await prepareOnboardingIfReady(loaded.client, loaded.application.id);
      onboardingLink = onboarding?.onboardingLink || null;
      waitingForReadiness = Boolean(onboarding?.waitingForReadiness);
      waitingForContract = Boolean(onboarding?.waitingForContract || loaded.contract?.status !== 'accepted');
    }

    return NextResponse.json({
      ok: true,
      packStatus: result?.pack_status || 'pending',
      onboardingLink,
      waitingForReadiness,
      waitingForContract,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DOCUMENT_SIGN_FAILED';
    return errorResponse(code);
  }
}
