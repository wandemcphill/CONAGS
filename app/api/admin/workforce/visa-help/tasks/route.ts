import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { getOrCreateVisaHelpConversation } from '@/lib/laurem-messaging';

export async function POST(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error:'Unauthorised' }, { status:401 });
  const body = await request.json().catch(() => null) as Record<string, any> | null;
  const caseId = typeof body?.caseId === 'string' ? body.caseId : '';
  const taskType = typeof body?.taskType === 'string' ? body.taskType : '';
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0,200) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0,4000) : '';
  const required = body?.required !== false;
  const visibility = body?.visibility === 'internal' ? 'internal' : 'staff';
  const rawDueAt = typeof body?.dueAt === 'string' && body.dueAt ? body.dueAt : null;
  const parsedDueAt = rawDueAt ? new Date(rawDueAt) : null;
  if(parsedDueAt && Number.isNaN(parsedDueAt.getTime())) return NextResponse.json({error:'Due date is invalid.'},{status:422});
  const dueAt = parsedDueAt ? parsedDueAt.toISOString() : null;
  if (!caseId || !['information','document','action'].includes(taskType) || !title) {
    return NextResponse.json({ error:'Case, request type and title are required.' }, { status:400 });
  }

  try {
    const client = db();
    const { data:caseRow, error:caseError } = await client.from('laurem_staff_visa_help_cases')
      .select('id,staff_id,status,conversation_id').eq('id',caseId).maybeSingle();
    if (caseError) throw caseError;
    if (!caseRow) return NextResponse.json({ error:'Visa Help case not found.' }, { status:404 });
    if (['closed','submitted'].includes(caseRow.status)) return NextResponse.json({ error:'This Visa Help case is no longer accepting new requests.' }, { status:409 });

    const { data:task, error:taskError} = await client.from('laurem_staff_visa_help_tasks')
      .insert({
        visa_help_case_id:caseId,
        staff_id:caseRow.staff_id,
        task_type:taskType,
        visibility,
        title,
        description,
        required,
        requested_by_actor_type:'admin',
        requested_by:session.email,
        due_at:dueAt,
      })
      .select('*').single();
    if (taskError) throw taskError;

    const nextStatus=visibility==='internal'?'legal_review':taskType==='document'?'awaiting_documents':'awaiting_staff';
    await client.from('laurem_staff_visa_help_cases').update({status:nextStatus,updated_at:new Date().toISOString()}).eq('id',caseId);

    await client.from('laurem_staff_visa_help_events').insert({
      visa_help_case_id:caseId,
      staff_id:caseRow.staff_id,
      event_type:'visa_help_request_created',
      actor_type:'admin',
      actor:session.email,
      metadata:{taskId:task.id,taskType,title,required,dueAt},
    });

    if(visibility==='staff') await createLauremStaffNotification(client,{
      staffId:caseRow.staff_id,
      category:'compliance',
      title:'CONAGS requested '+(taskType==='document'?'a document':taskType==='information'?'more information':'an action'),
      body:title+(description?' · '+description:''),
      actionUrl:'/staff/visa-help',
    });

    let conversationId=caseRow.conversation_id;
    if(visibility==='staff'){
      try {
        const conversation=await getOrCreateVisaHelpConversation(client,caseRow.staff_id,caseId);
        conversationId=conversation.id;
        if(!caseRow.conversation_id) {
          await client.from('laurem_staff_visa_help_cases').update({conversation_id:conversation.id}).eq('id',caseId);
        }
        const now=new Date().toISOString();
        await client.from('laurem_staff_messages').insert({
          conversation_id:conversation.id,
          sender_admin_email:session.email,
          body:'Visa Help request: '+title+(description?'\\n\\n'+description:'')+(dueAt?'\\n\\nDue: '+new Date(dueAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):''),
        });
        await client.from('laurem_staff_message_conversations').update({last_message_at:now,updated_at:now}).eq('id',conversation.id);
      } catch (messageError) {
        console.error(JSON.stringify({level:'warn',event:'admin.visa_help.task_message_failed',caseId,reason:messageError instanceof Error?messageError.message:String(messageError)}));
      }
    }

    return NextResponse.json({ task, conversationId }, { status:201 });
  } catch (error) {
    console.error(JSON.stringify({level:'error',event:'admin.visa_help.task_create_failed',caseId,reason:error instanceof Error?error.message:String(error)}));
    return NextResponse.json({ error:'Unable to create the Visa Help request.' }, { status:500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error:'Unauthorised' }, { status:401 });
  const body = await request.json().catch(() => null) as Record<string, any> | null;
  const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const reviewerNote = typeof body?.reviewerNote === 'string' ? body.reviewerNote.trim().slice(0,5000) : null;
  if (!taskId || !['verify','reject','reopen','cancel'].includes(action)) return NextResponse.json({ error:'Task id and valid action are required.' }, { status:400 });

  try {
    const client=db();
    const { data:task,error:taskError}=await client.from('laurem_staff_visa_help_tasks')
      .select('*').eq('id',taskId).maybeSingle();
    if(taskError)throw taskError;
    if(!task)return NextResponse.json({error:'Visa Help request not found.'},{status:404});
    if(action==='verify'&&task.status!=='submitted')return NextResponse.json({error:'Only a submitted request can be verified.'},{status:409});
    if(action==='reject'&&task.status!=='submitted')return NextResponse.json({error:'Only a submitted request can be rejected.'},{status:409});
    if(action==='reopen'&&task.status!=='rejected')return NextResponse.json({error:'Only a rejected request can be reopened.'},{status:409});
    if(action==='cancel'&&['verified','cancelled'].includes(task.status))return NextResponse.json({error:'This request cannot be cancelled in its current state.'},{status:409});
    const status=action==='verify'?'verified':action==='reject'?'rejected':action==='reopen'?'open':'cancelled';
    const now=new Date().toISOString();
    const {data:updated,error:updateError}=await client.from('laurem_staff_visa_help_tasks').update({
      status,
      reviewed_at:status==='verified'||status==='rejected'?now:null,
      reviewed_by:status==='verified'||status==='rejected'?session.email:null,
      reviewer_note:reviewerNote,
      updated_at:now,
    }).eq('id',taskId).select('*').single();
    if(updateError)throw updateError;

    await client.from('laurem_staff_visa_help_events').insert({
      visa_help_case_id:task.visa_help_case_id,
      staff_id:task.staff_id,
      event_type:'visa_help_request_reviewed',
      actor_type:'admin',
      actor:session.email,
      metadata:{taskId,from:task.status,to:status,action,reviewerNote:reviewerNote||null},
    });

    if(task.visibility==='internal' && task.title==='Complete CONAGS legal/support review' && action==='verify'){
      await client.from('laurem_staff_visa_help_cases').update({
        legal_review_completed:true,
        legal_review_completed_by:session.email,
        legal_review_completed_at:now,
        updated_at:now,
      }).eq('id',task.visa_help_case_id);
      await client.from('laurem_staff_visa_help_events').insert({
        visa_help_case_id:task.visa_help_case_id,
        staff_id:task.staff_id,
        event_type:'legal_review_completed',
        actor_type:'legal',
        actor:session.email,
        metadata:{taskId:task.id,reviewerNote:reviewerNote||null},
      });
    }

    if(task.visibility==='staff'){
      const bodyText=action==='verify'
        ? 'CONAGS verified your request: '+task.title+'.'
        : action==='reject'
          ? 'CONAGS needs more work on your request: '+task.title+(reviewerNote?' · '+reviewerNote:'')
          : action==='reopen'
            ? 'CONAGS reopened your request: '+task.title+'.'
            : 'CONAGS cancelled your request: '+task.title+'.';
      await createLauremStaffNotification(client,{staffId:task.staff_id,category:'compliance',title:'Visa Help request updated',body:bodyText,actionUrl:'/staff/visa-help'});
    }

    return NextResponse.json({task:updated},{status:200});
  } catch(error) {
    console.error(JSON.stringify({level:'error',event:'admin.visa_help.task_review_failed',taskId,reason:error instanceof Error?error.message:String(error)}));
    return NextResponse.json({error:'Unable to update the Visa Help request.'},{status:500});
  }
}
