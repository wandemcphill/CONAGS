import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { normalizeLauremRole, type LauremCanonicalRole } from '@/lib/laurem-role-policy';
import { getLauremRound1Bank, ROUND1_PASS_PERCENT, ROUND1_QUESTIONS_PER_ATTEMPT } from '@/lib/laurem-interview-banks';
import { publicRound1Questions, scoreRound1, selectRound1Questions } from '@/lib/laurem-interview-engine';
import { lauremCompany } from '@/lib/laurem-company-config';
import { sendLauremEmail } from '@/lib/laurem-email';

const MAX_BODY = 512_000;
function appUrl(){return(process.env.NEXT_PUBLIC_APP_URL||'https://recruitment.conagscare.com').replace(/\/$/,'');}
function escapeHtml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

async function resolveContext(request:NextRequest){
  const token=request.headers.get('x-invitation-token')||'';
  if(!token) throw new Error('INVITATION_TOKEN_REQUIRED');
  const client=db();
  const {data:invite,error:inviteError}=await client.from('recruitment_invites').select('id,candidate_name,candidate_email,role,expires_at').eq('token_hash',hashToken(token)).maybeSingle();
  if(inviteError) throw inviteError;
  if(!invite) throw new Error('INVITATION_NOT_FOUND');
  if(invite.expires_at&&new Date(invite.expires_at).getTime()<=Date.now()) throw new Error('INVITATION_EXPIRED');

  let {data:application,error:appError}=await client.from('recruitment_applications').select('id,full_name,email,role_applied,living_in_uk,invite_id,status').eq('invite_id',invite.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(appError) throw appError;

  // Admin reissued assessment links use a fresh invitation bound to the existing Round 1 attempt.
  if(!application){
    const {data:boundAttempt,error:boundAttemptError}=await client.from('interview_attempts').select('application_id').eq('invite_id',invite.id).eq('round',1).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(boundAttemptError) throw boundAttemptError;
    if(boundAttemptAttemptId(boundAttempt)){
      const {data:reissuedApplication,error:reissuedApplicationError}=await client.from('recruitment_applications').select('id,full_name,email,role_applied,living_in_uk,invite_id,status').eq('id',boundAttempt.application_id).maybeSingle();
      if(reissuedApplicationError) throw reissuedApplicationError;
      application=reissuedApplication;
    }
  }

  if(!application) throw new Error('APPLICATION_REQUIRED');
  const role=normalizeLauremRole(application.role_applied||invite.role);
  if(!role) throw new Error('INVALID_ROLE');
  return {client,invite,application,role,token};
}

function boundAttemptAttemptId(value: { application_id?: string | null } | null): value is { application_id: string } {
  return Boolean(value?.application_id);
}

export async function GET(request:NextRequest){
  try{
    const {client,invite,application,role}=await resolveContext(request);
    const pathway=application.living_in_uk==='No'?'international':'uk';
    const bank=getLauremRound1Bank(role);
    let {data:attempt,error}=await client.from('interview_attempts').select('id,question_ids,question_snapshot,status,score,total_questions,percent,pass_percent').eq('application_id',application.id).eq('round',1).maybeSingle();
    if(error) throw error;
    if(!attempt){
      const selected=selectRound1Questions(role);
      if(selected.length!==ROUND1_QUESTIONS_PER_ATTEMPT) throw new Error('ROUND1_SELECTION_FAILED');
      const snapshot=selected.map(q=>({id:q.id,category:q.category,text:q.text,options:q.options,correctIndex:q.correctIndex}));
      const {data:created,error:createError}=await client.from('interview_attempts').insert({application_id:application.id,invite_id:invite.id,round:1,role,pathway,question_ids:selected.map(q=>q.id),question_snapshot:snapshot,status:'in_progress'}).select('id,question_ids,question_snapshot,status,score,total_questions,percent,pass_percent').single();
      if(createError) throw createError;
      attempt=created;
      const transition = await client.rpc('laurem_transition_application_status', {
        p_application_id: application.id,
        p_to_status: 'Interview',
        p_actor: 'candidate.interview1.open',
        p_note: 'Candidate opened the Round 1 assessment.',
        p_override: false,
        p_override_reason: null,
      });
      if (transition.error) throw transition.error;
      void bank;
    }
    const snapshot=Array.isArray(attempt.question_snapshot)?attempt.question_snapshot:[];
    const publicQuestions=snapshot.map((q:any)=>({id:q.id,category:q.category,text:q.text,options:q.options}));
    return NextResponse.json({attemptId:attempt.id,role,pathway,status:attempt.status,score:attempt.score,totalQuestions:attempt.total_questions||publicQuestions.length,percent:attempt.percent,passPercent:attempt.pass_percent||ROUND1_PASS_PERCENT,questions:publicQuestions});
  }catch(error){
    const code=error instanceof Error?error.message:'unknown';
    const status=code==='INVITATION_NOT_FOUND'?404:code==='INVITATION_EXPIRED'?410:code==='APPLICATION_REQUIRED'?409:code==='INVITATION_TOKEN_REQUIRED'?400:400;
    return NextResponse.json({error:code==='INVITATION_TOKEN_REQUIRED'?'Invitation token is required.':code==='INVITATION_EXPIRED'?'This invitation has expired.':code==='APPLICATION_REQUIRED'?'Please submit your application before starting the assessment.':'Unable to load your assessment.'},{status});
  }
}

export async function POST(request:NextRequest){
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY)return NextResponse.json({error:'Interview payload is too large.'},{status:413});
  let body:{attemptId?:string;answers?:Record<string,unknown>};
  try{body=JSON.parse(raw) as typeof body;}catch{return NextResponse.json({error:'Invalid request body.'},{status:400});}
  if(!body.attemptId)return NextResponse.json({error:'Assessment id is required.'},{status:400});
  try{
    const {client,application,role}=await resolveContext(request);
    const {data:attempt,error:attemptError}=await client.from('interview_attempts').select('id,application_id,round,role,pathway,question_snapshot,status').eq('id',body.attemptId).eq('application_id',application.id).eq('round',1).maybeSingle();
    if(attemptError)throw attemptError;
    if(!attempt)return NextResponse.json({error:'Assessment not found.'},{status:404});
    if(attempt.status!=='in_progress')return NextResponse.json({error:'This assessment has already been submitted.'},{status:409});
    const snapshot=(Array.isArray(attempt.question_snapshot)?attempt.question_snapshot:[]) as Array<{id:string;category:string;text:string;options:string[];correctIndex:number}>;
    if(snapshot.length!==ROUND1_QUESTIONS_PER_ATTEMPT)return NextResponse.json({error:'This assessment question set is invalid.'},{status:500});
    const answers=body.answers&&typeof body.answers==='object'?body.answers:{};
    const missing=snapshot.filter(q=>!Number.isInteger(Number(answers[q.id])));
    if(missing.length)return NextResponse.json({error:`Please answer all questions before submitting. ${missing.length} remain.`},{status:400});
    const cleanAnswers:Record<string,number>={};
    for(const q of snapshot){
      const selected=Number(answers[q.id]);
      if(selected<0||selected>=q.options.length)return NextResponse.json({error:'One or more answers are invalid.'},{status:400});
      cleanAnswers[q.id]=selected;
    }
    const score=scoreRound1(snapshot as any,cleanAnswers);
    const secondToken=makeToken();
    const secondExpiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
    const {data:result,error}=await client.rpc('laurem_complete_round1',{p_attempt_id:attempt.id,p_answers:cleanAnswers,p_score:score.score,p_total_questions:score.total,p_pass_percent:ROUND1_PASS_PERCENT,p_second_token_hash:hashToken(secondToken),p_second_expires_at:secondExpiresAt,p_actor:'system'});
    if(error||!result){
      if(error?.message==='ROUND1_ALREADY_SUBMITTED')return NextResponse.json({error:'This assessment has already been submitted.'},{status:409});
      throw error||new Error('Round 1 completion failed.');
    }
    const completion=Array.isArray(result)?result[0]:result;
    if(completion?.passed&&completion.second_interview_id){
      const link=`${appUrl()}/second-interview/${secondToken}`;
      const safeName=escapeHtml(application.full_name); const safeRole=escapeHtml(role); const safeLink=escapeHtml(link);
      await sendLauremEmail(client,{eventType:'second_interview_auto_invitation',entityId:completion.second_interview_id,idempotencyKey:`second-interview:auto:${completion.second_interview_id}`,payload:{from:lauremCompany.candidateCommunications.senderAddress,to:[application.email],reply_to:lauremCompany.candidateCommunications.replyToAddress,subject:`You have progressed to the next stage with ${lauremCompany.tradingName}`,text:`Dear ${application.full_name},\n\nCongratulations. You have met the pass mark in the first-stage assessment for ${role}.\n\nYour second interview is now ready:\n${link}\n\nThis private link expires on ${new Date(secondExpiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.\n\nKind regards,\n${lauremCompany.tradingName} Recruitment`,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173a31;max-width:620px;margin:0 auto"><p style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#1f705e">${escapeHtml(lauremCompany.tradingName.toUpperCase())} RECRUITMENT</p><h1 style="font-size:28px">You have reached the next stage</h1><p>Dear ${safeName},</p><p>Thank you for completing the first assessment for <strong>${safeRole}</strong>.</p><p>You have met the required pass mark and your second-stage practical and theory interview is ready.</p><p><a href="${safeLink}" style="display:inline-block;background:#173a31;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Continue to the second interview</a></p><p style="font-size:13px;color:#5c6c67">This private link expires on ${new Date(secondExpiresAt).toLocaleDateString('en-GB',{dateStyle:'medium'})}.</p><p>Kind regards,<br>${escapeHtml(lauremCompany.tradingName)} Recruitment</p></div>`}});
    }
    return NextResponse.json({ok:true,score:completion.score,totalQuestions:completion.total_questions,percent:completion.percent,passed:completion.passed,secondInterviewIssued:Boolean(completion.second_interview_id)},{status:201});
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'interview.round1_submit_failed',reason:error instanceof Error?error.message:'unknown'}));
    return NextResponse.json({error:'Unable to submit your assessment right now.'},{status:500});
  }
}
