import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readAdminSession } from '@/lib/admin-auth';
import { getVisaCostSummary } from '@/lib/laurem-visa-help';
import { evaluateVisaHelpReadiness } from '@/lib/laurem-visa-help-workflow';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { monitorVisaHelpCase } from '@/lib/laurem-visa-help-monitor';
import { buildInitialVisaHelpMilestones } from '@/lib/laurem-visa-help-milestones';

export async function GET(request:NextRequest){
 const session=readAdminSession(request);
 if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
 try{
  const client=db();
  const {data:cases,error}=await client.from('laurem_staff_visa_help_cases')
   .select('id,staff_id,application_id,status,current_visa_type,current_visa_start_date,current_visa_end_date,living_in_uk,target_role,target_work_location,selected_route,confirmed_route,conversation_id,recommendation,answers,dependants,document_checklist,legal_team_requested,self_complete_selected,consent_to_legal_support,assigned_to,legal_review_completed,legal_review_completed_by,legal_review_completed_at,submission_ready_at,staff_message,legal_notes,submitted_at,reviewed_at,created_at,updated_at')
   .not('status','in','(closed,submitted)')
   .order('updated_at',{ascending:false})
   .limit(200);
  if(error)throw error;
  const rows=cases||[];
  const caseIds=rows.map((x:any)=>x.id);
  const staffIds=[...new Set(rows.map((x:any)=>x.staff_id))];
  const {data:staff,error:staffError}=staffIds.length?await client.from('laurem_staff_profiles').select('id,laurem_id,employee_number,full_name,email,job_title,employment_status,location,start_date').in('id',staffIds):{data:[],error:null};
  if(staffError)throw staffError;
  const {data:tasks,error:taskError}=caseIds.length?await client.from('laurem_staff_visa_help_tasks').select('*').in('visa_help_case_id',caseIds).order('created_at',{ascending:false}):{data:[],error:null};
  if(taskError)throw taskError;
  const {data:events,error:eventError}=caseIds.length?await client.from('laurem_staff_visa_help_events').select('id,visa_help_case_id,event_type,actor_type,actor,metadata,created_at').in('visa_help_case_id',caseIds).order('created_at',{ascending:false}).limit(500):{data:[],error:null};
  if(eventError)throw eventError;
  const {data:documentLinks,error:linkError}=caseIds.length?await client.from('laurem_staff_visa_help_documents').select('*').in('visa_help_case_id',caseIds).order('created_at',{ascending:false}):{data:[],error:null};
  if(linkError)throw linkError;
  const {data:existingMilestones,error:existingMilestoneError}=caseIds.length?await client.from('laurem_staff_visa_help_milestones').select('id,visa_help_case_id,milestone_type').in('visa_help_case_id',caseIds):{data:[],error:null};
  if(existingMilestoneError)throw existingMilestoneError;
  const existingKeys=new Set((existingMilestones||[]).map((m:any)=>m.visa_help_case_id+':'+m.milestone_type));
  const missingMilestones=rows.flatMap((row:any)=>buildInitialVisaHelpMilestones({
    staffId:row.staff_id,
    caseId:row.id,
    recommendationDecision:row.recommendation?.decision,
    legalTeamRequested:Boolean(row.legal_team_requested),
    caseStatus:row.status,
    submittedAt:row.submitted_at,
    outsideUk:!row.living_in_uk,
  }).filter((m:any)=>!existingKeys.has(row.id+':'+m.milestone_type)));
  if(missingMilestones.length){
    const {error:seedError}=await client.from('laurem_staff_visa_help_milestones').upsert(missingMilestones,{onConflict:'visa_help_case_id,milestone_type',ignoreDuplicates:true});
    if(seedError)throw seedError;
  }
  const {data:milestones,error:milestoneError}=caseIds.length?await client.from('laurem_staff_visa_help_milestones').select('*').in('visa_help_case_id',caseIds).order('position',{ascending:true}):{data:[],error:null};
  if(milestoneError)throw milestoneError;
  const {data:documents,error:docError}=caseIds.length?await client.from('laurem_staff_documents').select('id,staff_id,title,original_filename,issued_at').eq('category','visa_help').eq('status','issued').in('staff_id',staffIds).order('issued_at',{ascending:false}):{data:[],error:null};
  if(docError)throw docError;
  return NextResponse.json({cases:rows.map((row:any)=>{const rowTasks=(tasks||[]).filter((t:any)=>t.visa_help_case_id===row.id);const monitor=monitorVisaHelpCase({status:row.status,currentVisaEndDate:row.current_visa_end_date,tasks:rowTasks,legalTeamRequested:Boolean(row.legal_team_requested),recommendationDecision:row.recommendation?.decision,legalReviewCompleted:Boolean(row.legal_review_completed)});const readiness=evaluateVisaHelpReadiness({recommendation:row.recommendation,livingInUk:Boolean(row.living_in_uk),currentVisaType:row.current_visa_type,passportNumber:row.answers?.passportNumber,passportCountry:row.answers?.passportCountry,passportExpiryDate:row.answers?.passportExpiryDate,dependants:Array.isArray(row.dependants)?row.dependants:[],confirmedRoute:row.confirmed_route,legalReviewCompleted:Boolean(row.legal_review_completed),tasks:rowTasks});return {...row,monitor,staff:(staff||[]).find((s:any)=>s.id===row.staff_id)||null,documents:(documents||[]).filter((d:any)=>d.staff_id===row.staff_id),tasks:rowTasks,events:(events||[]).filter((e:any)=>e.visa_help_case_id===row.id),milestones:(milestones||[]).filter((m:any)=>m.visa_help_case_id===row.id),documentLinks:(documentLinks||[]).filter((d:any)=>d.visa_help_case_id===row.id),readiness,costSummary:getVisaCostSummary({route:row.confirmed_route||row.selected_route,outsideUk:!row.living_in_uk,durationMonths:Number(row.answers?.durationMonths||0)||null,durationYears:Number(row.answers?.durationYears||0)||null,dependantCount:Array.isArray(row.dependants)?row.dependants.length:0})};}),counts:{
   open:rows.length,
   legal:rows.filter((x:any)=>x.legal_team_requested).length,
   awaitingDocuments:rows.filter((x:any)=>x.status==='awaiting_documents').length,
   ready:rows.filter((x:any)=>x.status==='ready_for_submission').length,
  }});
 }catch(error){
  console.error(JSON.stringify({level:'error',event:'admin.visa_help.load_failed',reason:error instanceof Error?error.message:String(error)}));
  return NextResponse.json({error:'Unable to load Visa Help queue.'},{status:500});
 }
}

