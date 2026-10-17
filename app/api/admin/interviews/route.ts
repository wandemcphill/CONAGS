import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';
import { selectRound1Questions } from '@/lib/laurem-interview-engine';
import { ROUND1_PASS_PERCENT, ROUND1_QUESTIONS_PER_ATTEMPT } from '@/lib/laurem-interview-banks';
import { sendLauremEmail } from '@/lib/laurem-email';
import { lauremCompany } from '@/lib/laurem-company-config';
import { getRequestId, logOperationalError, operationalError, withRequestId } from '@/lib/laurem-operational';

const allowedStatus = new Set(['Scheduled', 'Completed', 'Cancelled', 'Rescheduled', 'No-show']);
function adminOrUnauthorized(request: NextRequest) { return readAdminSession(request); }
function escapeHtml(value: string) { return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function formatDate(value: string) { return new Date(value).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }); }
function appUrl() { return (process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment.conagscare.com').replace(/\/$/,''); }

async function sendInterviewEmail(input: { id:string; candidateName:string; candidateEmail:string; scheduledAt:string; durationMinutes:number; location:string; meetingLink:string|null; interviewer:string|null; candidateInstructions:string|null; assessmentLink?:string; event:'scheduled'|'rescheduled'|'cancelled' }) {
  const safeName=escapeHtml(input.candidateName), safeDate=escapeHtml(formatDate(input.scheduledAt)), safeLocation=escapeHtml(input.location), safeInterviewer=escapeHtml(input.interviewer||lauremCompany.tradingName), safeMeeting=input.meetingLink?escapeHtml(input.meetingLink):'', safeInstructions=escapeHtml(input.candidateInstructions||''), safeAssessment=input.assessmentLink?escapeHtml(input.assessmentLink):'';
  const subject=input.event==='scheduled'?`Interview scheduled with ${lauremCompany.tradingName}`:input.event==='rescheduled'?`Your interview has been rescheduled: ${lauremCompany.tradingName}`:`Interview update from ${lauremCompany.tradingName}`;
  const title=input.event==='scheduled'?'Your interview is scheduled':input.event==='rescheduled'?'Your interview has been rescheduled':'Your interview has been cancelled';
  const assessmentText=input.assessmentLink?`\nYour first-stage assessment is available here:\n${input.assessmentLink}\n\nPlease complete the assessment before the scheduled interview.\n`:'';
  const assessmentHtml=input.assessmentLink?`<p><strong>Your first-stage assessment</strong></p><p>Complete the ${ROUND1_QUESTIONS_PER_ATTEMPT}-question role-based assessment before the interview.</p><p><a href="${safeAssessment}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Start the assessment</a></p>`:'';
  const text=input.event==='cancelled'?`Dear ${input.candidateName},\n\nYour interview with ${lauremCompany.tradingName} has been cancelled. Please contact ${lauremCompany.publicEmails.recruitment} if you need further information.\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`:`Dear ${input.candidateName},\n\n${title}.\n\nDate and time: ${formatDate(input.scheduledAt)}\nDuration: ${input.durationMinutes} minutes\nLocation: ${input.location}\nInterviewer: ${input.interviewer||lauremCompany.tradingName}\n${input.meetingLink?`Meeting link: ${input.meetingLink}\n`:''}${input.candidateInstructions?`Instructions: ${input.candidateInstructions}\n`:''}${assessmentText}\nKind regards,\n${lauremCompany.tradingName} Recruitment`;
  return sendLauremEmail(db(),{eventType:`interview_${input.event}`,entityId:input.id,idempotencyKey:`interview:${input.id}:${input.event}:${new Date(input.scheduledAt).toISOString()}`,payload:{from:lauremCompany.candidateCommunications.senderAddress,to:[input.candidateEmail],reply_to:lauremCompany.candidateCommunications.replyToAddress,subject,text,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">${title}</h1><p>Dear ${safeName},</p>${input.event==='cancelled'?`<p>Your interview with ${escapeHtml(lauremCompany.tradingName)} has been cancelled. Please contact <a href="mailto:${escapeHtml(lauremCompany.publicEmails.recruitment)}">${escapeHtml(lauremCompany.publicEmails.recruitment)}</a> if you need further information.</p>`:`<p>Here are the interview details:</p><ul><li><strong>Date and time:</strong> ${safeDate}</li><li><strong>Duration:</strong> ${input.durationMinutes} minutes</li><li><strong>Location:</strong> ${safeLocation}</li><li><strong>Interviewer:</strong> ${safeInterviewer}</li></ul>${safeMeeting?`<p><a href="${safeMeeting}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Open meeting link</a></p>`:''}${safeInstructions?`<p><strong>Candidate instructions</strong><br>${safeInstructions.replaceAll('\\n','<br>')}</p>`:''}${assessmentHtml}`}<p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`}});
}

export async function POST(request: NextRequest) {
  const requestId=getRequestId(request); const session=adminOrUnauthorized(request); if(!session)return operationalError(requestId,'Unauthorised',401,'UNAUTHORISED');
  const raw=await request.text(); if(new TextEncoder().encode(raw).byteLength>32000)return NextResponse.json({error:'Request payload is too large.'},{status:413});
  let body:Record<string,unknown>; try{body=JSON.parse(raw) as Record<string,unknown>;}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400});}
  const applicationId=typeof body.applicationId==='string'?body.applicationId.trim():''; const scheduledAt=typeof body.scheduledAt==='string'?body.scheduledAt:''; const durationMinutes=Number(body.durationMinutes||60);
  if(!applicationId||!scheduledAt||!Number.isFinite(new Date(scheduledAt).getTime()))return NextResponse.json({error:'Application and valid interview date/time are required.'},{status:400});
  if(!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>240)return NextResponse.json({error:'Interview duration must be between 15 and 240 minutes.'},{status:400});
  try{
    const client=db();
    const {data:application,error:appError}=await client.from('recruitment_applications').select('id,full_name,email,role_applied,living_in_uk').eq('id',applicationId).maybeSingle(); if(appError)throw appError;
    if(!application)return NextResponse.json({error:'Application not found.'},{status:404});
    const role=normalizeLauremRole(application.role_applied||''); if(!role)return NextResponse.json({error:'Application role is invalid.'},{status:409});
    let {data:attempt,error:attemptError}=await client.from('interview_attempts').select('id,application_id,round,status').eq('application_id',applicationId).eq('round',1).maybeSingle(); if(attemptError)throw attemptError;
    if(!attempt){
      const selected=selectRound1Questions(role); if(selected.length!==ROUND1_QUESTIONS_PER_ATTEMPT)throw new Error('ROUND1_SELECTION_FAILED');
      const snapshot=selected.map(q=>({id:q.id,category:q.category,text:q.text,options:q.options,correctIndex:q.correctIndex}));
      const {data:createdAttempt,error:createAttemptError}=await client.from('interview_attempts').insert({application_id:applicationId,round:1,role,pathway:application.living_in_uk==='No'?'international':'uk',question_ids:selected.map(q=>q.id),question_snapshot:snapshot,status:'in_progress',total_questions:ROUND1_QUESTIONS_PER_ATTEMPT,pass_percent:ROUND1_PASS_PERCENT}).select('id,application_id,round,status').single();
      if(createAttemptError)throw createAttemptError; attempt=createdAttempt;
    }
    const assessmentToken=makeToken(); const assessmentExpiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
    const {data:newInvite,error:newInviteError}=await client.from('recruitment_invites').insert({candidate_name:application.full_name,candidate_email:application.email,role,token_hash:hashToken(assessmentToken),expires_at:assessmentExpiresAt,used_at:null}).select('id').single();
    if(newInviteError||!newInvite)throw new Error(newInviteError?.message||'Unable to create assessment invitation.');
    const {error:rebindError}=await client.from('recruitment_applications').update({invite_id:newInvite.id,updated_at:new Date().toISOString()}).eq('id',applicationId); if(rebindError)throw rebindError;
    const {error:attemptInviteError}=await client.from('interview_attempts').update({invite_id:newInvite.id,updated_at:new Date().toISOString()}).eq('id',attempt.id); if(attemptInviteError)throw attemptInviteError;
    const assessmentLink=`${appUrl()}/interview/${assessmentToken}`;
    const location=typeof body.location==='string'&&body.location.trim()?body.location.trim():'Online'; const interviewer=typeof body.interviewer==='string'&&body.interviewer.trim()?body.interviewer.trim():session.email; const candidateInstructions=typeof body.candidateInstructions==='string'?body.candidateInstructions.trim().slice(0,4000):null; const meetingLink=typeof body.meetingLink==='string'&&body.meetingLink.trim()?body.meetingLink.trim():null;
    const {data,error}=await client.from('recruitment_interviews').insert({application_id:applicationId,scheduled_at:new Date(scheduledAt).toISOString(),duration_minutes:durationMinutes,location,meeting_link:meetingLink,interviewer,candidate_instructions:candidateInstructions,status:'Scheduled'}).select('*').single(); if(error)throw error;
    const email=await sendInterviewEmail({id:data.id,candidateName:application.full_name,candidateEmail:application.email,scheduledAt:data.scheduled_at,durationMinutes:data.duration_minutes||durationMinutes,location:data.location||location,meetingLink:data.meeting_link,interviewer:data.interviewer,candidateInstructions:data.candidate_instructions,assessmentLink,event:'scheduled'});
    return withRequestId(NextResponse.json({interview:data,assessment:{link:assessmentLink,expiresAt:assessmentExpiresAt,questions:ROUND1_QUESTIONS_PER_ATTEMPT},email:{status:email.status,attempts:email.attempts,providerId:'providerId' in email?email.providerId:null,deliveryId:email.deliveryId,...(email.status==='failed'?{error:email.error}:{} )}},{status:201}), requestId);
  }catch(error){logOperationalError({requestId,event:'admin.interview.schedule_failed',actor:session.email,reason:error});return operationalError(requestId,'Unable to schedule interview.',500,'INTERVIEW_SCHEDULE_FAILED');}
}

export async function PATCH(request: NextRequest) {
  const session=adminOrUnauthorized(request); if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  const id=new URL(request.url).searchParams.get('id'); if(!id)return NextResponse.json({error:'Interview id is required.'},{status:400});
  const raw=await request.text(); if(new TextEncoder().encode(raw).byteLength>32000)return NextResponse.json({error:'Request payload is too large.'},{status:413});
  let body:Record<string,unknown>; try{body=JSON.parse(raw) as Record<string,unknown>;}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400});}
  const client=db(); const {data:current,error:currentError}=await client.from('recruitment_interviews').select('*,application:recruitment_applications(id,full_name,email)').eq('id',id).maybeSingle();
  if(currentError)return NextResponse.json({error:'Unable to load interview.'},{status:500}); if(!current)return NextResponse.json({error:'Interview not found.'},{status:404});
  const status=typeof body.status==='string'?body.status:undefined; if(status&&!allowedStatus.has(status))return NextResponse.json({error:'Invalid interview status.'},{status:400});
  const patch:Record<string,unknown>={updated_at:new Date().toISOString()}; const nextScheduled=typeof body.scheduledAt==='string'?body.scheduledAt:current.scheduled_at; if(!Number.isFinite(new Date(nextScheduled).getTime()))return NextResponse.json({error:'Invalid interview date/time.'},{status:400});
  if(typeof body.scheduledAt==='string')patch.scheduled_at=new Date(body.scheduledAt).toISOString(); if(typeof body.meetingLink==='string')patch.meeting_link=body.meetingLink.trim()||null; if(typeof body.interviewer==='string')patch.interviewer=body.interviewer.trim()||null; if(typeof body.candidateInstructions==='string')patch.candidate_instructions=body.candidateInstructions.trim().slice(0,4000)||null; if(typeof body.cancellationReason==='string')patch.cancellation_reason=body.cancellationReason.trim().slice(0,2000)||null;
  if(status)patch.status=status; if(status==='Cancelled')patch.cancelled_at=new Date().toISOString(); if(status==='Rescheduled')patch.reschedule_count=Number(current.reschedule_count||0)+1;
  const {data,error}=await client.from('recruitment_interviews').update(patch).eq('id',id).select('*').maybeSingle(); if(error)return NextResponse.json({error:'Unable to update interview.'},{status:500}); if(!data)return NextResponse.json({error:'Interview not found.'},{status:404});
  const application=Array.isArray(current.application)?current.application[0]:current.application; let emailStatus:null|Record<string,unknown>=null;
  if(application?.email&&(status==='Cancelled'||status==='Rescheduled'||typeof body.scheduledAt==='string')){const event=status==='Cancelled'?'cancelled':'rescheduled';const email=await sendInterviewEmail({id:data.id,candidateName:application.full_name,candidateEmail:application.email,scheduledAt:data.scheduled_at,durationMinutes:data.duration_minutes||60,location:data.location||'Online',meetingLink:data.meeting_link,interviewer:data.interviewer,candidateInstructions:data.candidate_instructions,event});emailStatus={status:email.status,attempts:email.attempts,providerId:'providerId' in email?email.providerId:null,deliveryId:email.deliveryId,...(email.status==='failed'?{error:email.error}:{})};}
  return NextResponse.json({interview:data,email:emailStatus});
}
