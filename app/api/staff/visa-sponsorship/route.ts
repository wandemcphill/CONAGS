import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { determineLauremVisaPathway, visaPathwayLabel, type LauremVisaPathway } from '@/lib/laurem-visa-sponsorship';
import { buildLauremVisaReadiness } from '@/lib/laurem-visa-readiness';
import { sendLauremEmail } from '@/lib/laurem-email';
import { lauremCompany } from '@/lib/laurem-company-config';
import { buildUkSwitchPaymentPlan, getVisaPaymentPlan, isInternationalNurseRole, isUkSwitchSplitRole, type LauremVisaPaymentPlanKind } from '@/lib/laurem-visa-payment-plan';
import { calculateThreeYearContractEndDate, formatContractDate } from '@/lib/laurem-contract-dates';
import { getLauremSponsorshipOccupation } from '@/lib/laurem-sponsorship-occupation';



function escHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isApplicationInUk(application: Record<string, unknown> | null | undefined) {
  return lowerString(application?.living_in_uk) === 'yes'
    || lowerString(application?.living_in_uk) === 'true'
    || lowerString(application?.living_in_uk) === 'currently in the uk'
    || /(united kingdom|^uk$|england|scotland|wales|northern ireland)/i.test(String(application?.current_country || application?.country_of_residence || ''));
}

