import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';
import { selectRound1Questions } from '@/lib/laurem-interview-engine';
import { ROUND1_PASS_PERCENT, ROUND1_QUESTIONS_PER_ATTEMPT } from '@/lib/laurem-interview-banks';
import { sendLauremEmail } from '@/lib/laurem-email';
import { lauremCompany } from '@/lib/laurem-company-config';
import { isLauremRecruitmentStatus } from '@/lib/laurem-recruitment-lifecycle';

function adminOrUnauthorized(request:NextRequest){return readAdminSession(request);}
function escapeHtml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function appUrl(){return(process.env.NEXT_PUBLIC_APP_URL||'https://recruitment.conagscare.com').replace(/\/$/,'');}

export async function GET(request:NextRequest){
  const session=adminOrUnauthorized(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  try{
    const {data,error}=await db().from('recruitment_applications').select('id,full_name,preferred_name,email,phone,nationality,country_of_residence,role_applied,employment_type,start_date,living_in_uk,current_country,requires_sponsorship,status,created_at,updated_at').order('created_at',{ascending:false}).limit(250);
    if(error)throw error;
    return NextResponse.json({applications:data||[],recruiter:session.email});
  }catch(error){console.error(JSON.stringify({level:'error',event:'admin.applications.list_failed',reason:error instanceof Error?error.message:'unknown'}));return NextResponse.json({error:'Unable to load applications.'},{status:500});}
}

export async function DELETE(request:NextRequest){
  const session=adminOrUnauthorized(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  const id=new URL(request.url).searchParams.get('id')?.trim()||'';
  if(!id)return NextResponse.json({error:'Application id is required.'},{status:400});
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>8000)return NextResponse.json({error:'Request payload is too large.'},{status:413});
  let body:{confirmation?:string};
  try{body=JSON.parse(raw||'{}') as typeof body;}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
  if(body.confirmation!=='DELETE APPLICATION')return NextResponse.json({error:'Type DELETE APPLICATION to confirm permanent deletion.'},{status:400});
  try{
    const client=db();
    const {data:application,error:applicationError}=await client.from('recruitment_applications').select('id,full_name,email,status').eq('id',id).maybeSingle();
    if(applicationError)throw applicationError;
    if(!application)return NextResponse.json({error:'Application not found.'},{status:404});
    const {data:staff,error:staffError}=await client.from('staff_profiles').select('id,employment_status').eq('application_id',id).maybeSingle();
    if(staffError)throw staffError;
    if(staff&&['active','on_leave','suspended'].includes(String(staff.employment_status||'').toLowerCase()))return NextResponse.json({error:'This application is linked to an active workforce record and cannot be permanently deleted.'},{status:409});
    const {error:deleteError}=await client.from('recruitment_applications').delete().eq('id',id);
    if(deleteError)throw deleteError;
    console.info(JSON.stringify({level:'info',event:'admin.application.deleted',actor:session.email,applicationId:id,candidateName:application.full_name,statusAtDeletion:application.status}));
    return NextResponse.json({ok:true,deleted:true,applicationId:id});
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'admin.application.delete_failed',actor:session.email,applicationId:id,reason:error instanceof Error?error.message:'unknown'}));
    return NextResponse.json({error:'Unable to delete application.'},{status:500});
  }
}

