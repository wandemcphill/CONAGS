import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/laurem-staff-auth';
import { recommendVisaHelp, buildVisaHelpDocumentChecklist, getVisaCostSummary, type VisaHelpRecommendation } from '@/lib/laurem-visa-help';
import { LAUREM_CURRENT_UK_VISA_TYPES } from '@/lib/laurem-visa-options';
import { createLauremStaffNotification } from '@/lib/laurem-staff-notifications';
import { sendLauremEmail } from '@/lib/laurem-email';
import { lauremCompany } from '@/lib/laurem-company-config';
import { getOrCreateVisaHelpConversation } from '@/lib/laurem-messaging';
import { monitorVisaHelpCase } from '@/lib/laurem-visa-help-monitor';
import { buildInitialVisaHelpMilestones } from '@/lib/laurem-visa-help-milestones';

export const dynamic='force-dynamic';

function bool(value:unknown){return value===true||value==='true'||value==='yes';}
function text(value:unknown,max=500){return typeof value==='string'?value.trim().slice(0,max):'';}

async function ensureVisaHelpMilestones(client:any,input:any){
  if(!input.caseId)return [];
  const initial=buildInitialVisaHelpMilestones(input);
  if(initial.length) {
    const {error}=await client.from('laurem_staff_visa_help_milestones').upsert(initial,{onConflict:'visa_help_case_id,milestone_type',ignoreDuplicates:true});
    if(error)throw error;
  }
  const {data,error}=await client.from('laurem_staff_visa_help_milestones').select('*').eq('visa_help_case_id',input.caseId).order('position',{ascending:true});
  if(error)throw error;
  return data||[];
}