function lowerString(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function extractApplicationAddresses(application: Record<string, any> | null | undefined) {
  const address = String(application?.address || '').trim();
  return address ? [address] : [];
}

function roleBasedPathway(role: string | null | undefined, application: Record<string, unknown> | null | undefined): LauremVisaPathway | null {
  if (isInternationalNurseRole(role)) return 'international_sponsorship';
  if (isApplicationInUk(application) && isUkSwitchSplitRole(role)) return 'visa_switch';
  return null;
}

function paymentPlanFor(role: string | null | undefined, pathway: string, application: Record<string, unknown> | null | undefined): LauremVisaPaymentPlanKind {
  return getVisaPaymentPlan(role, pathway, isApplicationInUk(application));
}

function cosStatus(caseRow: any, visaDocuments: any[]) {
  if (!caseRow) return { key: 'not_requested', label: 'COS not requested', canDownload: false };
  if (['declined', 'withdrawn'].includes(caseRow.status)) return { key: 'closed', label: caseRow.status === 'declined' ? 'Declined' : 'Withdrawn', canDownload: false };
  if (['preparing_sms', 'submitted_to_sms', 'cos_pending'].includes(caseRow.status)) return { key: 'processing', label: 'Processing COS', canDownload: false };
  if (['cos_assigned', 'completed'].includes(caseRow.status) && visaDocuments.length > 0) return { key: 'active', label: 'Active', canDownload: true };
  return { key: 'invoice_requested', label: 'Invoice requested', canDownload: false };
}

async function loadStaffVisa(client: ReturnType<typeof db>, staffId: string) {
  const { data: staff, error: staffError } = await client.from('laurem_staff_profiles')
    .select('id,application_id,laurem_id,full_name,job_title,start_date')
    .eq('id', staffId)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff) return null;

  const { data: application, error: appError } = await client.from('recruitment_applications')
    .select('id,full_name,email,phone,date_of_birth,nationality,country_of_residence,address,role_applied,start_date,living_in_uk,current_country,work_permission,requires_sponsorship')
    .eq('id', staff.application_id)
    .maybeSingle();
  if (appError) throw appError;
  if (!application) throw new Error('RECRUITMENT_APPLICATION_NOT_FOUND');

  const recommendation = determineLauremVisaPathway({
    livingInUk: application.living_in_uk,
    currentCountry: application.current_country || application.country_of_residence,
  });

  const applicationAddresses = extractApplicationAddresses(application);
  const applicationForStaff = application;

  const rolePathway = roleBasedPathway(staff.job_title || application.role_applied, application);

  const paymentAccountResult = await client.from('laurem_payment_accounts')
    .select('account_name,bank_name,account_number,sort_code,bank_address')
    .eq('account_key','primary_gbp')
    .eq('is_active',true)
    .maybeSingle();
  if (paymentAccountResult.error) throw paymentAccountResult.error;
  if (!paymentAccountResult.data) throw new Error('PAYMENT_ACCOUNT_NOT_CONFIGURED');


  const { data: visaCase, error: caseError } = await client.from('laurem_staff_visa_cases')
    .select('*')
    .eq('staff_id', staffId)
    .not('status','in','(declined,withdrawn)')
    .order('requested_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if (caseError) throw caseError;

  let invoice = null;
  let events: any[] = [];
  if (visaCase) {
    const invoiceResult = await client.from('laurem_staff_visa_invoices')
      .select('*')
      .eq('visa_case_id', visaCase.id)
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if (invoiceResult.error) throw invoiceResult.error;
    invoice = invoiceResult.data;

    const eventsResult = await client.from('laurem_staff_visa_case_events')
      .select('id,event_type,actor_type,actor,metadata,created_at')
      .eq('visa_case_id', visaCase.id)
      .order('created_at',{ascending:false})
      .limit(50);
    if (eventsResult.error) throw eventsResult.error;
    events = eventsResult.data || [];
  }

  const { data: visaDocuments, error: documentError } = await client.from('laurem_staff_documents')
    .select('id,title,description,original_filename,mime_type,file_size_bytes,status,category,issued_at,signature_status')
    .eq('staff_id', staffId)
    .eq('category','visa_sponsorship')
    .eq('status','issued')
    .order('issued_at',{ascending:false});
  if (documentError) throw documentError;

  const readiness = visaCase ? buildLauremVisaReadiness({
    pathway: visaCase.pathway,
    staff: staff as Record<string, unknown>,
    application: application as Record<string, unknown>,
    additionalInformation: (visaCase.additional_information || {}) as Record<string, unknown>,
    invoiceStatus: invoice?.status || null,
  }) : null;

  const sponsorshipOccupation = getLauremSponsorshipOccupation(staff.job_title || application.role_applied);
  const sponsorshipTermEndDate = calculateThreeYearContractEndDate(application.start_date);

  return {
    staff,
    application: applicationForStaff,
    paymentBankDetails: {
      accountName: paymentAccountResult.data.account_name,
      bankName: paymentAccountResult.data.bank_name,
      accountNumber: paymentAccountResult.data.account_number,
      sortCode: paymentAccountResult.data.sort_code,
      bankAddress: paymentAccountResult.data.bank_address,
    },
    applicationAddresses,
    recommendation: {
      ...recommendation,
      label: visaPathwayLabel(recommendation.pathway),
    },
    case: visaCase,
    invoice,
    events,
    readiness,
    visaDocuments: visaDocuments || [],
    cosStatus: cosStatus(visaCase, visaDocuments || []),
    paymentPlan: visaCase && invoice?.amount_pence === 50000 ? buildUkSwitchPaymentPlan() : null,
    sponsorshipOccupation,
    sponsorshipTermEndDate,
    sponsorshipTermEndDateLabel: sponsorshipTermEndDate ? formatContractDate(sponsorshipTermEndDate) : null,
    request: {
      available: Boolean(rolePathway),
      pathway: rolePathway,
      paymentPlanKind: rolePathway ? paymentPlanFor(rolePathway === 'visa_switch' ? staff.job_title || application.role_applied : staff.job_title || application.role_applied, rolePathway, application) : 'full_upfront',
      label: rolePathway === 'visa_switch' ? 'Apply for Visa Switch' : rolePathway === 'international_sponsorship' ? 'Apply for Visa Sponsorship' : null,
      explanation: rolePathway === 'visa_switch'
        ? 'Request CONAGS support to switch your UK visa. The initial service invoice is £500, payable within 3 days of the invoice issue date and before CONAGS begins the visa sponsorship process. The remaining £1,500 is not payable now and is recovered through weekly salary deductions during the first three months of employment, following successful visa approval and commencement of employment.'
        : rolePathway === 'international_sponsorship'
          ? 'Request international visa sponsorship support. The existing £2,000 invoice arrangement remains unchanged.'
          : 'Visa support requests are currently available here for eligible UK switch roles and Registered Nurses.',
    },
  };
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const data = await loadStaffVisa(db(), session.staff_id);
    if (!data) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'staff.visa.load_failed', reason:error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Unable to load your visa sponsorship workspace.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pathway = typeof body?.pathway === 'string' ? body.pathway : null;
  if (pathway !== null && !['visa_switch','international_sponsorship'].includes(pathway)) {
    return NextResponse.json({ error: 'Invalid visa support route.' }, { status: 400 });
  }

  try {
    const client = db();
    const { data: staff, error: staffError } = await client.from('laurem_staff_profiles')
      .select('id,application_id,full_name,email,job_title,employment_status')
      .eq('id', session.staff_id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 });
    const applicationResult = await client.from('recruitment_applications')
      .select('id,role_applied,living_in_uk,current_country,country_of_residence')
      .eq('id', staff.application_id)
      .maybeSingle();
    if (applicationResult.error) throw applicationResult.error;
    const rolePathway = roleBasedPathway(staff.job_title || applicationResult.data?.role_applied, applicationResult.data);
    if (!rolePathway) return NextResponse.json({ error: 'Visa support requests are currently available for UK visa switches for Healthcare Assistants, Senior Healthcare Assistants, Support Workers and Senior Support Workers, and for International Nurses.' }, { status: 409 });
    if (pathway && pathway !== rolePathway) return NextResponse.json({ error: 'The available visa support route for your staff role does not match this request.' }, { status: 409 });

    const requestedPathway = pathway || rolePathway;
    const { data, error } = await db().rpc('laurem_request_staff_visa_sponsorship', {
      p_staff_id: session.staff_id,
      p_requested_pathway: requestedPathway,
    });
    if (error) throw error;

    if (!data?.already_exists && data?.case?.id && data?.invoice?.invoice_number) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
      const adminUrl = appUrl + '/admin/workforce/' + encodeURIComponent(session.staff_id) + '/visa-sponsorship';
      const invoiceAmount = Number(data.invoice.amount_pence || 200000) / 100;
      await sendLauremEmail(client, {
        eventType: 'staff.visa_request.admin',
        entityId: String(data.case.id),
        idempotencyKey: 'staff.visa_request.admin/' + String(data.case.id),
        payload: {
          from: process.env.RESEND_FROM_EMAIL || 'CONAGS Care <onboarding@resend.dev>',
          to: [lauremCompany.portalNotifications.internalRecipient],
          reply_to: lauremCompany.publicEmails.manager,
          subject: 'Staff visa support request: ' + staff.full_name,
          text: 'A new CONAGS staff visa support request has been submitted.\n\nStaff: ' + staff.full_name + '\nRole: ' + staff.job_title + '\nCONAGS ID: ' + session.laurem_id + '\nRoute: ' + requestedPathway + '\nInvoice: ' + data.invoice.invoice_number + '\nAmount: £' + invoiceAmount.toFixed(2) + '\n\nOpen the admin case: ' + adminUrl,
          html: '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#173a31"><p style="color:#0f766e;font-weight:800">CONAGS CARE</p><h1>New staff visa support request</h1><p><strong>' + escHtml(staff.full_name) + '</strong> has requested visa support from the Staff Portal.</p><p><strong>Role:</strong> ' + escHtml(staff.job_title) + '<br><strong>CONAGS ID:</strong> ' + escHtml(session.laurem_id) + '<br><strong>Route:</strong> ' + escHtml(requestedPathway) + '<br><strong>Invoice:</strong> ' + escHtml(data.invoice.invoice_number) + '<br><strong>Amount:</strong> £' + invoiceAmount.toFixed(2) + '</p><p><a href="' + adminUrl + '" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:800">Open admin case</a></p></div>',
        },
      });
    }

    return NextResponse.json(data, { status: data?.already_exists ? 200 : 201 });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const known: Record<string, number> = {
      STAFF_NOT_FOUND: 404,
      STAFF_NOT_ELIGIBLE: 409,
      APPLICATION_NOT_FOUND: 409,
    };
    const key = Object.keys(known).find((item) => message.includes(item));
    return NextResponse.json({ error: key ? message : 'Unable to create your visa sponsorship request.' }, { status: key ? known[key] : 409 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const currentVisaType = typeof body?.currentVisaType === 'string' ? body.currentVisaType.trim().slice(0,120) : '';
  const currentVisaStartDate = typeof body?.currentVisaStartDate === 'string' ? body.currentVisaStartDate : '';
  const currentVisaEndDate = typeof body?.currentVisaEndDate === 'string' ? body.currentVisaEndDate : '';
  const passportNumber = typeof body?.passportNumber === 'string' ? body.passportNumber.trim().slice(0,80) : '';
  const passportExpiryDate = typeof body?.passportExpiryDate === 'string' ? body.passportExpiryDate : '';
  const passportCountry = typeof body?.passportCountry === 'string' ? body.passportCountry.trim().slice(0,120) : '';
  const addressIsCurrent = typeof body?.addressIsCurrent === 'string' ? body.addressIsCurrent.trim().toLowerCase() : '';
  const addressProofProvided = typeof body?.addressProofProvided === 'string' ? body.addressProofProvided.trim().toLowerCase() : '';
  const currentAddress = typeof body?.currentAddress === 'string' ? body.currentAddress.trim().slice(0,500) : '';
  const rightToWorkStatus = typeof body?.rightToWorkStatus === 'string' ? body.rightToWorkStatus.trim().toLowerCase() : '';
  const rightToWorkProofProvided = typeof body?.rightToWorkProofProvided === 'string' ? body.rightToWorkProofProvided.trim().toLowerCase() : '';
  const ukStatusShareCode = typeof body?.ukStatusShareCode === 'string' ? body.ukStatusShareCode.trim().slice(0,40) : '';

  try {
    const client = db();
    const { data: currentCase, error: caseError } = await client.from('laurem_staff_visa_cases')
      .select('id,staff_id,application_id,pathway,additional_information,status')
      .eq('staff_id', session.staff_id)
      .not('status','in','(declined,withdrawn)')
      .order('requested_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if (caseError) throw caseError;
    if (!currentCase) return NextResponse.json({ error: 'Create your visa support request first.' }, { status: 404 });

    const missingCandidateFields: string[] = [];
    if (!passportNumber) missingCandidateFields.push('Passport number');
    if (!passportExpiryDate) missingCandidateFields.push('Passport expiry');
    if (!passportCountry) missingCandidateFields.push('Passport country');
    if (!['yes', 'no'].includes(addressIsCurrent)) missingCandidateFields.push('Whether your application address is still current');
    if (addressIsCurrent === 'no' && !currentAddress) missingCandidateFields.push('Current address');
    if (!['yes', 'no'].includes(addressProofProvided)) missingCandidateFields.push('Whether address proof has been provided to CONAGS');
    if (currentCase.pathway === 'visa_switch') {
      if (!currentVisaType) missingCandidateFields.push('Current UK visa type');
      if (!currentVisaStartDate) missingCandidateFields.push('Current UK visa start date');
      if (!currentVisaEndDate) missingCandidateFields.push('Current UK visa end date');
      if (currentVisaStartDate && currentVisaEndDate && currentVisaEndDate < currentVisaStartDate) return NextResponse.json({ error: 'Current UK visa end date cannot be before the start date.' }, { status: 422 });
      if (!['yes', 'no'].includes(rightToWorkStatus)) missingCandidateFields.push('Whether you have the right to work in the UK');
      if (!['yes', 'no'].includes(rightToWorkProofProvided)) missingCandidateFields.push('Whether right-to-work proof has been provided to CONAGS');
      if ((rightToWorkStatus === 'no' || rightToWorkProofProvided === 'no') && !ukStatusShareCode) missingCandidateFields.push('UK status share code');
    }
    if (missingCandidateFields.length > 0) {
      return NextResponse.json({
        error: 'Please complete the required sponsorship details: ' + missingCandidateFields.join(', ') + '.',
        missing: missingCandidateFields,
      }, { status: 422 });
    }

    const additional = {
      ...(currentCase.additional_information || {}),
      current_visa_type: currentVisaType || null,
      current_visa_start_date: currentVisaStartDate || null,
      current_visa_end_date: currentVisaEndDate || null,
      current_visa_expiry_date: currentVisaEndDate || null,
      passport_number: passportNumber || null,
      passport_expiry_date: passportExpiryDate || null,
      passport_country: passportCountry || null,
      address_is_current: addressIsCurrent,
      current_address: currentAddress || null,
      address_proof_provided: addressProofProvided,
      right_to_work_status: currentCase.pathway === 'visa_switch' ? rightToWorkStatus : null,
      right_to_work_proof_provided: currentCase.pathway === 'visa_switch' ? rightToWorkProofProvided : null,
      uk_status_share_code: currentCase.pathway === 'visa_switch' ? (ukStatusShareCode || null) : null,
      last_updated_by: 'staff',
      last_updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('laurem_staff_visa_cases')
      .update({ additional_information: additional, updated_at: new Date().toISOString() })
      .eq('id', currentCase.id)
      .eq('staff_id', session.staff_id)
      .select('*')
      .single();
    if (error || !data) throw error || new Error('Unable to update visa information.');

    await client.from('laurem_staff_visa_case_events').insert({
      visa_case_id: currentCase.id,
      staff_id: session.staff_id,
      event_type: 'candidate_information_updated',
      actor_type: 'staff',
      actor: session.email,
      metadata: { action: 'candidate_information_updated' },
    });

    const { data: currentInvoice, error: invoiceError } = await client.from('laurem_staff_visa_invoices')
      .select('status')
      .eq('visa_case_id', currentCase.id)
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if (invoiceError) throw invoiceError;

    const readiness = buildLauremVisaReadiness({
      pathway: currentCase.pathway,
      staff: { id: session.staff_id },
      application: { id: currentCase.application_id },
      additionalInformation: additional,
      invoiceStatus: currentInvoice?.status || null,
    });
    return NextResponse.json({ case: data, readiness });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update visa information.' }, { status: 409 });
  }
}
