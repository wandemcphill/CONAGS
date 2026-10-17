import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';

const MAX_FILE_BYTES=10*1024*1024;
const ALLOWED_MIME=new Set(['application/pdf','text/plain','text/markdown','image/png','image/jpeg']);

export async function POST(request:NextRequest){
  const session=await getStaffSession(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});

  try{
    const form=await request.formData();
    const checklistKey=typeof form.get('checklistKey')==='string'?String(form.get('checklistKey')).trim().slice(0,120):null;
    const taskId=typeof form.get('taskId')==='string'?String(form.get('taskId')).trim():null;
    const title=typeof form.get('title')==='string'?String(form.get('title')).trim().slice(0,160):'';
    const fileEntry=form.get('file');
    const file=fileEntry instanceof File && fileEntry.size>0?fileEntry:null;
    if(!title)return NextResponse.json({error:'Document title is required.'},{status:400});
    if(!file)return NextResponse.json({error:'Select a document to upload.'},{status:400});
    if(file.size>MAX_FILE_BYTES)return NextResponse.json({error:'Visa documents must be 10 MB or smaller.'},{status:400});
    if(!ALLOWED_MIME.has(file.type))return NextResponse.json({error:'Upload a PDF, text, Markdown, PNG or JPEG document.'},{status:400});

    const client=db();
    const {data:staff,error:staffError}=await client.from('laurem_staff_profiles').select('id,full_name,email,job_title').eq('id',session.staff_id).maybeSingle();
    if(staffError)throw staffError;
    if(!staff)return NextResponse.json({error:'Staff profile not found.'},{status:404});

    const bytes=new Uint8Array(await file.arrayBuffer());
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180);
    const {data:caseRow,error:caseError}=await client.from('laurem_staff_visa_help_cases').select('id,status').eq('staff_id',session.staff_id).not('status','eq','closed').not('status','eq','submitted').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(caseError)throw caseError;
    if(!caseRow)return NextResponse.json({error:'Save your Visa Help case before uploading supporting documents.'},{status:409});
    if(taskId){
      const {data:task,error:taskError}=await client.from('laurem_staff_visa_help_tasks').select('id,visa_help_case_id,staff_id,status').eq('id',taskId).maybeSingle();
      if(taskError)throw taskError;
      if(!task || task.staff_id!==session.staff_id || task.visa_help_case_id!==caseRow.id || !['open','rejected'].includes(task.status))return NextResponse.json({error:'The selected Visa Help request is not available for this upload.'},{status:422});
    }
    const storagePath='visa-help/'+session.staff_id+'/'+randomUUID()+'-'+safeName;
    const {error:uploadError}=await client.storage.from('laurem-private-documents').upload(storagePath,bytes,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;

    const documentHash=createHash('sha256').update(bytes).digest('hex');
    const {data:document,error:documentError}=await client.from('laurem_staff_documents').insert({
      staff_id:session.staff_id,
      category:'visa_help',
      title,
      description:'Private immigration-support document provided by staff for Visa Help review.',
      original_filename:safeName,
      mime_type:file.type,
      file_size_bytes:file.size,
      storage_path:storagePath,
      content_text:null,
      document_sha256:documentHash,
      source_type:'staff_visa_help',
      source_key:randomUUID(),
      status:'issued',
      requires_signature:false,
      signature_status:'not_required',
      issued_by_actor:session.email,
      issued_at:new Date().toISOString(),
    }).select('id,title,description,original_filename,mime_type,file_size_bytes,issued_at').single();
    if(documentError)throw documentError;

    await client.from('laurem_staff_visa_help_documents').insert({
      visa_help_case_id:caseRow.id,
      staff_id:session.staff_id,
      document_id:document.id,
      checklist_key:checklistKey,
      status:'submitted',
    });

    if(taskId){
      await client.from('laurem_staff_visa_help_tasks').update({
        response_document_id:document.id,
        response_text:null,
        status:'submitted',
        submitted_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      }).eq('id',taskId).eq('staff_id',session.staff_id);
      await client.from('laurem_staff_visa_help_events').insert({
        visa_help_case_id:caseRow.id,
        staff_id:session.staff_id,
        event_type:'visa_help_task_submitted',
        actor_type:'staff',
        actor:session.email,
        metadata:{taskId,taskType:'document',responseDocumentId:document.id,checklistKey},
      });
    } else {
      await client.from('laurem_staff_visa_help_events').insert({
        visa_help_case_id:caseRow.id,
        staff_id:session.staff_id,
        event_type:'visa_help_document_uploaded',
        actor_type:'staff',
        actor:session.email,
        metadata:{documentId:document.id,checklistKey},
      });
    }

    await client.from('laurem_staff_document_events').insert({
      document_id:document.id,
      staff_id:session.staff_id,
      event_type:'created',
      actor_type:'staff',
      actor:session.email,
      metadata:{category:'visa_help',document_sha256:documentHash},
    });

    return NextResponse.json({document},{status:201});
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'staff.visa_help.document_upload_failed',staffId:session.staff_id,reason:error instanceof Error?error.message:String(error)}));
    return NextResponse.json({error:'Unable to upload the visa document.'},{status:500});
  }
}