export async function PATCH(request:NextRequest){
  const session=adminOrUnauthorized(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  const id=new URL(request.url).searchParams.get('id');
  if(!id)return NextResponse.json({error:'Application id is required.'},{status:400});
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>32000)return NextResponse.json({error:'Request payload is too large.'},{status:413});
  let body:{status?:string;note?:string;override?:boolean;overrideReason?:string};
  try{body=JSON.parse(raw) as typeof body;}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
  const status=body.status?.trim()||'';const note=typeof body.note==='string'?body.note.trim():null;const override=body.override===true;const overrideReason=typeof body.overrideReason==='string'?body.overrideReason.trim():null;
  if(!isLauremRecruitmentStatus(status))return NextResponse.json({error:'Invalid recruitment status.'},{status:400});
  if(override&&!overrideReason)return NextResponse.json({error:'An override reason is required.'},{status:400});
  try{
    const client=db();
    const {data:current,error:currentError}=await client.from('recruitment_applications').select('id,full_name,email,status,role_applied,living_in_uk').eq('id',id).maybeSingle();
    if(currentError)throw currentError;
    if(!current)return NextResponse.json({error:'Application not found.'},{status:404});
    if(current.status===status&&!note&&!override)return NextResponse.json({application:current,overridden:false,statusEmail:{status:'skipped',reason:'unchanged'}});
    const {data,error}=await client.rpc('laurem_transition_application_status',{p_application_id:id,p_to_status:status,p_actor:session.email,p_note:note,p_override:override,p_override_reason:overrideReason});
    if(error||!data){const message=error?.message||'';if(message.includes('APPLICATION_NOT_FOUND'))return NextResponse.json({error:'Application not found.'},{status:404});if(message.includes('STATUS_TRANSITION_BLOCKED'))return NextResponse.json({error:error?.details||'The requested transition is blocked by the current lifecycle controls.'},{status:409});if(message.includes('OVERRIDE_REASON_REQUIRED'))return NextResponse.json({error:'An override reason is required.'},{status:400});if(message.includes('INVALID_RECRUITMENT_STATUS'))return NextResponse.json({error:'Invalid recruitment status.'},{status:400});return NextResponse.json({error:'Unable to update application status.'},{status:500});}

    let assessmentEmail:{status:string;attempts:number;providerId:string|null;deliveryId:string|null;error?:string;link?:string;expiresAt?:string;questions?:number}={status:'skipped',attempts:0,providerId:null,deliveryId:null};
    if(status==='Interview'){
      const role=normalizeLauremRole(current.role_applied||'');
      if(!role)return NextResponse.json({error:'Application role is invalid.'},{status:409});
      const pathway=current.living_in_uk==='No'?'international':'uk';
      let {data:attempt,error:attemptError}=await client.from('interview_attempts').select('id,status,invite_id,question_snapshot,question_ids,total_questions,pass_percent').eq('application_id',id).eq('round',1).maybeSingle();
      if(attemptError)throw attemptError;
      if(!attempt || attempt.status==='in_progress'){
        const token=makeToken();
        const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
        const {data:newInvite,error:newInviteError}=await client.from('recruitment_invites').insert({candidate_name:current.full_name,candidate_email:current.email,role,token_hash:hashToken(token),expires_at:expiresAt,used_at:null}).select('id,candidate_name,candidate_email,role,expires_at').single();
        if(newInviteError||!newInvite)throw newInviteError||new Error('Unable to create interview invitation.');
        if(!attempt){
          const selected=selectRound1Questions(role);
          if(selected.length!==ROUND1_QUESTIONS_PER_ATTEMPT)throw new Error('ROUND1_SELECTION_FAILED');
          const snapshot=selected.map(q=>({id:q.id,category:q.category,text:q.text,options:q.options,correctIndex:q.correctIndex}));
          const {data:created,error:createError}=await client.from('interview_attempts').insert({application_id:id,invite_id:newInvite.id,round:1,role,pathway,question_ids:selected.map(q=>q.id),question_snapshot:snapshot,status:'in_progress',total_questions:ROUND1_QUESTIONS_PER_ATTEMPT,pass_percent:ROUND1_PASS_PERCENT}).select('id,status,invite_id,question_snapshot,question_ids,total_questions,pass_percent').single();
          if(createError||!created)throw createError||new Error('Unable to create first assessment.');
          attempt=created;
        }else{
          const {error:updateAttemptError}=await client.from('interview_attempts').update({invite_id:newInvite.id,updated_at:new Date().toISOString()}).eq('id',attempt.id).eq('status','in_progress');
          if(updateAttemptError)throw updateAttemptError;
        }
        const link=`${appUrl()}/interview/${token}`;
        const safeName=escapeHtml(current.full_name);const safeRole=escapeHtml(role);const safeLink=escapeHtml(link);
        const email=await sendLauremEmail(client,{eventType:'round1_assessment_invitation',entityId:id,idempotencyKey:`round1-assessment:admin:${id}:${newInvite.id}`,payload:{from:lauremCompany.candidateCommunications.senderAddress,to:[current.email],reply_to:lauremCompany.candidateCommunications.replyToAddress,subject:`Your first assessment with ${lauremCompany.tradingName}`,text:`Dear ${current.full_name},\n\nYou have been invited to the first-stage assessment for ${role}.\n\nStart here:\n${link}\n\nThis private link expires on ${new Date(expiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">Your first assessment is ready</h1><p>Dear ${safeName},</p><p>Your first-stage assessment for <strong>${safeRole}</strong> is ready.</p><p><a href="${safeLink}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Start the assessment</a></p><p style="font-size:13px;color:#5c6c67">This private link expires on ${new Date(expiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.</p><p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`}});
        assessmentEmail={status:email.status,attempts:email.attempts,providerId:'providerId' in email?email.providerId:null,deliveryId:email.deliveryId,link,expiresAt,questions:ROUND1_QUESTIONS_PER_ATTEMPT,...(email.status==='failed'?{error:email.error}: {})};
      }
    }
    const safeName=escapeHtml(current.full_name);const safeRole=escapeHtml(current.role_applied||'your application');const safeStatus=escapeHtml(status);const transitionKey=typeof data?.updated_at==='string'?data.updated_at:new Date().toISOString();
    const email=await sendLauremEmail(client,{eventType:'application_status_change',entityId:id,idempotencyKey:`application-status:${id}:${status}:${transitionKey}`,payload:{from:lauremCompany.candidateCommunications.senderAddress,to:[current.email],reply_to:lauremCompany.candidateCommunications.replyToAddress,subject:`Recruitment update from ${lauremCompany.tradingName}`,text:`Dear ${current.full_name},\n\nYour recruitment application for ${current.role_applied||'the position'} has been updated to: ${status}.\n\n${status==='Interview'?'Your private first-stage assessment link has been sent separately.':''}\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">Recruitment status update</h1><p>Dear ${safeName},</p><p>Your application for <strong>${safeRole}</strong> has been updated.</p><p style="font-size:18px"><strong>Current status:</strong> ${safeStatus}</p>${status==='Interview'?'<p>Your private first-stage assessment link has been sent in a separate email.</p>':'<p>If you have been asked to take an action, please use the private link previously provided to you.</p>'}<p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`}});
    console.info(JSON.stringify({level:'info',event:'admin.application.status_changed',actor:session.email,applicationId:id,fromStatus:current.status,status,override,assessmentEmailStatus:assessmentEmail.status}));
    return NextResponse.json({application:data,overridden:override,statusEmail:{status:email.status,attempts:email.attempts,providerId:'providerId' in email?email.providerId:null,deliveryId:email.deliveryId,...(email.status==='failed'?{error:email.error}:{}),...(email.status==='not_configured'?{reason:'not_configured'}:{})},assessmentEmail});
  }catch(error){console.error(JSON.stringify({level:'error',event:'admin.application.status_change_failed',actor:session.email,reason:error instanceof Error?error.message:'unknown'}));return NextResponse.json({error:'Unable to update application status.'},{status:500});}
}