async function loadStaffCase(session:any){
  const client=db();
  const [{data:staff,error:staffError},{data:application,error:applicationError},{data:visaCase,error:visaCaseError},{data:documents,error:documentsError},{data:tasks,error:tasksError},{data:events,error:eventsError},{data:documentLinks,error:documentLinksError}]=await Promise.all([
    client.from('laurem_staff_profiles').select('id,application_id,laurem_id,full_name,email,job_title,start_date,employment_status,location,phone,address_line_1,address_line_2,city,county,postcode,country').eq('id',session.staff_id).maybeSingle(),
    client.from('recruitment_applications').select('id,full_name,email,phone,date_of_birth,nationality,country_of_residence,address,role_applied,start_date,living_in_uk,current_country,work_permission,requires_sponsorship,qualifications,training,professional_experience,employment_history,application_data').eq('id', (await client.from('laurem_staff_profiles').select('application_id').eq('id',session.staff_id).maybeSingle()).data?.application_id || '').maybeSingle(),
    client.from('laurem_staff_visa_help_cases').select('*').eq('staff_id',session.staff_id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    client.from('laurem_staff_documents').select('id,title,description,original_filename,mime_type,file_size_bytes,issued_at').eq('staff_id',session.staff_id).eq('category','visa_help').eq('status','issued').order('issued_at',{ascending:false}),
    client.from('laurem_staff_visa_help_tasks').select('*').eq('staff_id',session.staff_id).eq('visibility','staff').order('created_at',{ascending:false}),
    client.from('laurem_staff_visa_help_events').select('id,event_type,actor_type,actor,metadata,created_at').eq('staff_id',session.staff_id).order('created_at',{ascending:false}).limit(100),
    client.from('laurem_staff_visa_help_documents').select('id,document_id,checklist_key,status,reviewer_note,reviewed_by,reviewed_at,created_at,updated_at').eq('staff_id',session.staff_id).order('created_at',{ascending:false}),
  ]);
  if(staffError) throw staffError;
  if(applicationError && applicationError.code!=='PGRST116') throw applicationError;
  if(visaCaseError && visaCaseError.code!=='PGRST116') throw visaCaseError;
  if(documentsError) throw documentsError;
  if(tasksError) throw tasksError;
  if(eventsError) throw eventsError;
  if(documentLinksError) throw documentLinksError;
  if(!staff) return null;

  const app:any=application || {};
  const current=visaCase?.answers || {};
  const livingInUk=visaCase?.living_in_uk ?? (
    lower(app.living_in_uk)==='yes' ||
    ['united kingdom','uk','england','scotland','wales','northern ireland'].includes(lower(app.current_country||app.country_of_residence))
  );
  const role=visaCase?.target_role || staff.job_title || app.role_applied || '';
  const rec=visaCase?.recommendation?.title ? visaCase.recommendation : recommendVisaHelp({
    role,
    livingInUk,
    currentVisaType:visaCase?.current_visa_type || current.currentVisaType,
    currentVisaEndDate:visaCase?.current_visa_end_date || current.currentVisaEndDate,
    studentCourseFinished:current.studentCourseFinished,
    jobStartsAfterCourse:current.jobStartsAfterCourse,
    phdStudy24Months:current.phdStudy24Months,
    monthsWorkingForLaurem:current.monthsWorkingForLaurem,
    wantsDependants:current.wantsDependants,
    dependantsInsideUk:current.dependantsInsideUk,
  });
  const milestones=visaCase ? await ensureVisaHelpMilestones(client,{
    staffId:session.staff_id,
    caseId:visaCase.id,
    recommendationDecision:rec.decision,
    legalTeamRequested:Boolean(visaCase.legal_team_requested),
    caseStatus:visaCase.status,
    submittedAt:visaCase.submitted_at,
    outsideUk:!livingInUk,
  }) : [];


  return {
    staff,
    application:app,
    livingInUk,
    case:visaCase,
    recommendation:rec,
    visaTypes:LAUREM_CURRENT_UK_VISA_TYPES,
    documents:documents||[],
    tasks:tasks||[],
    milestones,
    monitor:monitorVisaHelpCase({
      status:visaCase?.status,
      currentVisaEndDate:visaCase?.current_visa_end_date,
      tasks:tasks||[],
      legalTeamRequested:Boolean(visaCase?.legal_team_requested),
      recommendationDecision:rec.decision,
      legalReviewCompleted:Boolean(visaCase?.legal_review_completed),
    }),
    events:events||[],
    documentLinks:documentLinks||[],
    addresses:app.address?[String(app.address)]:[],
    conversationId:visaCase?.conversation_id||null,
    costSummary:getVisaCostSummary({
      route:rec.route,
      outsideUk:!livingInUk,
      durationMonths:Number(current.durationMonths||0)||null,
      durationYears:Number(current.durationYears||0)||null,
      dependantCount:Array.isArray(visaCase?.dependants)?visaCase.dependants.length:Number(current.dependantCount||0),
    }),
  };
}

function lower(value:unknown){return String(value||'').trim().toLowerCase();}

export async function GET(request:NextRequest){
  const session=await getStaffSession(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  try{
    const data=await loadStaffCase(session);
    if(!data)return NextResponse.json({error:'Staff profile not found.'},{status:404});
    const url=new URL(request.url);
    const queryDurationMonths=Number(url.searchParams.get('durationMonths')||0);
    const queryDependantCount=Number(url.searchParams.get('dependantCount')||-1);
    if(queryDurationMonths>0 || queryDependantCount>=0){
      data.costSummary=getVisaCostSummary({
        route:data.recommendation.route,
        outsideUk:!data.livingInUk,
        durationMonths:queryDurationMonths>0?queryDurationMonths:data.costSummary?.durationMonths||null,
        dependantCount:queryDependantCount>=0?queryDependantCount:(Array.isArray(data.case?.dependants)?data.case.dependants.length:0),
      });
    }
    return NextResponse.json(data);
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'staff.visa_help.load_failed',staffId:session.staff_id,reason:error instanceof Error?error.message:String(error)}));
    return NextResponse.json({error:'Unable to load Visa Help Centre.'},{status:500});
  }
}

