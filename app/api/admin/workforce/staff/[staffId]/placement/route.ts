import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { renderLauremFinalAssignmentContract } from '@/lib/laurem-final-assignment-contract';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { sendLauremEmail } from '@/lib/laurem-email';
import { lauremCompany } from '@/lib/laurem-company-config';

const TRAINING_LOCATIONS = ['Birmingham','London','Glasgow','Manchester'] as const;
type Context = { params: Promise<{ staffId: string }> };

function clean(value: unknown, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function positiveNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function validDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/, '');
}

export async function GET(request: NextRequest, context: Context) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staffId } = await context.params;
  if (!staffId) return NextResponse.json({ error: 'Staff id is required.' }, { status: 400 });

  const client = db();
  const [{ data: staff }, { data: placement }, { data: rota }] = await Promise.all([
    client.from('staff_profiles').select('id,full_name,email,job_title,employment_status,location').eq('id', staffId).maybeSingle(),
    client.from('laurem_staff_placement_terms').select('*').eq('staff_id', staffId).maybeSingle(),
    client.from('laurem_staff_rota_requests').select('id,status,preferred_training_location,regions,created_at,reviewed_at,review_note').eq('staff_id', staffId).not('status','eq','superseded').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  return NextResponse.json({ staff, placement: placement || null, latestRotaRequest: rota || null });
}

export async function POST(request: NextRequest, context: Context) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staffId } = await context.params;
  if (!staffId) return NextResponse.json({ error: 'Staff id is required.' }, { status: 400 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const principalWorkLocation = clean(body?.principalWorkLocation);
  const trainingLocation = clean(body?.trainingLocation) || null;
  const effectiveFrom = clean(body?.effectiveFrom, 10);
  const weeklyHours = positiveNumber(body?.weeklyHours);
  const hourlyRate = positiveNumber(body?.hourlyRate);

  if (!principalWorkLocation) return NextResponse.json({ error: 'The confirmed principal work location is required.' }, { status: 400 });
  if (!validDate(effectiveFrom)) return NextResponse.json({ error: 'A valid effective date is required.' }, { status: 400 });
  if (!weeklyHours || weeklyHours > 84) return NextResponse.json({ error: 'Weekly hours must be greater than 0 and no more than 84.' }, { status: 400 });
  if (!hourlyRate || hourlyRate > 1000) return NextResponse.json({ error: 'Hourly rate must be greater than 0 and no more than £1,000.' }, { status: 400 });
  if (trainingLocation && !TRAINING_LOCATIONS.includes(trainingLocation as typeof TRAINING_LOCATIONS[number])) {
    return NextResponse.json({ error: 'Select a valid training location.' }, { status: 400 });
  }

  const client = db();
  const { data: staff } = await client.from('staff_profiles')
    .select('id,full_name,email,job_title,employment_status,address_line_1,address_line_2,city,county,postcode,country')
    .eq('id', staffId)
    .maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  if (!['pending','active'].includes(staff.employment_status)) {
    return NextResponse.json({ error: 'Final assignment terms can only be issued to pending or active staff.' }, { status: 409 });
  }

  const { data: existingPlacement } = await client.from('laurem_staff_placement_terms')
    .select('*')
    .eq('staff_id', staffId)
    .maybeSingle();
  const version = Number(existingPlacement?.version || 0) + 1;
  const content = renderLauremFinalAssignmentContract({
    employeeName: staff.full_name,
    employeeAddress: [staff.address_line_1,staff.address_line_2,staff.city,staff.county,staff.postcode,staff.country].filter(Boolean).join(', ') || null,
    jobTitle: staff.job_title,
    effectiveFrom,
    weeklyHours,
    hourlyRate,
    principalWorkLocation,
    trainingLocation,
    version,
  });
  const documentHash = createHash('sha256').update(content, 'utf8').digest('hex');
  const now = new Date().toISOString();

  const { data: priorDocs } = await client.from('staff_documents')
    .select('id')
    .eq('staff_id', staffId)
    .eq('category','contract')
    .ilike('title','Final Assignment Contract%')
    .eq('status','issued');

  if (priorDocs?.length) {
    await client.from('staff_documents').update({
      status:'superseded', superseded_at:now, updated_at:now,
    }).in('id', priorDocs.map((doc:any)=>doc.id));
  }

  const { data: document, error: documentError } = await client.from('staff_documents').insert({
    staff_id: staffId,
    category: 'contract',
    title: 'Final Assignment Contract',
    description: 'Assignment-specific confirmation of the employee\'s current pay rate, principal work location and training location.',
    mime_type: 'text/plain',
    content_text: content,
    document_sha256: documentHash,
    source_type: 'contract',
    source_key: 'final-assignment-contract:' + staffId + ':v' + version,
    status: 'issued',
    requires_signature: true,
    signature_status: 'pending',
    issuer_name: lauremCompany.documentIssuer.name,
    issuer_title: lauremCompany.documentIssuer.title,
    employer_name: lauremCompany.legalName,
    issued_by_actor: session.email,
    issued_at: now,
  }).select('id,staff_id,title,status,requires_signature,signature_status,issued_at').single();

  if (documentError || !document) {
    return NextResponse.json({ error: 'Unable to issue the final assignment contract.' }, { status: 500 });
  }

  const { data: placement, error: placementError } = await client.from('laurem_staff_placement_terms')
    .upsert({
      staff_id: staffId,
      version,
      training_location: trainingLocation,
      principal_work_location: principalWorkLocation,
      hourly_rate: hourlyRate,
      weekly_hours: weeklyHours,
      effective_from: effectiveFrom,
      status: 'issued',
      contract_document_id: document.id,
      issued_at: now,
      issued_by: session.email,
      updated_at: now,
    }, { onConflict:'staff_id' })
    .select('*')
    .single();

  if (placementError || !placement) {
    return NextResponse.json({ error: 'The contract was issued but the placement record could not be saved.' }, { status: 500 });
  }

  await client.from('staff_profiles').update({ location: principalWorkLocation, updated_at: now }).eq('id', staffId);

  await client.from('staff_document_events').insert({
    document_id: document.id,
    staff_id: staffId,
    event_type: 'created',
    actor_type: 'admin',
    actor: session.email,
    metadata: { source:'final_assignment_contract', version, principalWorkLocation, trainingLocation, hourlyRate, weeklyHours, effectiveFrom, document_sha256:documentHash },
  });

  await client.from('laurem_audit_events').insert({
    lifecycle_area:'workforce',
    entity_type:'final_assignment_contract',
    entity_id:document.id,
    staff_id:staffId,
    actor_type:'admin',
    actor:session.email,
    action:'final_assignment_contract_issued',
    new_state:'issued',
    metadata:{ version, principalWorkLocation, trainingLocation, hourlyRate, weeklyHours, effectiveFrom },
  });

  await createLauremStaffNotification(client, {
    staffId,
    category:'documents',
    title:'Final assignment contract issued',
    body:'Your final assignment contract is now available in your Staff Portal and requires your electronic signature.',
    actionUrl:'/staff/documents/' + document.id,
  });

  const portalLink = appUrl() + '/staff/documents/' + document.id;
  const email = await sendLauremEmail(client, {
    eventType:'staff.final_assignment_contract.issued',
    entityId:document.id,
    idempotencyKey:'staff.final_assignment_contract.issued:' + document.id + ':' + now,
    payload:{
      from: process.env.RESEND_FROM_EMAIL || 'CONAGS Care <onboarding@resend.dev>',
      to:[staff.email],
      reply_to:lauremCompany.publicEmails.manager,
      subject:'Your CONAGS final assignment contract is ready',
      text:'Hello ' + staff.full_name + ',\n\nYour final CONAGS assignment contract is now available in your Staff Portal.\n\nConfirmed principal work location: ' + principalWorkLocation + '\nConfirmed hourly rate: £' + hourlyRate.toFixed(2) + ' per hour\nEffective from: ' + effectiveFrom + '\n\nPlease review and sign the document in your Staff Portal:\n' + portalLink + '\n\nKind regards,\n' + lauremCompany.documentIssuer.name + '\n' + lauremCompany.documentIssuer.title + '\n' + lauremCompany.documentIssuer.employer,
      html:'<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#173a31"><p style="font-weight:800;color:#0f766e">CONAGS CARE</p><h1>Final assignment contract</h1><p>Hello ' + staff.full_name + ',</p><p><strong>Work location:</strong> ' + principalWorkLocation + '<br/><strong>Hourly rate:</strong> £' + hourlyRate.toFixed(2) + ' per hour<br/><strong>Effective from:</strong> ' + effectiveFrom + '</p><p><a href="' + portalLink + '" style="display:inline-block;background:#0f766e;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:800">Review & sign final contract</a></p><p>Kind regards,<br/>' + lauremCompany.documentIssuer.name + '<br/>' + lauremCompany.documentIssuer.title + '</p></div>',
    },
  });

  return NextResponse.json({ placement, document, email:{ status:email.status, error:email.status==='failed'?email.error:null } }, { status:201 });
}
