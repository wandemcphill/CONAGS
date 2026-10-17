import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';
import { getLauremRound2Bank } from '@/lib/laurem-interview-banks';
import { publicRound2Questions, selectRound2Questions } from '@/lib/laurem-interview-engine';

const MAX_BODY=512_000;

async function resolveContext(request:NextRequest){
  const token=request.headers.get('x-second-interview-token')||'';
  if(!token) throw new Error('TOKEN_REQUIRED');
  const client=db();
  const {data:invite,error}=await client.from('recruitment_second_interviews').select('id,status,expires_at,application_id').eq('token_hash',hashToken(token)).maybeSingle();
  if(error)throw error;
  if(!invite)throw new Error('NOT_FOUND');
  if(invite.status==='completed')throw new Error('COMPLETED');
  if(invite.expires_at&&new Date(invite.expires_at).getTime()<=Date.now())throw new Error('EXPIRED');
  if(!invite.application_id)throw new Error('APPLICATION_REQUIRED');
  const {data:application,error:applicationError}=await client.from('recruitment_applications').select('id,full_name,email,role_applied,living_in_uk,status').eq('id',invite.application_id).maybeSingle();
  if(applicationError)throw applicationError;
  if(!application)throw new Error('APPLICATION_REQUIRED');
  const role=normalizeLauremRole(application.role_applied||'');
  if(!role)throw new Error('INVALID_ROLE');
  return {client,invite,application,role};
}

export async function GET(request:NextRequest){
  try{
    const {client,invite,application,role}=await resolveContext(request);
    let {data:attempt,error}=await client.from('interview_attempts').select('id,question_snapshot,status,answers').eq('application_id',application.id).eq('round',2).eq('second_interview_id',invite.id).maybeSingle();
    if(error)throw error;
    if(!attempt){
      const selected=selectRound2Questions(role);
      const snapshot=selected.map(q=>({id:q.id,category:q.category,text:q.text,guidance:q.guidance}));
      const {data:created,error:createError}=await client.from('interview_attempts').insert({application_id:application.id,invite_id:null,second_interview_id:invite.id,round:2,role,pathway:application.living_in_uk==='No'?'international':'uk',question_ids:selected.map(q=>q.id),question_snapshot:snapshot,status:'in_progress'}).select('id,question_snapshot,status,answers').single();
      if(createError)throw createError;
      attempt=created;
    }
    const questions=Array.isArray(attempt.question_snapshot)?attempt.question_snapshot:[];
    return NextResponse.json({attemptId:attempt.id,role,status:attempt.status,questions:publicRound2Questions(questions as any),answers:attempt.answers||{},questionCount:questions.length});
  }catch(error){
    const code=error instanceof Error?error.message:'unknown';
    const status=code==='NOT_FOUND'?404:code==='EXPIRED'?410:code==='COMPLETED'?409:400;
    return NextResponse.json({error:code==='EXPIRED'?'This second-stage link has expired.':code==='COMPLETED'?'This second-stage assessment has already been completed.':code==='NOT_FOUND'?'Second-stage invitation not found.':'Unable to load your second-stage assessment.'},{status});
  }
}

export async function POST(request:NextRequest){
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY)return NextResponse.json({error:'Interview payload is too large.'},{status:413});
  let body:{attemptId?:string;answers?:Record<string,string>};
  try{body=JSON.parse(raw) as typeof body;}catch{return NextResponse.json({error:'Invalid request body.'},{status:400});}
  if(!body.attemptId)return NextResponse.json({error:'Assessment id is required.'},{status:400});
  try{
    const {client,invite,application}=await resolveContext(request);
    const {data:attempt,error:attemptError}=await client.from('interview_attempts').select('id,application_id,round,second_interview_id,question_snapshot,status').eq('id',body.attemptId).eq('application_id',application.id).eq('round',2).eq('second_interview_id',invite.id).maybeSingle();
    if(attemptError)throw attemptError;
    if(!attempt)return NextResponse.json({error:'Second-stage assessment not found.'},{status:404});
    if(attempt.status==='submitted')return NextResponse.json({error:'This second-stage assessment has already been submitted.'},{status:409});
    const snapshot=(Array.isArray(attempt.question_snapshot)?attempt.question_snapshot:[]) as Array<{id:string}>;
    if(snapshot.length!==20)return NextResponse.json({error:'This second-stage question set is invalid.'},{status:500});
    const answers=body.answers&&typeof body.answers==='object'?body.answers:{};
    for(const q of snapshot){if(typeof answers[q.id]!=='string'||!answers[q.id].trim())return NextResponse.json({error:'Please answer all questions before submitting.'},{status:400});if(answers[q.id].length>6000)return NextResponse.json({error:'One or more answers are too long.'},{status:400});}
    const {data,error}=await client.rpc('laurem_complete_round2',{p_attempt_id:attempt.id,p_answers:answers,p_actor:'candidate'});
    if(error||!data){if(error?.message==='ROUND2_ALREADY_SUBMITTED')return NextResponse.json({error:'This second-stage assessment has already been submitted.'},{status:409});throw error||new Error('Round 2 completion failed.');}
    return NextResponse.json({ok:true,status:'submitted'});
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'interview.round2_submit_failed',reason:error instanceof Error?error.message:'unknown'}));
    return NextResponse.json({error:'Unable to submit your second-stage assessment right now.'},{status:500});
  }
}