export async function POST(request:NextRequest){
  const session=await getStaffSession(request);
  if(!session)return NextResponse.json({error:'Unauthorised'},{status:401});
  const body=await request.json().catch(()=>null) as Record<string,any>|null;
  if(!body)return NextResponse.json({error:'Invalid Visa Help submission.'},{status:400});

  try{
    const data=await loadStaffCase(session);
    if(!data)return NextResponse.json({error:'Staff profile not found.'},{status:404});
    const role=text(body.targetRole||data.staff.job_title||data.application.role_applied,120);
    const livingInUk=bool(body.livingInUk);
    const currentVisaType=text(body.currentVisaType,120);
    const currentVisaStartDate=text(body.currentVisaStartDate,20);
    const currentVisaEndDate=text(body.currentVisaEndDate,20);
    const passportNumber=text(body.passportNumber,80);
    const passportIssueDate=text(body.passportIssueDate,20);
    const passportExpiryDate=text(body.passportExpiryDate,20);
    const passportCountry=text(body.passportCountry,120);
    const ukStatusShareCode=text(body.ukStatusShareCode,40);
    const ukviReference=text(body.ukviReference,120);
    const ukviAccountEmail=text(body.ukviAccountEmail,254);
    const rightToWorkStatus=body.rightToWorkStatus==null?'':String(body.rightToWorkStatus);
    const rightToWorkProofProvided=body.rightToWorkProofProvided==null?'':String(body.rightToWorkProofProvided);
    const monthsWorkingForLaurem=Number(body.monthsWorkingForLaurem||0);
    const durationMonths=Number(body.durationMonths||0);
    const durationYears=Number(body.durationYears||0);
    const wantsDependants=bool(body.wantsDependants);
    const dependantsInsideUk=bool(body.dependantsInsideUk);

    if(currentVisaType && !LAUREM_CURRENT_UK_VISA_TYPES.some(item=>item.value===currentVisaType)){
      return NextResponse.json({error:'Select a current UK visa type from the available list.'},{status:422});
    }
    if(livingInUk && !currentVisaType) return NextResponse.json({error:'Select your current UK visa type so the route check can run.'},{status:422});
    if(currentVisaStartDate && currentVisaEndDate && currentVisaEndDate<currentVisaStartDate) return NextResponse.json({error:'Current visa end date cannot be before the start date.'},{status:422});
    if(monthsWorkingForLaurem<0 || monthsWorkingForLaurem>240) return NextResponse.json({error:'Months working for CONAGS must be between 0 and 240.'},{status:422});
    if(durationMonths<0 || durationMonths>120) return NextResponse.json({error:'Visa duration must be between 0 and 120 months.'},{status:422});

    const recommendation:VisaHelpRecommendation=recommendVisaHelp({
      role,livingInUk,currentVisaType,currentVisaEndDate,
      studentCourseFinished:body.studentCourseFinished===null?null:bool(body.studentCourseFinished),
      jobStartsAfterCourse:body.jobStartsAfterCourse===null?null:bool(body.jobStartsAfterCourse),
      phdStudy24Months:body.phdStudy24Months===null?null:bool(body.phdStudy24Months),
      monthsWorkingForLaurem,wantsDependants,dependantsInsideUk,
    });

    const hasDependants=wantsDependants || (Array.isArray(body.dependants)&&body.dependants.length>0);
    const costSummary=getVisaCostSummary({
      route:recommendation.route,
      outsideUk:!livingInUk,
      durationMonths:durationMonths||null,
      durationYears:durationYears||null,
      dependantCount:Array.isArray(body.dependants)?body.dependants.length:0,
    });
    const checklist=buildVisaHelpDocumentChecklist({
      role,
      route:recommendation.route,
      outsideUk:!livingInUk,
      hasDependants,
    });

    const action=text(body.action,40)||'save';
    const legalRequested=bool(body.legalTeamRequested);
    const selfComplete=bool(body.selfCompleteSelected);
    const finalSubmission=action==='submit';
    const legalConsent=bool(body.consentToLegalSupport);
    if(passportIssueDate && passportExpiryDate && passportExpiryDate<passportIssueDate)return NextResponse.json({error:'Passport expiry date cannot be before the issue date.'},{status:422});
    if(finalSubmission && legalRequested && (!passportNumber || !passportExpiryDate || !passportCountry))return NextResponse.json({error:'Legal-team support requires your passport number, passport expiry date and passport country before submission.'},{status:422});
    if(finalSubmission && legalRequested && !legalConsent){
      return NextResponse.json({error:'Please confirm consent for CONAGS legal/support staff to review the immigration information you provide.'},{status:422});
    }
    if(finalSubmission && recommendation.decision==='not_switchable' && !legalRequested){
      return NextResponse.json({error:'This case cannot be completed as a routine in-country switch. Select CONAGS legal-team review so the case can be assessed for the appropriate next route.'},{status:422});
    }
    if(finalSubmission && !legalRequested && !selfComplete){
      return NextResponse.json({error:'Choose whether you will complete the application yourself or request CONAGS legal-team assistance.'},{status:422});
    }

    const answers={
      currentVisaType,currentVisaStartDate,currentVisaEndDate,
      studentCourseFinished:body.studentCourseFinished,
      jobStartsAfterCourse:body.jobStartsAfterCourse,
      phdStudy24Months:body.phdStudy24Months,
      monthsWorkingForLaurem,
      targetWorkLocation:text(body.targetWorkLocation,80),
      wantsDependants,
      dependantsInsideUk,
      dependants:Array.isArray(body.dependants)?body.dependants.slice(0,10):[],
      durationYears,
      durationMonths,
      currentAddress:text(body.currentAddress,800),
      previousImmigrationRefusals:body.previousImmigrationRefusals,
      previousOverstayOrBreach:body.previousOverstayOrBreach,
      criminalConvictions:body.criminalConvictions,
      immigrationHistoryNotes:text(body.immigrationHistoryNotes,2000),
      travelHistoryNotes:text(body.travelHistoryNotes,2000),
      previousUkAddresses:text(body.previousUkAddresses,2500),
      passportNumber:passportNumber||null,
      passportIssueDate:passportIssueDate||null,
      passportExpiryDate:passportExpiryDate||null,
      passportCountry:passportCountry||null,
      ukStatusShareCode:ukStatusShareCode||null,
      ukviReference:ukviReference||null,
      ukviAccountEmail:ukviAccountEmail||null,
      rightToWorkStatus:rightToWorkStatus||null,
      rightToWorkProofProvided:rightToWorkProofProvided||null,
      englishEvidence:text(body.englishEvidence,500),
      maintenanceEvidence:text(body.maintenanceEvidence,500),
      legalQuestionnaireComplete:bool(body.legalQuestionnaireComplete),
      staffMessage:text(body.staffMessage,2000),
    };

    const status=finalSubmission
      ? (legalRequested || recommendation.decision!=='provisional' ? 'legal_review' : 'triaged')
      : 'draft';

    const client=db();
    const {data:existing,error:existingError}=await client.from('laurem_staff_visa_help_cases')
      .select('id')
      .eq('staff_id',session.staff_id)
      .not('status','in','(closed,submitted)')
      .order('created_at',{ascending:false})
      .limit(1).maybeSingle();
    if(existingError && existingError.code!=='PGRST116') throw existingError;

    let caseRow:any;
    const payload={
      application_id:data.staff.application_id,
      status,
      current_visa_type:currentVisaType||null,
      current_visa_start_date:currentVisaStartDate||null,
      current_visa_end_date:currentVisaEndDate||null,
      living_in_uk:livingInUk,
      target_role:role,
      target_work_location:text(body.targetWorkLocation,80)||data.staff.location||null,
      selected_route:recommendation.route,
      recommendation,
      answers,
      dependants:Array.isArray(body.dependants)?body.dependants.slice(0,10):[],
      document_checklist:checklist,
      legal_team_requested:legalRequested,
      self_complete_selected:selfComplete,
      consent_to_legal_support:legalConsent,
      staff_message:text(body.staffMessage,2000)||null,
      submitted_at:finalSubmission?new Date().toISOString():null,
      updated_at:new Date().toISOString(),
      reviewed_at:null,
    };

    if(existing?.id){
      const updated=await client.from('laurem_staff_visa_help_cases')
        .update(payload)
        .eq('id',existing.id)
        .eq('staff_id',session.staff_id)
        .select('*').single();
      if(updated.error) throw updated.error;
      caseRow=updated.data;
    }else{
      const created=await client.from('laurem_staff_visa_help_cases')
        .insert({staff_id:session.staff_id,...payload})
        .select('*').single();
      if(created.error) throw created.error;
      caseRow=created.data;
    }

    await client.from('laurem_staff_visa_help_events').insert({
      visa_help_case_id:caseRow.id,
      staff_id:session.staff_id,
      event_type:finalSubmission?(legalRequested?'legal_support_requested':'visa_help_submitted'):'draft_saved',
      actor_type:'staff',
      actor:session.email,
      metadata:{route:recommendation.route,decision:recommendation.decision,legalRequested,selfComplete},
    });

    if(finalSubmission && (legalRequested || recommendation.decision!=='provisional')){
      const conversation=await getOrCreateVisaHelpConversation(client,session.staff_id,caseRow.id);
      if(!caseRow.conversation_id){
        const linked=await client.from('laurem_staff_visa_help_cases').update({conversation_id:conversation.id}).eq('id',caseRow.id).select('*').single();
        if(linked.error) throw linked.error;
        caseRow=linked.data;
      }
      const {data:existingLegalTask}=await client.from('laurem_staff_visa_help_tasks')
        .select('id,status')
        .eq('visa_help_case_id',caseRow.id)
        .eq('task_type','action')
        .eq('title','Complete CONAGS legal/support review')
        .not('status','in','(cancelled,verified)')
        .limit(1).maybeSingle();
      if(!existingLegalTask){
        await client.from('laurem_staff_visa_help_tasks').insert({
          visa_help_case_id:caseRow.id,
          staff_id:session.staff_id,
          task_type:'action',
          visibility:'internal',
          title:'Complete CONAGS legal/support review',
          description:'Review the immigration history, route screening, dependant position and supporting evidence. Record the confirmed route or identify further evidence required before submission readiness.',
          required:true,
          status:'open',
          requested_by_actor_type:'system',
          requested_by:'Visa Help workflow',
        });
        await client.from('laurem_staff_visa_help_events').insert({
          visa_help_case_id:caseRow.id,
          staff_id:session.staff_id,
          event_type:'legal_review_task_created',
          actor_type:'system',
          actor:'Visa Help workflow',
          metadata:{reason:legalRequested?'staff_requested_support':'screening_requires_review'},
        });
      }
    }

    if(finalSubmission){
      await createLauremStaffNotification(client,{
        staffId:session.staff_id,
        category:'compliance',
        title:legalRequested?'CONAGS legal visa review requested':'Visa Help assessment submitted',
        body:legalRequested?'Your immigration information has been submitted to CONAGS for legal/support review.':'Your preliminary visa route assessment is saved. Review the route and use the official UKVI application flow when you are ready.',
        actionUrl:'/staff/visa-help',
      });

      const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://recruitment.conagscare.com').replace(/\/$/,'');
      const adminUrl=appUrl+'/admin/workforce/visa-help?case='+encodeURIComponent(caseRow.id);
      await sendLauremEmail(client,{
        eventType:'staff.visa_help.submitted',
        entityId:caseRow.id,
        idempotencyKey:'staff.visa_help.submitted/'+caseRow.id+'/'+caseRow.updated_at,
        payload:{
          from:process.env.RESEND_FROM_EMAIL||'CONAGS Care <onboarding@resend.dev>',
          to:[lauremCompany.portalNotifications.internalRecipient],
          reply_to:lauremCompany.publicEmails.manager,
          subject:(legalRequested?'Legal visa support':'Visa Help')+' request: '+data.staff.full_name,
          text:(legalRequested?'A new CONAGS legal visa support request':'A new CONAGS Visa Help case')+' has been submitted.\\n\\nStaff: '+data.staff.full_name+'\\nCONAGS ID: '+session.laurem_id+'\\nRoute: '+recommendation.title+'\\n\\nOpen case: '+adminUrl,
          html:'<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><h1>CONAGS Visa Help case</h1><p><strong>'+data.staff.full_name+'</strong> submitted a visa-help case.</p><p><strong>Route:</strong> '+recommendation.title+'<br><strong>Legal support:</strong> '+(legalRequested?'Requested':'Not requested')+'</p><p><a href="'+adminUrl+'">Open admin case</a></p></div>',
        },
      });
    }

    return NextResponse.json({case:caseRow,recommendation,documentChecklist:checklist,costSummary},{status:existing?.id?200:201});
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'staff.visa_help.save_failed',staffId:session.staff_id,reason:error instanceof Error?error.message:String(error)}));
    return NextResponse.json({error:'Unable to save your Visa Help case.'},{status:500});
  }
}
