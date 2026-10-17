import { NextRequest, NextResponse } from 'next/server';
import { readAdminSession } from '@/lib/admin-auth';
import { makeToken, hashToken } from '@/lib/token';
import { db } from '@/lib/db';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';
import { selectRound2Questions } from '@/lib/laurem-interview-engine';
import { lauremCompany } from '@/lib/laurem-company-config';
import { sendLauremEmail } from '@/lib/laurem-email';

function escapeHtml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function appUrl(){return(process.env.NEXT_PUBLIC_APP_URL||'https://recruitment.conagscare.com').replace(/\/$/,'');}

export async function POST(request:NextRequest){
  const session=readAdminSession(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>32000)return NextResponse.json({error:'Request payload is too large.'},{status:413});
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw) as Record<string,unknown>;}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400});}
  const applicationId=typeof body.applicationId==='string'?body.applicationId.trim():'';
  if(!applicationId)return NextResponse.json({error:'Application id is required.'},{status:400});
  try{
    const client=db();
    const {data:app,error:appError}=await client.from('recruitment_applications').select('id,full_name,email,role_applied,status,living_in_uk').eq('id',applicationId).maybeSingle();
    if(appError)throw appError;
    if(!app)return NextResponse.json({error:'Application not found.'},{status:404});
    const role=normalizeLauremRole(app.role_applied||'');
    if(!role)return NextResponse.json({error:'Application role is invalid.'},{status:409});
    const {data:attempt,error:attemptError}=await client.from('interview_attempts').select('id,score,total_questions,percent,status').eq('application_id',applicationId).eq('round',1).maybeSingle();
    if(attemptError)throw attemptError;
    if(!attempt||attempt.status!=='passed')return NextResponse.json({error:'The candidate must pass the first assessment before a second-stage invitation can be issued.'},{status:409});
    const {data:active,error:activeError}=await client.from('recruitment_second_interviews').select('id,status,expires_at').eq('application_id',applicationId).eq('status','sent').gt('expires_at',new Date().toISOString()).order('sent_at',{ascending:false}).limit(1).maybeSingle();
    if(activeError)throw activeError;
    if(active)return NextResponse.json({error:'An active second-stage invitation already exists for this candidate.',secondInterview:active},{status:409});

    const {data:existingRound2,error:existingRound2Error}=await client.from('interview_attempts').select('id,status').eq('application_id',applicationId).eq('round',2).maybeSingle();
    if(existingRound2Error)throw existingRound2Error;
    if(existingRound2?.status==='submitted')return NextResponse.json({error:'A completed second-stage assessment already exists for this candidate.'},{status:409});

    const token=makeToken();
    const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
    const {data:created,error:createError}=await client.rpc('laurem_create_second_interview_invitation',{p_application_id:applicationId,p_token_hash:hashToken(token),p_sent_by:session.email,p_expires_at:expiresAt});
    if(createError){
      if(createError.message?.includes('active_second_interview_exists'))return NextResponse.json({error:'An active second-stage invitation already exists for this candidate.'},{status:409});
      throw createError;
    }
    const invitation=Array.isArray(created)?created[0]:created;
    if(!invitation?.id)throw new Error('Second-stage invitation creation failed.');

    const selected=selectRound2Questions(role);
    const snapshot=selected.map(q=>({id:q.id,category:q.category,text:q.text,guidance:q.guidance}));
    const pathway=app.living_in_uk==='No'?'international':'uk';
    if(existingRound2){
      const {error:updateError}=await client.from('interview_attempts').update({second_interview_id:invitation.id,role,pathway,question_ids:selected.map(q=>q.id),question_snapshot:snapshot,answers:{},status:'in_progress',started_at:new Date().toISOString(),submitted_at:null,score:null,total_questions:20,updated_at:new Date().toISOString()}).eq('id',existingRound2.id).eq('status','in_progress');
      if(updateError)throw updateError;
    } else {
      const {error:insertError}=await client.from('interview_attempts').insert({application_id:applicationId,second_interview_id:invitation.id,round:2,role,pathway,question_ids:selected.map(q=>q.id),question_snapshot:snapshot,status:'in_progress',total_questions:20});
      if(insertError)throw insertError;
    }

    const link=`${appUrl()}/second-interview/${token}`;
    const safeName=escapeHtml(app.full_name);const safeRole=escapeHtml(role);const safeLink=escapeHtml(link);
    const email=await sendLauremEmail(client,{eventType:'second_interview_reissue',entityId:invitation.id,idempotencyKey:`second-interview:reissue:${invitation.id}`,payload:{from:lauremCompany.candidateCommunications.senderAddress,to:[app.email],reply_to:lauremCompany.candidateCommunications.replyToAddress,subject:`Your second-stage assessment with ${lauremCompany.tradingName}`,text:`Dear ${app.full_name},\n\nYour second-stage assessment for ${role} is ready.\n\nUse your private link:\n${link}\n\nThis link expires on ${new Date(expiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">Your second stage is ready</h1><p>Dear ${safeName},</p><p>Your practical and theory assessment for <strong>${safeRole}</strong> is ready.</p><p><a href="${safeLink}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Continue to second stage</a></p><p style="font-size:13px;color:#5c6c67">This private link expires on ${new Date(expiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.</p><p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`}});
    return NextResponse.json({secondInterview:invitation,link,email:{status:email.status,attempts:email.attempts,providerId:'providerId' in email?email.providerId:null,deliveryId:email.deliveryId}},{status:201});
  }catch(error){console.error(JSON.stringify({level:'error',event:'admin.second_interview.reissue_failed',actor:session.email,reason:error instanceof Error?error.message:'unknown'}));return NextResponse.json({error:'Unable to create the second-stage invitation.'},{status:500});}
}
