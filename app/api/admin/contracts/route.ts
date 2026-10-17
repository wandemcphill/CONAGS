import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';
import { renderLauremContract } from '@/lib/laurem-contract';
import { renderLauremInternationalNurseContract } from '@/lib/laurem-international-nurse-contract';
import { validateLauremContractCompleteness } from '@/lib/laurem-contract-validator';
import { lauremCompany } from '@/lib/laurem-company-config';
import { sendLauremEmail } from '@/lib/laurem-email';
import { getLauremRecruitmentDocumentPack } from '@/lib/laurem-recruitment-documents';
import { getRequestId, logOperationalError, operationalError, withRequestId } from '@/lib/laurem-operational';
import { calculateThreeYearContractEndDate, enforceMinimumLauremContractStartDate } from '@/lib/laurem-contract-dates';
import { getLauremSponsorshipOccupation } from '@/lib/laurem-sponsorship-occupation';

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
}

function isInternationalNurseApplication(app: Record<string, any>) {
  return normalizeLauremRole(typeof app.role_applied === 'string' ? app.role_applied : '') === 'Registered Nurse'
    && app.living_in_uk === 'No';
}

function escapeHtml(value: string) {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

export async function GET(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return operationalError(getRequestId(request), 'Unauthorised', 401, 'UNAUTHORISED');

  const requestId = getRequestId(request);
  const applicationId = new URL(request.url).searchParams.get('applicationId')?.trim() || '';
  if (!applicationId) return operationalError(requestId, 'Application id is required.', 400, 'APPLICATION_ID_REQUIRED');

  try {
    const { data: contract, error } = await db()
      .from('recruitment_contracts')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();
    if (error) throw error;

    return withRequestId(NextResponse.json({ contract: contract || null }), requestId);
  } catch (error) {
    logOperationalError({
      requestId,
      event: 'admin.contract.load_failed',
      actor: session.email,
      reason: error,
      metadata: { applicationId },
    });
    return operationalError(requestId, 'Unable to load employment contract.', 500, 'CONTRACT_LOAD_FAILED');
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : '';
  if (!applicationId) return operationalError(requestId, 'Application id is required.', 400, 'APPLICATION_ID_REQUIRED');

  try {
    const client = db();
    const { data: app, error: appError } = await client
      .from('recruitment_applications')
      .select('*')
      .eq('id', applicationId)
      .maybeSingle();
    if (appError) throw appError;
    if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const role = normalizeLauremRole(typeof app.role_applied === 'string' ? app.role_applied : '');
    if (!role) return NextResponse.json({ error: 'The application role is not recognised.' }, { status: 409 });

    const { data: existingContract, error: contractLookupError } = await client
      .from('recruitment_contracts')
      .select('id,status,version,accepted_at,accepted_by_name,contract_type,start_date,sponsorship_occupation_code')
      .eq('application_id', applicationId)
      .maybeSingle();
    if (contractLookupError) throw contractLookupError;
    if (existingContract?.status === 'accepted' && existingContract.accepted_at) {
      return NextResponse.json({ error: 'An employment contract has already been accepted for this application. A new contract cannot overwrite the accepted record.' }, { status: 409 });
    }

    const internationalNurse = isInternationalNurseApplication(app);
    const requiresSponsorship = typeof app.requires_sponsorship === 'string'
      && ['yes','true','required'].includes(app.requires_sponsorship.trim().toLowerCase());
    const workLocations = Array.isArray(body?.workLocations)
      ? body.workLocations.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
      : [];

    const weeklyHours = typeof body?.weeklyHours === 'number' ? body.weeklyHours : 37.5;
    const annualSalary = typeof body?.annualSalary === 'number' ? body.annualSalary : null;
    const hourlyRate = typeof body?.hourlyRate === 'number' ? body.hourlyRate : null;
    const requestedContractEndDate = typeof body?.contractEndDate === 'string' ? body.contractEndDate.trim() : '';
    const requestedStartDate = typeof body?.startDate === 'string' ? body.startDate.trim() : '';
    const contractStartDate = enforceMinimumLauremContractStartDate(
      requestedStartDate || (typeof app.start_date === 'string' ? app.start_date : null) || existingContract?.start_date || null,
    );
    const sponsorshipOccupation = getLauremSponsorshipOccupation(role);
    const sponsorshipOccupationCode = (internationalNurse || requiresSponsorship) ? sponsorshipOccupation?.code || null : null;
    const sponsorshipOccupationTitle = (internationalNurse || requiresSponsorship) ? sponsorshipOccupation?.title || null : null;
    const calculatedSponsoredEndDate = (internationalNurse || requiresSponsorship)
      ? calculateThreeYearContractEndDate(contractStartDate)
      : null;
    const contractEndDate = calculatedSponsoredEndDate || (requestedContractEndDate || null);
    const noticePeriodEmployee = typeof body?.noticePeriodEmployee === 'string' ? body.noticePeriodEmployee : null;
    const noticePeriodEmployer = typeof body?.noticePeriodEmployer === 'string' ? body.noticePeriodEmployer : null;
    const holidayEntitlement = typeof body?.holidayEntitlement === 'string' ? body.holidayEntitlement : null;
    const pensionScheme = typeof body?.pensionScheme === 'string' ? body.pensionScheme : null;

    const contractContent = internationalNurse
      ? renderLauremInternationalNurseContract({
          employeeName: app.full_name,
          employeeAddress: app.address,
          jobTitle: role,
          startDate: contractStartDate,
          contractEndDate,
          annualSalary,
          weeklyHours,
          workLocations,
          probation: typeof body?.probation === 'string' ? body.probation : null,
          noticePeriodEmployee,
          noticePeriodEmployer,
          holidayEntitlement,
          pensionScheme,
          visaRoute: typeof body?.visaRoute === 'string' ? body.visaRoute : null,
          sponsorshipOccupationCode,
          sponsorshipOccupationTitle,
          nmcStatus: typeof body?.nmcStatus === 'string' ? body.nmcStatus : null,
          registrationDeadline: typeof body?.registrationDeadline === 'string' ? body.registrationDeadline : null,
          preRegistrationSalary: typeof body?.preRegistrationSalary === 'number' ? body.preRegistrationSalary : null,
          postRegistrationSalary: typeof body?.postRegistrationSalary === 'number' ? body.postRegistrationSalary : annualSalary,
          relocationSupport: typeof body?.relocationSupport === 'string' ? body.relocationSupport : null,
          repayableCosts: typeof body?.repayableCosts === 'string' ? body.repayableCosts : null,
          repaymentSchedule: typeof body?.repaymentSchedule === 'string' ? body.repaymentSchedule : null,
        })
      : renderLauremContract({
          employeeName: app.full_name,
          employeeAddress: app.address,
          jobTitle: role,
          startDate: contractStartDate,
          contractEndDate,
          minimumWeeklyHours: weeklyHours,
          hourlyRate,
          annualSalary,
          workLocations,
          clientOrAssignmentDetails: typeof body?.clientOrAssignmentDetails === 'string' ? body.clientOrAssignmentDetails : null,
          noticePeriodEmployee,
          noticePeriodEmployer,
          holidayEntitlement,
          pensionScheme,
          sponsorshipOccupationCode,
          sponsorshipOccupationTitle,
        });

    const nextVersion = Number(existingContract?.version || 0) + 1;
    const payload = {
      application_id: applicationId,
      version: nextVersion,
      contract_type: internationalNurse ? 'international_nurse' : 'standard',
      job_title: role,
      start_date: contractStartDate,
      contract_end_date: contractEndDate,
      minimum_weekly_hours: weeklyHours,
      weekly_hours: weeklyHours,
      hourly_rate: hourlyRate,
      annual_salary: annualSalary,
      work_locations: workLocations,
      client_or_assignment_details: typeof body?.clientOrAssignmentDetails === 'string' ? body.clientOrAssignmentDetails : null,
      notice_period_employee: noticePeriodEmployee,
      notice_period_employer: noticePeriodEmployer,
      holiday_entitlement: holidayEntitlement,
      pension_scheme: pensionScheme,
      visa_route: internationalNurse && typeof body?.visaRoute === 'string' ? body.visaRoute : null,
      sponsorship_occupation_code: sponsorshipOccupationCode,
      nmc_status: internationalNurse && typeof body?.nmcStatus === 'string' ? body.nmcStatus : null,
      registration_deadline: internationalNurse && typeof body?.registrationDeadline === 'string' ? body.registrationDeadline : null,
      pre_registration_salary: internationalNurse && typeof body?.preRegistrationSalary === 'number' ? body.preRegistrationSalary : null,
      post_registration_salary: internationalNurse
        ? (typeof body?.postRegistrationSalary === 'number' ? body.postRegistrationSalary : annualSalary)
        : null,
      relocation_support: internationalNurse && typeof body?.relocationSupport === 'string' ? body.relocationSupport : null,
      repayable_costs: internationalNurse && typeof body?.repayableCosts === 'string' ? body.repayableCosts : null,
      repayment_schedule: internationalNurse && typeof body?.repaymentSchedule === 'string' ? body.repaymentSchedule : null,
      contract_source: internationalNurse
        ? 'Conags international nurse contract template informed by current UK and Scottish guidance'
        : 'Conags standard employment contract template',
      contract_content: contractContent,
      status: 'draft',
      created_by: session.email,
      updated_at: new Date().toISOString(),
    };

    const { data: contract, error } = await client
      .from('recruitment_contracts')
      .upsert(payload, { onConflict: 'application_id' })
      .select('*')
      .single();
    if (error) throw error;

    return withRequestId(
      NextResponse.json({
        id: contract.id,
        status: contract.status,
        contractType: contract.contract_type,
        contract,
      }, { status: 201 }),
      requestId,
    );
  } catch (error) {
    logOperationalError({ requestId, event: 'admin.contract.generate_failed', actor: session.email, reason: error, metadata: { applicationId } });
    return operationalError(requestId, 'Unable to generate employment contract.', 500, 'CONTRACT_GENERATION_FAILED');
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  const session = readAdminSession(request);
  if (!session) return operationalError(requestId, 'Unauthorised', 401, 'UNAUTHORISED');

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return operationalError(requestId, 'Contract id is required.', 400, 'CONTRACT_ID_REQUIRED');

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.status !== 'issued') return NextResponse.json({ error: 'Only issuing a draft contract is permitted here.' }, { status: 400 });

  const client = db();
  const { data: current, error: readError } = await client
    .from('recruitment_contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: 'Unable to load contract.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
  if (!['standard','international_nurse'].includes(current.contract_type)) return NextResponse.json({ error: 'This contract type cannot be issued.' }, { status: 409 });
  if (current.accepted_at) return NextResponse.json({ error: 'An accepted contract is immutable.' }, { status: 409 });

  const { data: app, error: appError } = await client
    .from('recruitment_applications')
    .select('id,full_name,email,role_applied,living_in_uk,address,start_date')
    .eq('id', current.application_id)
    .maybeSingle();
  if (appError) return NextResponse.json({ error: 'Unable to load contract application.' }, { status: 500 });
  if (!app || !normalizeLauremRole(app.role_applied || '')) return NextResponse.json({ error: 'Contract is not eligible for issue.' }, { status: 409 });

  const completeness = validateLauremContractCompleteness({
    employeeName: app.full_name,
    employeeAddress: app.address,
    jobTitle: current.job_title || app.role_applied,
    startDate: current.start_date || app.start_date,
    minimumWeeklyHours: current.minimum_weekly_hours ?? current.weekly_hours,
    weeklyHours: current.weekly_hours ?? current.minimum_weekly_hours,
    hourlyRate: current.hourly_rate,
    annualSalary: current.annual_salary,
    workLocations: Array.isArray(current.work_locations) ? current.work_locations : [],
    noticePeriodEmployee: current.notice_period_employee,
    noticePeriodEmployer: current.notice_period_employer,
    holidayEntitlement: current.holiday_entitlement,
    pensionScheme: current.pension_scheme,
    contractType: current.contract_type,
    visaRoute: current.visa_route,
    sponsorshipOccupationCode: current.sponsorship_occupation_code,
    nmcStatus: current.nmc_status,
    registrationDeadline: current.registration_deadline,
    preRegistrationSalary: current.pre_registration_salary,
    postRegistrationSalary: current.post_registration_salary,
    repayableCosts: current.repayable_costs,
    repaymentSchedule: current.repayment_schedule,
    contractContent: current.contract_content,
  });
  if (!completeness.valid) {
    return NextResponse.json({
      error: 'Cannot issue contract: material employment particulars are missing or unresolved.',
      code: 'CONTRACT_INCOMPLETE',
      validationErrors: completeness.errors,
      missingFields: completeness.missingFields,
    }, { status: 422 });
  }

  const token = makeToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: atomicResult, error: issueError } = await client.rpc('laurem_issue_recruitment_contract_with_token', {
    p_contract_id: id,
    p_token_hash: hashToken(token),
    p_expires_at: expiresAt,
    p_actor: session.email,
  });

  if (issueError || !atomicResult?.contract) {
    const message = issueError?.message || 'Unable to issue contract.';
    const status = message.includes('CONTRACT_ALREADY_ACCEPTED') || message.includes('CONTRACT_NOT_ISSUABLE') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const updated = atomicResult.contract;
  const link = appUrl() + '/contracts/accept/' + token;

  // The signed employment contract is the lifecycle authority. The optional
  // Job Description + Handbook pack is downstream and must never make an
  // otherwise successful contract issue fail.
  let documentPackLink: string | null = null;
  try {
    const rawDocumentToken = makeToken();
    const documentPackExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const documents = getLauremRecruitmentDocumentPack({
      role: app.role_applied,
      staffName: app.full_name,
      livingInUk: app.living_in_uk,
    });
    const jobHash = createHash('sha256').update(documents.jobDescription, 'utf8').digest('hex');
    const handbookHash = createHash('sha256').update(documents.handbookContent, 'utf8').digest('hex');
    const packResult = await client.rpc('laurem_issue_candidate_document_pack', {
      p_application_id: app.id,
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
    documentPackLink = appUrl() + '/candidate-documents/' + rawDocumentToken;
  } catch (documentPackError) {
    logOperationalError({
      requestId,
      event: 'admin.contract.document_pack_failed',
      actor: session.email,
      reason: documentPackError,
      metadata: { applicationId: app.id, contractId: id, contractAlreadyIssued: true },
    });
  }

  const safeName = escapeHtml(app.full_name);
  const safeLink = escapeHtml(link);
  const safeDocumentPackLink = documentPackLink ? escapeHtml(documentPackLink) : '';
  const documentPackText = documentPackLink
    ? '\\n\\nReview your Job Description and Handbook:\\n' + documentPackLink
    : '\\n\\nYour Job Description and Handbook will be made available through your CONAGS onboarding process.';
  const documentPackHtml = documentPackLink
    ? '<p><a href="' + safeDocumentPackLink + '" style="display:inline-block;border:1px solid #173a31;color:#173a31;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Open Job Description & Handbook</a></p>'
    : '<p>Your Job Description and Handbook will be made available through your CONAGS onboarding process.</p>';

  const email = await sendLauremEmail(client, {
    eventType: 'contract_issued',
    entityId: id,
    idempotencyKey: 'contract:issued:' + id + ':' + updated.issued_at,
    payload: {
      from: lauremCompany.candidateCommunications.senderAddress,
      to: [app.email],
      reply_to: lauremCompany.candidateCommunications.replyToAddress,
      subject: 'Your CONAGS employment offer package from ' + lauremCompany.tradingName,
      text: 'Dear ' + app.full_name + ',\n\nYour CONAGS employment offer package is ready. It includes your Employment Contract and onboarding preparation information.' + documentPackText + '\n\nSign or decline your contract:\n' + link + '\n\nThese documents are completed online. You will not be asked to sign the Contract, Job Description or Handbook again during onboarding.\n\nKind regards,\n' + lauremCompany.tradingName + ' Recruitment',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">' + escapeHtml(lauremCompany.tradingName.toUpperCase()) + ' RECRUITMENT</p><h1 style="font-size:28px">Your employment offer package is ready</h1><p>Dear ' + safeName + ',</p><p>Your <strong>' + escapeHtml(current.job_title) + '</strong> employment offer package is ready. It contains your Employment Contract and onboarding preparation information.</p><p><a href="' + safeLink + '" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Review & sign contract</a></p>' + documentPackHtml + '<p>All signing is completed online. You will not be asked to sign these employment documents again during onboarding.</p><p>Kind regards,<br>' + escapeHtml(lauremCompany.tradingName) + ' Recruitment</p></div>',
    },
  });

  return withRequestId(NextResponse.json({
    contract: updated,
    acceptanceLink: link,
    documentPackLink,
    documentPackIssued: Boolean(documentPackLink),
    email: { status: email.status, attempts: email.attempts, providerId: 'providerId' in email ? email.providerId : null, deliveryId: email.deliveryId, ...(email.status === 'failed' ? { error: email.error } : {}) },
  }), requestId);
}
