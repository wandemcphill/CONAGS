import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';

export async function PATCH(request: NextRequest) {
  const session = readAdminSession(request);
  if (!session) return NextResponse.json({ error:'Unauthorised' }, { status:401 });
  const body = await request.json().catch(() => null) as Record<string, any> | null;
  const linkId = typeof body?.linkId === 'string' ? body.linkId : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const reviewerNote = typeof body?.reviewerNote === 'string' ? body.reviewerNote.trim().slice(0,5000) : null;
  if (!linkId || !['accept','reject'].includes(action)) return NextResponse.json({ error:'Document link and valid action are required.' }, { status:400 });

  try {
    const client=db();
    const {data:link,error:linkError}=await client.from('laurem_staff_visa_help_documents').select('*').eq('id',linkId).maybeSingle();
    if(linkError)throw linkError;
    if(!link)return NextResponse.json({error:'Visa Help document link not found.'},{status:404});
    const status=action==='accept'?'accepted':'rejected';
    const now=new Date().toISOString();
    const {data:updated,error:updateError}=await client.from('laurem_staff_visa_help_documents').update({
      status,
      reviewer_note:reviewerNote,
      reviewed_by:session.email,
      reviewed_at:now,
      updated_at:now,
    }).eq('id',linkId).select('*').single();
    if(updateError)throw updateError;

    if(status==='accepted' || status==='rejected'){
      const {data:linkedTasks,error:linkedTaskError}=await client.from('laurem_staff_visa_help_tasks')
        .select('id,status,title').eq('visa_help_case_id',link.visa_help_case_id).eq('response_document_id',link.document_id).eq('visibility','staff');
      if(linkedTaskError)throw linkedTaskError;
      for(const task of linkedTasks||[]){
        if(task.status==='submitted'){
          const taskStatus=status==='accepted'?'verified':'rejected';
          await client.from('laurem_staff_visa_help_tasks').update({
            status:taskStatus,
            reviewer_note:reviewerNote,
            reviewed_by:session.email,
            reviewed_at:now,
            updated_at:now,
          }).eq('id',task.id);
          await client.from('laurem_staff_visa_help_events').insert({
            visa_help_case_id:link.visa_help_case_id,
            staff_id:link.staff_id,
            event_type:'visa_help_request_reviewed',
            actor_type:'admin',
            actor:session.email,
            metadata:{taskId:task.id,from:'submitted',to:taskStatus,documentId:link.document_id,via:'document_review'},
          });
        }
      }
    }

    await client.from('laurem_staff_visa_help_events').insert({
      visa_help_case_id:link.visa_help_case_id,
      staff_id:link.staff_id,
      event_type:'visa_help_document_reviewed',
      actor_type:'admin',
      actor:session.email,
      metadata:{documentLinkId:linkId,documentId:link.document_id,checklistKey:link.checklist_key,status,reviewerNote:reviewerNote||null},
    });

    await createLauremStaffNotification(client,{
      staffId:link.staff_id,
      category:'compliance',
      title:'Visa Help document '+status,
      body:(status==='accepted'?'CONAGS accepted':'CONAGS needs a new version of')+' your submitted document.'+(reviewerNote?' '+reviewerNote:''),
      actionUrl:'/staff/visa-help',
    });

    return NextResponse.json({document:updated},{status:200});
  } catch(error) {
    console.error(JSON.stringify({level:'error',event:'admin.visa_help.document_review_failed',linkId,reason:error instanceof Error?error.message:String(error)}));
    return NextResponse.json({error:'Unable to review the Visa Help document.'},{status:500});
  }
}
