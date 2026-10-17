import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { deriveVisaHelpCaseStatus } from '@/lib/laurem-visa-help-workflow';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const client = db();
    const { data: tasks, error } = await client.from('laurem_staff_visa_help_tasks')
      .select('*')
      .eq('staff_id', session.staff_id)
      .eq('visibility','staff')
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ tasks: tasks || [] });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'staff.visa_help.tasks.load_failed', staffId:session.staff_id, reason:error instanceof Error?error.message:String(error) }));
    return NextResponse.json({ error:'Unable to load Visa Help requests.' }, { status:500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error:'Unauthorised' }, { status:401 });
  const body = await request.json().catch(() => null) as Record<string, any> | null;
  const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
  const responseText = typeof body?.responseText === 'string' ? body.responseText.trim().slice(0, 10000) : '';
  const responseDocumentId = typeof body?.responseDocumentId === 'string' ? body.responseDocumentId : null;
  if (!taskId) return NextResponse.json({ error:'Task id is required.' }, { status:400 });
  if (!responseText && !responseDocumentId) return NextResponse.json({ error:'Provide a response or attach a document before submitting the request.' }, { status:400 });

  try {
    const client = db();
    const { data: task, error: taskError } = await client.from('laurem_staff_visa_help_tasks')
      .select('id,visa_help_case_id,staff_id,task_type,status,title,visibility')
      .eq('id', taskId).eq('staff_id', session.staff_id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return NextResponse.json({ error:'Visa Help request not found.' }, { status:404 });
    if (task.visibility !== 'staff') return NextResponse.json({ error:'This Visa Help request is internal and is not awaiting a staff response.' }, { status:403 });
    if (!['open','rejected'].includes(task.status)) return NextResponse.json({ error:'This request is not waiting for a staff response.' }, { status:409 });

    if (responseDocumentId) {
      const { data:doc, error:docError } = await client.from('laurem_staff_documents')
        .select('id,staff_id,category,status').eq('id',responseDocumentId).maybeSingle();
      if (docError) throw docError;
      if (!doc || doc.staff_id !== session.staff_id || doc.category !== 'visa_help' || doc.status !== 'issued') {
        return NextResponse.json({ error:'The attached document is not available for this Visa Help case.' }, { status:422 });
      }
      const { data:link, error:linkError } = await client.from('laurem_staff_visa_help_documents')
        .select('id,visa_help_case_id,staff_id,document_id').eq('visa_help_case_id',task.visa_help_case_id).eq('staff_id',session.staff_id).eq('document_id',responseDocumentId).maybeSingle();
      if (linkError) throw linkError;
      if (!link) return NextResponse.json({error:'Upload the document through this Visa Help case before attaching it to a request.'},{status:422});
    }

    const now = new Date().toISOString();
    const { data:updated, error:updateError} = await client.from('laurem_staff_visa_help_tasks')
      .update({ status:'submitted', response_text:responseText || null, response_document_id:responseDocumentId, submitted_at:now, updated_at:now })
      .eq('id',taskId).eq('staff_id',session.staff_id).select('*').single();
    if (updateError) throw updateError;

    const {data:caseRow,error:caseError}=await client.from('laurem_staff_visa_help_cases')
      .select('id,legal_team_requested,recommendation')
      .eq('id',task.visa_help_case_id).eq('staff_id',session.staff_id).single();
    if(caseError)throw caseError;
    const {data:allTasks,error:allTasksError}=await client.from('laurem_staff_visa_help_tasks')
      .select('task_type,required,status,visibility')
      .eq('visa_help_case_id',task.visa_help_case_id);
    if(allTasksError)throw allTasksError;
    const nextStatus=deriveVisaHelpCaseStatus({
      tasks:(allTasks||[]) as any,
      legalTeamRequested:Boolean(caseRow.legal_team_requested),
      recommendationDecision:caseRow.recommendation?.decision,
    });
    await client.from('laurem_staff_visa_help_cases')
      .update({ status:nextStatus, updated_at:now })
      .eq('id',task.visa_help_case_id).eq('staff_id',session.staff_id);

    await client.from('laurem_staff_visa_help_events').insert({
      visa_help_case_id:task.visa_help_case_id,
      staff_id:session.staff_id,
      event_type:'visa_help_task_submitted',
      actor_type:'staff',
      actor:session.email,
      metadata:{taskId,taskType:task.task_type,hasResponseText:Boolean(responseText),responseDocumentId},
    });

    await createLauremStaffNotification(client,{
      staffId:session.staff_id,
      category:'compliance',
      title:'Visa Help request submitted',
      body:'Your response to “'+task.title+'” has been submitted for CONAGS review.',
      actionUrl:'/staff/visa-help',
    });

    return NextResponse.json({ task:updated }, { status:200 });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', event:'staff.visa_help.tasks.submit_failed', staffId:session.staff_id, taskId, reason:error instanceof Error?error.message:String(error) }));
    return NextResponse.json({ error:'Unable to submit the Visa Help request.' }, { status:500 });
  }
}
