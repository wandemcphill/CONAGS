import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { assertLauremVisaCoSAssignment, assertLauremVisaStatusTransition, isLauremVisaStatus, type LauremVisaStatus } from '@/lib/laurem-visa-lifecycle';
import { buildLauremVisaReadiness, canAdvanceLauremVisaToSmsSubmission } from '@/lib/laurem-visa-readiness';
import { getLauremSponsorshipOccupation } from '@/lib/laurem-sponsorship-occupation';

export async function GET(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staffId } = await params;
  try {
    const client = db();
    const { data: staff, error: staffError } = await client.from('staff_profiles')
      .select('id,application_id,employee_number,laurem_id,full_name,email,phone,job_title,employment_status,start_date,location,nmc_number')
      .eq('id', staffId).maybeSingle();
    if (staffError) throw staffError;
    if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

    const { data: application, error: applicationError } = await client.from('recruitment_applications')
      .select('id,full_name,preferred_name,email,phone,date_of_birth,nationality,country_of_residence,address,role_applied,start_date,living_in_uk,current_country,work_permission,requires_sponsorship')
      .eq('id', staff.application_id).maybeSingle();
    if (applicationError) throw applicationError;

    const { data: visaCase, error: caseError } = await client.from('staff_visa_cases')
      .select('*').eq('staff_id', staffId).order('requested_at',{ascending:false}).limit(1).maybeSingle();
    if (caseError) throw caseError;

    let invoice = null;
    let events: any[] = [];
    if (visaCase) {
      const invoiceResult = await client.from('staff_visa_invoices').select('*').eq('visa_case_id', visaCase.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if (invoiceResult.error) throw invoiceResult.error;
      invoice = invoiceResult.data;
      const eventsResult = await client.from('staff_visa_case_events').select('id,event_type,actor_type,actor,metadata,created_at').eq('visa_case_id', visaCase.id).order('created_at',{ascending:false}).limit(100);
      if (eventsResult.error) throw eventsResult.error;
      events = eventsResult.data || [];
    }

    const { data: visaDocuments, error: documentError } = await client.from('staff_documents')
      .select('id,title,description,original_filename,mime_type,file_size_bytes,status,category,issued_at,issued_by_actor')
      .eq('staff_id', staffId).eq('category','visa_sponsorship').order('issued_at',{ascending:false});
    if (documentError) throw documentError;

    const sponsorshipOccupation = getLauremSponsorshipOccupation(application?.role_applied || staff.job_title);
    const readiness = visaCase ? buildLauremVisaReadiness({ pathway: visaCase.pathway, staff: staff as Record<string, unknown>, application: application as Record<string, unknown>, additionalInformation: (visaCase.additional_information || {}) as Record<string, unknown>, invoiceStatus: invoice?.status || null }) : null;
    const { data: paymentAccount, error: paymentAccountError } = await client.from('laurem_payment_accounts')
      .select('account_name,bank_name,account_number,sort_code,iban,bic_swift,bank_address,currency')
      .eq('account_key','primary_gbp').eq('is_active',true).maybeSingle();
    if (paymentAccountError) throw paymentAccountError;

    const paymentBankDetails = paymentAccount ? {
      accountName: paymentAccount.account_name,
      bankName: paymentAccount.bank_name,
      accountNumber: paymentAccount.account_number || '',
      sortCode: paymentAccount.sort_code || '',
      iban: paymentAccount.iban || '',
      swiftBic: paymentAccount.bic_swift || '',
      bankAddress: paymentAccount.bank_address || '',
      currency: paymentAccount.currency || 'GBP',
    } : null;

    return NextResponse.json({ staff, application, case: visaCase, invoice, events, visaDocuments: visaDocuments || [], readiness, sponsorshipOccupation, paymentBankDetails, smsUrl: 'https://www.gov.uk/sponsor-management-system', actor: session.email });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'admin.staff.visa.load_failed', reason:error instanceof Error?error.message:String(error) }));
    return NextResponse.json({ error: 'Unable to load the visa sponsorship case.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staffId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const status = typeof body?.status === 'string' ? body.status : '';
  const pathway = typeof body?.pathway === 'string' ? body.pathway : '';
  const smsReference = typeof body?.smsReference === 'string' ? body.smsReference.trim().slice(0,160) : '';
  const cosNumber = typeof body?.cosNumber === 'string' ? body.cosNumber.trim().slice(0,160) : '';
  const adminNotes = typeof body?.adminNotes === 'string' ? body.adminNotes.trim().slice(0,5000) : '';
  const markPaid = body?.markPaid === true;
  if (status && !isLauremVisaStatus(status)) return NextResponse.json({ error: 'Invalid visa case status.' }, { status: 400 });
  if (pathway && !['visa_switch','international_sponsorship'].includes(pathway)) return NextResponse.json({ error: 'Invalid visa pathway.' }, { status: 400 });
  try {
    const client = db();
    const { data: current, error: caseError } = await client.from('staff_visa_cases').select('*').eq('staff_id', staffId).order('requested_at',{ascending:false}).limit(1).maybeSingle();
    if (caseError) throw caseError;
    if (!current) return NextResponse.json({ error: 'No visa sponsorship case exists for this staff member.' }, { status: 404 });
    const currentStatus = String(current.status) as LauremVisaStatus;
    if (!isLauremVisaStatus(currentStatus)) throw new Error('Invalid visa case state stored in the database.');

    const { data: staff, error: staffError } = await client.from('staff_profiles')
      .select('id,application_id,full_name,email,job_title,start_date')
      .eq('id', staffId).maybeSingle();
    if (staffError) throw staffError;
    const { data: application, error: applicationError } = current.application_id
      ? await client.from('recruitment_applications').select('id,full_name,email,role_applied,start_date').eq('id', current.application_id).maybeSingle()
      : { data: null, error: null };
    if (applicationError) throw applicationError;

    const { data: currentInvoice, error: invoiceError } = await client.from('staff_visa_invoices')
      .select('*').eq('visa_case_id', current.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (invoiceError) throw invoiceError;

    const readiness = buildLauremVisaReadiness({
      pathway: status === '' && pathway ? pathway : (pathway || current.pathway),
      staff: staff as Record<string, unknown> | null,
      application: application as Record<string, unknown> | null,
      additionalInformation: (current.additional_information || {}) as Record<string, unknown>,
      invoiceStatus: currentInvoice?.status || (markPaid ? 'paid' : null),
    });

    if (status) assertLauremVisaStatusTransition(currentStatus, status as LauremVisaStatus);
    if (!canAdvanceLauremVisaToSmsSubmission({ targetStatus: status, readiness })) {
      return NextResponse.json({
        error: 'The visa case is not ready for SMS preparation/submission.',
        readiness,
      }, { status: 409 });
    }
    if (cosNumber) {
      if (status && status !== 'cos_assigned') return NextResponse.json({ error: 'A Certificate of Sponsorship number can only accompany the cos_assigned transition.' }, { status: 409 });
      assertLauremVisaCoSAssignment(currentStatus);
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    else if (cosNumber) patch.status = 'cos_assigned';
    if (pathway) patch.pathway = pathway;
    if (smsReference) patch.sms_reference = smsReference;
    if (cosNumber) { patch.cos_number = cosNumber; patch.cos_assigned_at = new Date().toISOString(); }
    if (adminNotes) patch.admin_notes = adminNotes;
    if (status === 'admin_review') patch.admin_reviewed_at = new Date().toISOString();
    if (status === 'submitted_to_sms') patch.submitted_to_sms_at = new Date().toISOString();
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    if (status === 'declined') patch.declined_at = new Date().toISOString();
    if (status === 'withdrawn') patch.withdrawn_at = new Date().toISOString();
    const { data: updatedCase, error: updateError } = await client.from('staff_visa_cases').update(patch).eq('id', current.id).eq('staff_id', staffId).select('*').single();
    if (updateError || !updatedCase) throw updateError || new Error('Unable to update visa case.');
    let invoice = null;
    if (markPaid) {
      const { data: paidInvoice, error: paidError } = await client.from('staff_visa_invoices')
        .update({ status:'paid', paid_at:new Date().toISOString(), payment_reference:typeof body?.paymentReference==='string'?body.paymentReference.trim().slice(0,160):null, payment_method:typeof body?.paymentMethod==='string'?body.paymentMethod.trim().slice(0,80):null, updated_at:new Date().toISOString() })
        .eq('visa_case_id', current.id).eq('status','issued').select('*').maybeSingle();
      if (paidError) throw paidError;
      invoice = paidInvoice;
      if (paidInvoice) await client.from('staff_visa_case_events').insert({ visa_case_id:current.id, staff_id:staffId, event_type:'payment_recorded', actor_type:'admin', actor:session.email, metadata:{ invoice_number:paidInvoice.invoice_number, payment_reference:paidInvoice.payment_reference, payment_method:paidInvoice.payment_method } });
    }
    if (status || pathway || smsReference || cosNumber || adminNotes) {
      const notificationStatus = status || (cosNumber ? 'cos_assigned' : pathway ? 'pathway_changed' : 'admin_reviewed');
      await createLauremStaffNotification(client, {
        staffId,
        category: 'visa_sponsorship',
        title: 'Visa sponsorship update',
        body: cosNumber ? `Your Certificate of Sponsorship has been assigned: ${cosNumber}.` : `Your visa sponsorship case was updated to ${notificationStatus.replaceAll('_', ' ')}.`,
        actionUrl: '/staff/visa-sponsorship',
      });
      const eventType = status === 'submitted_to_sms' ? 'submitted_to_sms' : cosNumber ? 'cos_assigned' : pathway ? 'pathway_changed' : 'admin_reviewed';
      await client.from('staff_visa_case_events').insert({ visa_case_id:current.id, staff_id:staffId, event_type:eventType, actor_type:'admin', actor:session.email, metadata:{ status:status||null, pathway:pathway||null, sms_reference:smsReference||null, cos_number:cosNumber||null } });
    }
    return NextResponse.json({ case: updatedCase, invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error?error.message:'Unable to update the visa sponsorship case.' }, { status: 409 });
  }
}