export async function PATCH(request:NextRequest){
 const session=readAdminSession(request);
 if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
 const body=await request.json().catch(()=>null) as Record<string,any>|null;
 const caseId=typeof body?.caseId==='string'?body.caseId:'';
 const confirmedRoute=typeof body?.confirmedRoute==='string'?body.confirmedRoute.trim().slice(0,120):null;
 const legalReviewCompleted=typeof body?.legalReviewCompleted==='boolean'?body.legalReviewCompleted:null;
 const status=typeof body?.status==='string'?body.status:'';
 const legalNotes=typeof body?.legalNotes==='string'?body.legalNotes.trim().slice(0,5000):null;
 const assignedTo=typeof body?.assignedTo==='string'?body.assignedTo.trim().slice(0,240):null;
 const allowed=new Set(['draft','triaged','awaiting_staff','legal_review','awaiting_documents','ready_for_submission','submitted','closed']);
 if(!caseId)return NextResponse.json({error:'Case id is required.'},{status:400});
 if(status&&!allowed.has(status))return NextResponse.json({error:'Invalid Visa Help status.'},{status:400});
 try{
  const client=db();
  const {data:existing,error:loadError}=await client.from('laurem_staff_visa_help_cases').select('id,staff_id,status,living_in_uk,current_visa_type,recommendation,answers,dependants,document_checklist,confirmed_route,legal_review_completed').eq('id',caseId).maybeSingle();
  if(loadError)throw loadError;
  if(!existing)return NextResponse.json({error:'Visa Help case not found.'},{status:404});
  const {data:tasks,error:taskError}=await client.from('laurem_staff_visa_help_tasks').select('task_type,title,required,status').eq('visa_help_case_id',caseId);
  if(taskError)throw taskError;
  const {data:documentLinks,error:linkError}=await client.from('laurem_staff_visa_help_documents').select('checklist_key,status').eq('visa_help_case_id',caseId);
  if(linkError)throw linkError;
  const effectiveConfirmedRoute=confirmedRoute!==null?confirmedRoute:existing.confirmed_route;
  const effectiveLegalReviewCompleted=legalReviewCompleted!==null?legalReviewCompleted:Boolean(existing.legal_review_completed);
  if(status==='ready_for_submission'){
    const readiness=evaluateVisaHelpReadiness({recommendation:existing.recommendation,livingInUk:Boolean(existing.living_in_uk),currentVisaType:existing.current_visa_type,passportNumber:existing.answers?.passportNumber,passportCountry:existing.answers?.passportCountry,passportExpiryDate:existing.answers?.passportExpiryDate,dependants:Array.isArray(existing.dependants)?existing.dependants:[],confirmedRoute:effectiveConfirmedRoute,legalReviewCompleted:effectiveLegalReviewCompleted,tasks:tasks||[],documentChecklist:Array.isArray(existing.document_checklist)?existing.document_checklist:[],documentLinks:documentLinks||[]});
    if(!readiness.ready)return NextResponse.json({error:'Case is not ready for submission.',readiness},{status:409});
  }
  if(status==='submitted'&&existing.status!=='ready_for_submission')return NextResponse.json({error:'The case must pass the ready-for-submission gate first.'},{status:409});
  const patch:any={updated_at:new Date().toISOString()};
  if(status)patch.status=status;
  if(confirmedRoute!==null)patch.confirmed_route=confirmedRoute;
  if(legalReviewCompleted!==null){patch.legal_review_completed=legalReviewCompleted;patch.legal_review_completed_by=legalReviewCompleted?session.email:null;patch.legal_review_completed_at=legalReviewCompleted?new Date().toISOString():null;}
  if(legalNotes!==null)patch.legal_notes=legalNotes;
  if(assignedTo!==null)patch.assigned_to=assignedTo;
  if(['legal_review','awaiting_documents','ready_for_submission'].includes(status))patch.reviewed_at=new Date().toISOString();
  if(status==='ready_for_submission')patch.submission_ready_at=new Date().toISOString();
  if(status==='submitted')patch.submitted_at=new Date().toISOString();
  const {data,error}=await client.from('laurem_staff_visa_help_cases').update(patch).eq('id',caseId).select('*').single();
  if(error)throw error;
  await client.from('laurem_staff_visa_help_events').insert({
   visa_help_case_id:caseId,staff_id:existing.staff_id,event_type:'admin_case_update',actor_type:'admin',actor:session.email,
   metadata:{from:existing.status,to:status||existing.status,assignedTo,hasNotes:Boolean(legalNotes)}
  });
  if(status && status!==existing.status){
    const labels:Record<string,string>={
      awaiting_staff:'CONAGS needs more information from you',
      awaiting_documents:'CONAGS needs additional visa documents',
      legal_review:'Your Visa Help case is under legal/support review',
      ready_for_submission:'Your Visa Help case is marked ready for submission',
      submitted:'Your Visa Help case is marked submitted',
      closed:'Your Visa Help case has been closed',
    };
    await createLauremStaffNotification(client,{
      staffId:existing.staff_id,
      category:'compliance',
      title:labels[status]||'Your Visa Help case was updated',
      body:'CONAGS updated your Visa Help case status to '+status.replaceAll('_',' ')+'.',
      actionUrl:'/staff/visa-help',
    });
  }
  return NextResponse.json({case:data});
 }catch(error){
  console.error(JSON.stringify({level:'error',event:'admin.visa_help.update_failed',caseId,reason:error instanceof Error?error.message:String(error)}));
  return NextResponse.json({error:'Unable to update Visa Help case.'},{status:500});
 }
}
