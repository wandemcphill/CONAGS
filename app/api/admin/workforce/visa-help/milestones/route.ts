import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';

const ALLOWED_STATUS=new Set(['pending','in_progress','completed','skipped']);

export async function PATCH(request:NextRequest){
  const session=readAdminSession(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  const body=await request.json().catch(()=>null) as Record<string,any>|null;
  const milestoneId=typeof body?.milestoneId==='string'?body.milestoneId:'';
  const status=typeof body?.status==='string'?body.status:'';
  const notes=typeof body?.notes==='string'?body.notes.trim().slice(0,5000):null;
  const dueAt=typeof body?.dueAt==='string'&&body.dueAt?body.dueAt:null;
  if(!milestoneId||!ALLOWED_STATUS.has(status))return NextResponse.json({error:'Milestone id and valid status are required.'},{status:400});
  if(dueAt&&Number.isNaN(new Date(dueAt).getTime()))return NextResponse.json({error:'Milestone due date is invalid.'},{status:422});
  try{
    const client=db();
    const {data:milestone,error:loadError}=await client.from('laurem_staff_visa_help_milestones').select('*').eq('id',milestoneId).maybeSingle();
    if(loadError)throw loadError;
    if(!milestone)return NextResponse.json({error:'Visa Help milestone not found.'},{status:404});
    const now=new Date().toISOString();
    const completed=status==='completed';
    const update:any={
      status,
      notes,
      due_at:dueAt?new Date(dueAt).toISOString():milestone.due_at,
      completed_at:completed?(milestone.completed_at||now):null,
      completed_by:completed?(milestone.completed_by||session.email):null,
      updated_at:now,
    };
    const {data:updated,error:updateError}=await client.from('laurem_staff_visa_help_milestones').update(update).eq('id',milestoneId).select('*').single();
    if(updateError)throw updateError;

    await client.from('laurem_staff_visa_help_events').insert({
      visa_help_case_id:milestone.visa_help_case_id,
      staff_id:milestone.staff_id,
      event_type:'visa_help_milestone_updated',
      actor_type:'admin',
      actor:session.email,
      metadata:{milestoneId,title:milestone.title,from:milestone.status,to:status,dueAt:update.due_at,notes:notes||null},
    });

    await createLauremStaffNotification(client,{
      staffId:milestone.staff_id,
      category:'compliance',
      title:'Visa Help milestone updated',
      body:milestone.title+' is now '+status.replaceAll('_',' ')+'.',
      actionUrl:'/staff/visa-help',
    });

    return NextResponse.json({milestone:updated},{status:200});
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'admin.visa_help.milestone_update_failed',milestoneId,reason:error instanceof Error?error.message:String(error)}));
    return NextResponse.json({error:'Unable to update the Visa Help milestone.'},{status:500});
  }
}
