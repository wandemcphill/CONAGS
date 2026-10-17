'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StaffAction, StaffBadge, StaffLoading, StaffNotice, StaffPage, StaffPageHeader, StaffPageInner, StaffPanel, StaffSectionHeader } from '@/components/StaffPortalUI';

type Dependant={relationship:string;fullName:string;dateOfBirth:string;nationality:string;currentLocation:string;currentVisaType:string;currentVisaEndDate:string;bornInUk:string;otherParentSponsored:string};
type Data={staff:any;application:any;case:any;recommendation:any;costSummary:any;monitor:any;milestones:any[];visaTypes:any[];documents:any[];documentLinks:any[];tasks:any[];events:any[];addresses:string[];conversationId:string|null};
const blankDependant=():Dependant=>({relationship:'',fullName:'',dateOfBirth:'',nationality:'',currentLocation:'',currentVisaType:'',currentVisaEndDate:'',bornInUk:'',otherParentSponsored:''});

export default function StaffVisaHelpPage(){
 const router=useRouter();
 const [data,setData]=useState<Data|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [step,setStep]=useState(1);
 const [currentVisaType,setCurrentVisaType]=useState('');
 const [currentVisaStartDate,setCurrentVisaStartDate]=useState('');
 const [currentVisaEndDate,setCurrentVisaEndDate]=useState('');
 const [passportNumber,setPassportNumber]=useState('');
 const [passportIssueDate,setPassportIssueDate]=useState('');
 const [passportExpiryDate,setPassportExpiryDate]=useState('');
 const [passportCountry,setPassportCountry]=useState('');
 const [ukStatusShareCode,setUkStatusShareCode]=useState('');
 const [ukviReference,setUkviReference]=useState('');
 const [ukviAccountEmail,setUkviAccountEmail]=useState('');
 const [rightToWorkStatus,setRightToWorkStatus]=useState('');
 const [rightToWorkProofProvided,setRightToWorkProofProvided]=useState('');
 const [livingInUk,setLivingInUk]=useState('');
 const [targetWorkLocation,setTargetWorkLocation]=useState('');
 const [monthsWorkingForLaurem,setMonthsWorkingForLaurem]=useState('0');
 const [durationMonths,setDurationMonths]=useState('');
 const [studentCourseFinished,setStudentCourseFinished]=useState('');
 const [jobStartsAfterCourse,setJobStartsAfterCourse]=useState('');
 const [phdStudy24Months,setPhdStudy24Months]=useState('');
 const [wantsDependants,setWantsDependants]=useState('');
 const [dependantsInsideUk,setDependantsInsideUk]=useState('');
 const [dependants,setDependants]=useState<Dependant[]>([]);
 const [currentAddress,setCurrentAddress]=useState('');
 const [previousUkAddresses,setPreviousUkAddresses]=useState('');
 const [previousImmigrationRefusals,setPreviousImmigrationRefusals]=useState('');
 const [previousOverstayOrBreach,setPreviousOverstayOrBreach]=useState('');
 const [criminalConvictions,setCriminalConvictions]=useState('');
 const [immigrationHistoryNotes,setImmigrationHistoryNotes]=useState('');
 const [travelHistoryNotes,setTravelHistoryNotes]=useState('');
 const [englishEvidence,setEnglishEvidence]=useState('');
 const [maintenanceEvidence,setMaintenanceEvidence]=useState('');
 const [legalRequested,setLegalRequested]=useState('');
 const [selfComplete,setSelfComplete]=useState('');
 const [consent,setConsent]=useState(false);
 const [staffMessage,setStaffMessage]=useState('');
 const [uploadTitle,setUploadTitle]=useState('');
 const [uploadChecklistKey,setUploadChecklistKey]=useState('');
 const [uploadFile,setUploadFile]=useState<File|null>(null);
 const [uploading,setUploading]=useState(false);
 const [taskResponses,setTaskResponses]=useState<Record<string,string>>({});
 const [taskDocumentIds,setTaskDocumentIds]=useState<Record<string,string>>({});
 const [taskSaving,setTaskSaving]=useState<string>('');

 async function load(){
  setLoading(true);setError('');
  try{
   const r=await fetch('/api/staff/visa-help',{cache:'no-store'});
   if(r.status===401){router.replace('/staff/login');return;}
   const b=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(b.error||'Unable to load Visa Help Centre.');
   setData(b);
   const c=b.case;
   const a=c?.answers||{};
   if(c?.current_visa_type)setCurrentVisaType(c.current_visa_type);
   else if(b.application?.living_in_uk && b.application?.living_in_uk.toLowerCase()==='yes')setCurrentVisaType('');
   setCurrentVisaStartDate(c?.current_visa_start_date||'');
   setCurrentVisaEndDate(c?.current_visa_end_date||'');
   setPassportNumber(a.passportNumber||'');
   setPassportIssueDate(a.passportIssueDate||'');
   setPassportExpiryDate(a.passportExpiryDate||'');
   setPassportCountry(a.passportCountry||'');
   setUkStatusShareCode(a.ukStatusShareCode||'');
   setUkviReference(a.ukviReference||'');
   setUkviAccountEmail(a.ukviAccountEmail||'');
   setRightToWorkStatus(a.rightToWorkStatus||'');
   setRightToWorkProofProvided(a.rightToWorkProofProvided||'');
   setLivingInUk(c?.living_in_uk===true?'yes':c?.living_in_uk===false?'no':b.application?.living_in_uk?.toLowerCase()==='yes'?'yes':'');
   setTargetWorkLocation(c?.target_work_location||b.staff?.location||'');
   setMonthsWorkingForLaurem(String(a.monthsWorkingForLaurem??0));
   setDurationMonths(String(a.durationMonths || (a.durationYears ? Number(a.durationYears)*12 : '')));
   setStudentCourseFinished(a.studentCourseFinished==null?'':String(a.studentCourseFinished));
   setJobStartsAfterCourse(a.jobStartsAfterCourse==null?'':String(a.jobStartsAfterCourse));
   setPhdStudy24Months(a.phdStudy24Months==null?'':String(a.phdStudy24Months));
   setWantsDependants(a.wantsDependants==null?'':String(a.wantsDependants));
   setDependantsInsideUk(a.dependantsInsideUk==null?'':String(a.dependantsInsideUk));
   setDependants(Array.isArray(c?.dependants)&&c.dependants.length?c.dependants:[]);
   setCurrentAddress(a.currentAddress||'');
   setPreviousUkAddresses(a.previousUkAddresses||'');
   setPreviousImmigrationRefusals(a.previousImmigrationRefusals==null?'':String(a.previousImmigrationRefusals));
   setPreviousOverstayOrBreach(a.previousOverstayOrBreach==null?'':String(a.previousOverstayOrBreach));
   setCriminalConvictions(a.criminalConvictions==null?'':String(a.criminalConvictions));
   setImmigrationHistoryNotes(a.immigrationHistoryNotes||'');
   setTravelHistoryNotes(a.travelHistoryNotes||'');
   setEnglishEvidence(a.englishEvidence||'');
   setMaintenanceEvidence(a.maintenanceEvidence||'');
   setLegalRequested(c?.legal_team_requested?'yes':'');
   setSelfComplete(c?.self_complete_selected?'yes':'');
   setConsent(Boolean(c?.consent_to_legal_support));
   setStaffMessage(c?.staff_message||'');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load Visa Help Centre.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[router]);

 const preliminary=data?.recommendation;
 const legalIntakeNeeded=legalRequested==='yes'||preliminary?.decision!=='provisional';
 const checklist=useMemo(()=>data?.case?.document_checklist||[],[data]);
 useEffect(()=>{
  if(!data||!durationMonths)return;
  const controller=new AbortController();
  const params=new URLSearchParams({durationMonths,dependantCount:String(dependants.length)});
  fetch('/api/staff/visa-help?'+params.toString(),{cache:'no-store',signal:controller.signal})
   .then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Unable to refresh visa cost estimate.');return b;})
   .then(b=>setData(prev=>prev?{...prev,costSummary:b.costSummary}:prev))
   .catch(error=>{if(error?.name!=='AbortError')console.error(error);});
  return ()=>controller.abort();
 },[durationMonths,dependants.length]);


 async function save(action:'save'|'submit'){
  if(!data)return;
  if(!livingInUk)return setError('Tell us whether you are currently in the UK so the route check can run.');
  if(livingInUk==='yes'&&!currentVisaType)return setError('Select your current UK visa type.');
  if((legalRequested==='yes'||(action==='submit'&&preliminary?.decision!=='provisional'))&&!consent&&legalRequested==='yes')return setError('Confirm that you consent to CONAGS legal/support staff reviewing the information you provide.');
  setSaving(true);setError('');
  try{
   const r=await fetch('/api/staff/visa-help',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    action,
    targetRole:data.staff.job_title||data.application.role_applied,
    livingInUk:livingInUk==='yes',
    currentVisaType,currentVisaStartDate,currentVisaEndDate,
    targetWorkLocation,monthsWorkingForLaurem,durationMonths,
    passportNumber,passportIssueDate,passportExpiryDate,passportCountry,ukStatusShareCode,ukviReference,ukviAccountEmail,rightToWorkStatus,rightToWorkProofProvided,
    studentCourseFinished:studentCourseFinished===''?null:studentCourseFinished==='true',
    jobStartsAfterCourse:jobStartsAfterCourse===''?null:jobStartsAfterCourse==='true',
    phdStudy24Months:phdStudy24Months===''?null:phdStudy24Months==='true',
    wantsDependants:wantsDependants==='true',
    dependantsInsideUk:dependantsInsideUk==='true',
    dependants,
    currentAddress,
    previousUkAddresses,
    previousImmigrationRefusals:previousImmigrationRefusals===''?null:previousImmigrationRefusals==='true',
    previousOverstayOrBreach:previousOverstayOrBreach===''?null:previousOverstayOrBreach==='true',
    criminalConvictions:criminalConvictions===''?null:criminalConvictions==='true',
    immigrationHistoryNotes,travelHistoryNotes,englishEvidence,maintenanceEvidence,
    legalTeamRequested:legalRequested==='yes',
    selfCompleteSelected:selfComplete==='yes',
    consentToLegalSupport:consent,
    legalQuestionnaireComplete:legalIntakeNeeded,
    staffMessage,
   })});
   const b=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(b.error||'Unable to save the Visa Help case.');
   await load();
   if(action==='submit')setStep(4);
  }catch(e){setError(e instanceof Error?e.message:'Unable to save the Visa Help case.');}
  finally{setSaving(false);}
 }

 async function upload(){
  if(!uploadTitle||!uploadFile)return setError('Enter a document title and choose a file.');
  setUploading(true);setError('');
  try{
   const form=new FormData();
   form.append('title',uploadTitle);
   if(uploadChecklistKey)form.append('checklistKey',uploadChecklistKey);
   form.append('file',uploadFile);
   const r=await fetch('/api/staff/visa-help/documents',{method:'POST',body:form});
   const b=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(b.error||'Unable to upload document.');
   setUploadTitle('');setUploadChecklistKey('');setUploadFile(null);
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to upload document.');}
  finally{setUploading(false);}
 }

 async function respondToTask(taskId:string){
  const responseText=(taskResponses[taskId]||'').trim();
  const responseDocumentId=taskDocumentIds[taskId]||null;
  if(!responseText&&!responseDocumentId){setError('Add a written response or select an uploaded document before submitting the request.');return;}
  setTaskSaving(taskId);setError('');
  try{
   const r=await fetch('/api/staff/visa-help/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({taskId,responseText,responseDocumentId})});
   const b=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(b.error||'Unable to submit the Visa Help request.');
   setTaskResponses(current=>({...current,[taskId]:''}));
   setTaskDocumentIds(current=>({...current,[taskId]:''}));
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to submit the Visa Help request.');}
  finally{setTaskSaving('');}
 }

 function updateDependant(index:number,key:keyof Dependant,value:string){
  setDependants(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));
 }

 if(loading)return <StaffLoading label="Loading Visa Help Centre…"/>;
 if(!data)return <StaffPage><StaffPageInner><StaffNotice tone="danger"><strong>Visa Help unavailable</strong><p>{error||'Unable to load the workflow.'}</p><StaffAction onClick={()=>void load()}>Try again</StaffAction></StaffNotice></StaffPageInner></StaffPage>;

 return <StaffPage className="staff-page--visa-help"><StaffPageInner>
  <StaffPageHeader eyebrow="IMMIGRATION SUPPORT" title="Visa Help Centre" subtitle="Answer a guided set of questions, receive a preliminary route assessment, then choose self-completion or CONAGS legal/support assistance." actions={<><StaffAction onClick={()=>void load()}>Refresh</StaffAction><StaffAction href="/staff/visa-sponsorship">Visa & Sponsorship</StaffAction></>}/>
  {error&&<StaffNotice tone="danger"><strong>Visa Help needs attention</strong><p>{error}</p></StaffNotice>}
  <StaffPanel>
    <StaffSectionHeader title="Case workspace" copy="This area stays active after submission. CONAGS can request information or evidence here, and every request/response is recorded against your case."/>
    {data.milestones?.length>0&&<div className="staff-panel-nested"><StaffSectionHeader title="Visa Help journey" copy="Your case moves through these milestones. Dates are planning markers, not a promise of an immigration decision date."/><div className="staff-document-list">{data.milestones.map((milestone:any)=><article key={milestone.id} className="staff-document-card"><div className="staff-document-main"><div className="staff-document-icon" aria-hidden="true">{milestone.status==='completed'?'✓':'•'}</div><div className="staff-document-copy"><div className="staff-document-topline"><span className="staff-document-category">{milestone.milestone_type.replaceAll('_',' ')}</span><StaffBadge tone={milestone.status==='completed'?'live':milestone.status==='in_progress'?'attention':'neutral'}>{milestone.status.replaceAll('_',' ')}</StaffBadge></div><h3>{milestone.title}</h3><p>{milestone.status==='completed'?'Completed '+new Date(milestone.completed_at).toLocaleDateString('en-GB'):milestone.due_at?'Target date '+new Date(milestone.due_at).toLocaleDateString('en-GB'):'No target date recorded yet.'}</p></div></div></article>)}</div></div>}
    {data.monitor?.flags?.length>0&&<StaffNotice tone={data.monitor.severity==='urgent'?'danger':'warning'}><strong>{data.monitor.severity==='urgent'?'Urgent Visa Help attention':'Visa Help attention'}</strong>{data.monitor.flags.map((flag:string)=><p key={flag}>{flag}</p>)}<p><strong>Next action:</strong> {data.monitor.nextAction}</p></StaffNotice>}
    <div className="staff-home-lane-grid">
      <article className="staff-home-lane"><StaffBadge tone={data.monitor?.severity==='urgent'?'danger':data.monitor?.severity==='attention'?'attention':'neutral'}>Priority</StaffBadge><strong>{data.monitor?.severity||'normal'}</strong><span>{data.monitor?.nextAction||'No immediate deadline detected.'}</span></article>
      <article className="staff-home-lane"><StaffBadge tone="neutral">Case status</StaffBadge><strong>{data.case?.status?data.case.status.replaceAll('_',' '):'Draft'}</strong><span>Last updated {data.case?.updated_at?new Date(data.case.updated_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Not yet submitted'}</span></article>
      <article className="staff-home-lane"><StaffBadge tone={data.tasks?.some((x:any)=>x.required&&['open','rejected'].includes(x.status))?'attention':'neutral'}>Requests</StaffBadge><strong>{data.tasks?.filter((x:any)=>x.status!=='cancelled'&&x.status!=='verified').length||0} outstanding</strong><span>{data.tasks?.filter((x:any)=>x.status==='verified').length||0} verified request{(data.tasks?.filter((x:any)=>x.status==='verified').length||0)===1?'':'s'}</span></article>
      <article className="staff-home-lane"><StaffBadge tone={data.case?.legal_review_completed?'live':'neutral'}>Legal review</StaffBadge><strong>{data.case?.legal_review_completed?'Completed':'Not completed'}</strong><span>{data.case?.confirmed_route||data.recommendation?.title||'Route assessment pending'}</span></article>
      <article className="staff-home-lane"><StaffBadge tone="neutral">Conversation</StaffBadge><strong>{data.conversationId?'Open with CONAGS':'Available after support review'}</strong><span>{data.conversationId?'Use the private case thread for questions and follow-up.':'A private case thread will be created when support review is opened.'}</span></article>
    </div>
    {data.conversationId&&<div className="staff-home-panel-actions"><StaffAction primary href={'/staff/messages?conversation='+encodeURIComponent(data.conversationId)}>Open case conversation</StaffAction></div>}
    {data.tasks?.length>0&&<div className="staff-document-list">
      {data.tasks.filter((task:any)=>task.status!=='cancelled').map((task:any)=><article key={task.id} className={'staff-document-card'+(task.required&&task.status!=='verified'?' staff-document-card--attention':'')}>
        <div className="staff-document-main"><div className="staff-document-icon" aria-hidden="true">!</div><div className="staff-document-copy"><div className="staff-document-topline"><span className="staff-document-category">{task.task_type}</span><StaffBadge tone={task.status==='verified'?'live':task.status==='rejected'?'danger':task.status==='submitted'?'attention':'neutral'}>{task.status}</StaffBadge></div><h3>{task.title}</h3><p>{task.description||'CONAGS has requested an action on your Visa Help case.'}</p><div className="staff-document-meta">{task.required?'Required request':'Optional request'}{task.due_at?' · Due '+new Date(task.due_at).toLocaleString('en-GB',{dateStyle:'medium'}):''}</div></div></div>
        {['open','rejected'].includes(task.status)&&<div className="staff-modern-form" style={{width:'100%',marginTop:12}}>
          <TextArea label="Your response" value={taskResponses[task.id]||''} onChange={value=>setTaskResponses(current=>({...current,[task.id]:value}))} placeholder="Respond to CONAGS's request."/>
          <SelectField label="Attach an uploaded Visa Help document" value={taskDocumentIds[task.id]||''} onChange={value=>setTaskDocumentIds(current=>({...current,[task.id]:value}))} options={data.documents.map((doc:any)=>[doc.id,doc.title])}/>
          <div className="staff-home-panel-actions"><StaffAction primary onClick={()=>void respondToTask(task.id)} disabled={taskSaving===task.id}>{taskSaving===task.id?'Submitting…':'Submit response'}</StaffAction></div>
        </div>}
      </article>)}
    </div>}
    {data.events?.length>0&&<div className="staff-panel-nested"><StaffSectionHeader title="Case timeline" copy="A chronological audit trail of the Visa Help workflow."/><div className="staff-document-list">{data.events.slice(0,12).map((event:any)=><article key={event.id} className="staff-document-card"><div className="staff-document-main"><div className="staff-document-copy"><span className="staff-document-category">{event.actor_type} · {event.event_type.replaceAll('_',' ')}</span><h3>{new Date(event.created_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</h3><p>{event.metadata?.title||event.metadata?.to||event.metadata?.reason||'Workflow activity recorded.'}</p></div></div></article>)}</div></div>}
  </StaffPanel>
  <div className="staff-stat-grid">
   {[['1','Your situation'],['2','Dependants'],['3','Documents'],['4','Choose help']].map(item=><div key={item[0]} className="staff-stat"><div className="staff-stat-value">{item[0]}</div><div className="staff-stat-label">{item[1]}</div></div>)}
  </div>

  {step===1&&<StaffPanel>
    <StaffSectionHeader title="1. Your immigration situation" copy="CONAGS uses your answers to identify the appropriate application route. It is a screening workflow, not a guarantee of immigration eligibility."/>
    <div className="staff-modern-form">
      <div className="staff-form-grid">
       <SelectField label="Are you currently in the UK?" value={livingInUk} onChange={setLivingInUk} options={[['yes','Yes, I am in the UK'],['no','No, I am outside the UK']]}/>
       {livingInUk==='yes'&&<SelectField label="Current UK visa type" value={currentVisaType} onChange={setCurrentVisaType} options={data.visaTypes.map(x=>[x.value,x.label])}/>}
       {livingInUk==='yes'&&<><DateField label="Current UK visa start date" value={currentVisaStartDate} onChange={setCurrentVisaStartDate}/><DateField label="Current UK visa end date" value={currentVisaEndDate} onChange={setCurrentVisaEndDate}/><TextField label="Months you have already worked legally for CONAGS in this role" value={monthsWorkingForLaurem} onChange={setMonthsWorkingForLaurem} type="number"/></>}
       <SelectField label="Where will this CONAGS job be performed?" value={targetWorkLocation} onChange={setTargetWorkLocation} options={[['England','England'],['Scotland','Scotland'],['Wales','Wales'],['Northern Ireland','Northern Ireland']]}/>
      </div>
      {currentVisaType==='Student visa'&&<StaffPanel><StaffSectionHeader title="Student visa checkpoint" copy="Answer the condition that applies to your situation."/><div className="staff-form-grid"><YesNo label="Have you completed the course you were sponsored to study?" value={studentCourseFinished} onChange={setStudentCourseFinished}/><YesNo label="Does your CONAGS job start after your course finishes?" value={jobStartsAfterCourse} onChange={setJobStartsAfterCourse}/><YesNo label="Are you relying on the full-time PhD 24-month exception?" value={phdStudy24Months} onChange={setPhdStudy24Months}/></div></StaffPanel>}
      <StaffPanel><StaffSectionHeader title="Address confirmation" copy="We already hold the address you gave during recruitment. Confirm the current address used for immigration support."/><div className="staff-form-field"><span className="staff-form-label">Address recorded in your recruitment application</span><div className="staff-card-copy" style={{whiteSpace:'pre-wrap'}}>{data.addresses.length?data.addresses.join('\n\n'):'No application address recorded.'}</div></div><label className="staff-form-field"><span className="staff-form-label">Current residential address</span><textarea className="staff-form-input" rows={4} value={currentAddress} onChange={e=>setCurrentAddress(e.target.value)} placeholder="Enter your current residential address"/></label></StaffPanel>
      <div className="staff-home-panel-actions"><StaffAction onClick={()=>void save('save')}>Save progress</StaffAction><StaffAction primary onClick={()=>setStep(2)}>Continue to dependants</StaffAction></div>
    </div>
  </StaffPanel>}

  {step===2&&<StaffPanel>
    <StaffSectionHeader title="2. Dependants and family" copy="Each dependant is treated as a separate immigration application. Some care occupations have additional dependant restrictions."/>
    <div className="staff-modern-form">
      <YesNo label="Do you want your partner or children to apply as your dependants?" value={wantsDependants} onChange={setWantsDependants}/>
      {wantsDependants==='true'&&(
        <>
          <YesNo label="Are any of those dependants currently in the UK?" value={dependantsInsideUk} onChange={setDependantsInsideUk}/>
          {dependants.map((dep,index)=>(
            <DependantEditor
              key={index}
              dependant={dep}
              index={index}
              visaTypes={data.visaTypes}
              onChange={updateDependant}
              onRemove={()=>setDependants(rows=>rows.filter((_,i)=>i!==index))}
            />
          ))}
          <StaffAction onClick={()=>setDependants(rows=>[...rows,blankDependant()])}>+ Add dependant</StaffAction>
        </>
      )}
      {preliminary?.dependantPosition==='restricted'&&<StaffNotice tone="warning"><strong>Dependant rules need careful review</strong><p>This job appears to use an occupation where current UK rules restrict dependant applications, subject to specific exceptions. CONAGS will not promise dependant eligibility from this screen.</p></StaffNotice>}
      <div className="staff-home-panel-actions"><StaffAction onClick={()=>void save('save')}>Save progress</StaffAction><StaffAction onClick={()=>setStep(1)}>Back</StaffAction><StaffAction primary onClick={()=>setStep(3)}>Continue to documents</StaffAction></div>
    </div>
  </StaffPanel>}

  {step===3&&<StaffPanel>
    <StaffSectionHeader title="3. Documents and history" copy="This section is designed for the legal/support team as much as for you. Give complete answers, including issues you think are unrelated."/>
    <div className="staff-modern-form">
      <div className="staff-form-grid">
       <YesNo label="Have you ever had a UK visa or immigration application refused?" value={previousImmigrationRefusals} onChange={setPreviousImmigrationRefusals}/>
       <YesNo label="Have you ever overstayed or breached UK immigration conditions?" value={previousOverstayOrBreach} onChange={setPreviousOverstayOrBreach}/>
       <YesNo label="Do you have any criminal convictions or cautions that may be relevant?" value={criminalConvictions} onChange={setCriminalConvictions}/>
      </div>
      <StaffSectionHeader title="Identity and current permission evidence" copy="Your recruitment application already contains your name, date of birth and nationality. Add the passport and UKVI details that the support team will need to prepare a switch application."/>
      <div className="staff-form-grid">
       <TextField label="Passport number" value={passportNumber} onChange={setPassportNumber}/>
       <TextField label="Passport country" value={passportCountry} onChange={setPassportCountry}/>
       <DateField label="Passport issue date" value={passportIssueDate} onChange={setPassportIssueDate}/>
       <DateField label="Passport expiry date" value={passportExpiryDate} onChange={setPassportExpiryDate}/>
       <TextField label="UKVI application / reference number, if any" value={ukviReference} onChange={setUkviReference}/>
       <TextField label="UKVI account email, if different from your CONAGS email" value={ukviAccountEmail} onChange={setUkviAccountEmail}/>
       <TextField label="UK status share code, if available" value={ukStatusShareCode} onChange={setUkStatusShareCode}/>
       <SelectField label="Current right to work" value={rightToWorkStatus} onChange={setRightToWorkStatus} options={[['yes','Yes'],['no','No'],['uncertain','Not sure']]}/>
       <SelectField label="Right-to-work evidence supplied to CONAGS" value={rightToWorkProofProvided} onChange={setRightToWorkProofProvided} options={[['yes','Yes'],['no','No']]}/>
      </div>
      <StaffNotice><strong>Recruitment record already on file</strong><p>Date of birth: {data.application?.date_of_birth||'Not recorded'} · Nationality: {data.application?.nationality||'Not recorded'}</p></StaffNotice>
            <TextArea label="Previous UK addresses / residence history" value={previousUkAddresses} onChange={setPreviousUkAddresses} placeholder="Give previous UK addresses and dates where relevant to your application."/>
      <TextArea label="UK immigration history" value={immigrationHistoryNotes} onChange={setImmigrationHistoryNotes} placeholder="List prior UK visas, applications, refusals, appeals, administrative reviews, overstays or other immigration events."/>
      <TextArea label="International travel history" value={travelHistoryNotes} onChange={setTravelHistoryNotes} placeholder="List material travel outside the UK and any periods of residence abroad relevant to the visa application."/>
      <TextField label="English-language evidence" value={englishEvidence} onChange={setEnglishEvidence} placeholder="For example: degree taught in English, approved test, previous successful visa evidence."/>
      <TextField label="Maintenance evidence" value={maintenanceEvidence} onChange={setMaintenanceEvidence} placeholder="For example: personal funds evidence or sponsor maintenance confirmation."/>
      <StaffSectionHeader title="Document checklist" copy="Required items change with the selected route and your circumstances. Upload what you already have; CONAGS can identify missing items during review."/>
      <div className="staff-home-lane-grid">{checklist.map((item:any)=>{const link=data.documentLinks.find((candidate:any)=>candidate.checklist_key===item.key);return <article key={item.key} className="staff-home-lane"><StaffBadge tone={link?.status==='accepted'?'live':link?.status==='rejected'?'danger':item.required?'attention':'neutral'}>{link?.status|| (item.required?'Required':'Conditional')}</StaffBadge><strong>{item.label}</strong><span>{link?.status==='accepted'?'Accepted by CONAGS':link?.status==='submitted'?'Submitted · awaiting review':link?.status==='rejected'?'Rejected · upload a replacement':'No case-linked upload yet'}</span></article>})}</div>
      <div className="staff-panel-nested"><StaffSectionHeader title="Upload a supporting document" copy="Classify the evidence when possible. This lets CONAGS review it against a specific checklist item rather than guessing from the filename."/><div className="staff-form-grid"><TextField label="Document title" value={uploadTitle} onChange={setUploadTitle} placeholder="e.g. Current eVisa evidence"/><SelectField label="What does this document support?" value={uploadChecklistKey} onChange={setUploadChecklistKey} options={[['','General case evidence'],...checklist.map((item:any)=>[item.key,item.label])]}/><label className="staff-form-field"><span className="staff-form-label">File</span><input className="staff-form-input" type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg" onChange={e=>setUploadFile(e.target.files?.[0]||null)}/></label></div><StaffAction onClick={()=>void upload()} disabled={uploading}>{uploading?'Uploading…':'Upload document securely'}</StaffAction></div>
      {data.documents.length>0&&<div className="staff-document-list">{data.documents.map((doc:any)=><article key={doc.id} className="staff-document-card"><div className="staff-document-main"><div className="staff-document-icon" aria-hidden="true">V</div><div className="staff-document-copy"><h3>{doc.title}</h3><p>{doc.description||'Private Visa Help document'}</p><div className="staff-document-meta">{doc.original_filename||'Portal document'} · {new Date(doc.issued_at).toLocaleDateString('en-GB',{dateStyle:'medium'})}</div></div></div><div className="staff-document-actions"><StaffAction href={'/staff/documents/'+encodeURIComponent(doc.id)}>Open</StaffAction></div></article>)}</div>}
      <div className="staff-home-panel-actions"><StaffAction onClick={()=>void save('save')}>Save progress</StaffAction><StaffAction onClick={()=>setStep(2)}>Back</StaffAction><StaffAction primary onClick={()=>setStep(4)}>Continue</StaffAction></div>
    </div>
  </StaffPanel>}

  {step===4&&<StaffPanel>
    <StaffSectionHeader title="Visa cost, IHS and decision timeline" copy="The figures below are an estimate based on the currently selected route, intended visa duration and number of applicants. Check the official GOV.UK links before payment; fee guidance is reviewed again after 8 October 2026."/>
    <div className="staff-form-grid">
      <SelectField label="Expected visa duration" value={durationMonths} onChange={setDurationMonths} options={[['6','6 months'],['12','1 year'],['18','18 months'],['24','2 years'],['30','30 months'],['36','3 years'],['42','42 months'],['48','4 years'],['54','54 months'],['60','5 years']]}/>
    </div>
    {data.costSummary&&<div className="staff-home-lane-grid">
      <article className="staff-home-lane"><StaffBadge tone="neutral">Visa application fee</StaffBadge><strong>{data.costSummary.applicationFeePerPerson==null?'Route review required':'£'+Number(data.costSummary.applicationFeePerPerson).toLocaleString('en-GB')+' per person'}</strong><span>{data.costSummary.estimatedApplicationFees==null?'Final fee depends on the confirmed route and duration.':'Estimated application fees for '+(1+dependants.length)+' applicant'+(dependants.length===0?'':'s')+': £'+Number(data.costSummary.estimatedApplicationFees).toLocaleString('en-GB')}</span></article>
      <article className="staff-home-lane"><StaffBadge tone={data.costSummary.ihsExempt?'live':'attention'}>Immigration Health Surcharge</StaffBadge><strong>{data.costSummary.estimatedIhsTotal==null?'Pending route/duration':data.costSummary.ihsExempt?'£0':'£'+Number(data.costSummary.estimatedIhsTotal).toLocaleString('en-GB')}</strong><span>{data.costSummary.ihsExempt?'Health and Care Worker applicants and eligible dependants are exempt from IHS.':'£'+Number(data.costSummary.ihsPerPersonPerYear).toLocaleString('en-GB')+' per year · estimated chargeable period '+(data.costSummary.estimatedIhsChargeableMonths==null?'pending':data.costSummary.estimatedIhsChargeableMonths+' months')+'.'}</span></article>
      <article className="staff-home-lane"><StaffBadge tone="live">UKVI decision standard</StaffBadge><strong>{data.costSummary.processingTime}</strong><span>Inside UK: {data.costSummary.processingTimeInsideUk} · Outside UK: {data.costSummary.processingTimeOutsideUk}</span></article>
      <article className="staff-home-lane"><StaffBadge tone="neutral">Estimated applicant cost</StaffBadge><strong>{data.costSummary.totalEstimatedApplicantCost==null?'Pending route/duration':'£'+Number(data.costSummary.totalEstimatedApplicantCost).toLocaleString('en-GB')}</strong><span>Excludes optional priority services and separate costs such as TB testing, translations or professional fees where applicable.</span></article>
    </div>}
    <StaffNotice tone="warning"><strong>Timeline is not a promise</strong><p>UKVI's published standard begins after the application has been submitted, identity has been proved and the required documents have been provided. Complex cases or verification checks can take longer, and CONAGS should not book travel on the assumption of a particular decision date.</p>{data.costSummary?.feeReviewDueLabel&&<p>{data.costSummary.feeReviewDueLabel}</p>}</StaffNotice>
    {data.costSummary?.sourceUrls?.length>0&&<div className="staff-home-panel-actions">{data.costSummary.sourceUrls.slice(0,4).map((url:string)=><StaffAction key={url} href={url}>Open official guidance</StaffAction>)}</div>}

    <StaffSectionHeader title="4. Your preliminary route and how you want help" copy="The route engine uses current published UK guidance plus CONAGS's recorded sponsored occupation. A legal/support review remains available whenever the facts are not straightforward."/>
    <div className="staff-visa-status-panel">
      <div className="staff-visa-status-top"><div><p className="staff-eyebrow">Preliminary route</p><h2 className="staff-card-heading">{preliminary?.title||'Route assessment pending'}</h2><p className="staff-card-copy">{preliminary?.reason||'Complete the earlier steps and save your answers.'}</p></div><StaffBadge tone={preliminary?.decision==='provisional'?'live':preliminary?.decision==='not_switchable'?'danger':'attention'}>{preliminary?.decision?.replaceAll('_',' ')||'pending'}</StaffBadge></div>
      {preliminary?.blockedReasons?.length>0&&<StaffNotice tone="warning"><strong>Reason for legal review</strong>{preliminary.blockedReasons.map((x:string)=><p key={x}>{x}</p>)}</StaffNotice>}
      <div className="staff-home-lane-grid">{(preliminary?.conditions||[]).map((x:string)=><article className="staff-home-lane" key={x}><StaffBadge tone="neutral">Condition</StaffBadge><span>{x}</span></article>)}</div>
      {preliminary?.sourceUrls?.length>0&&<div className="staff-home-panel-actions">{preliminary.sourceUrls.slice(0,4).map((url:string)=><StaffAction key={url} href={url}>Open official guidance</StaffAction>)}</div>}
    </div>
    <div className="staff-modern-form">
      <div className="staff-form-grid">
       <label className="staff-form-field"><span className="staff-form-label">I will complete the application myself</span><select className="staff-form-input" value={selfComplete} onChange={e=>{setSelfComplete(e.target.value);if(e.target.value==='yes')setLegalRequested('');}}><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
       <label className="staff-form-field"><span className="staff-form-label">I want CONAGS legal/support assistance</span><select className="staff-form-input" value={legalRequested} onChange={e=>{setLegalRequested(e.target.value);if(e.target.value==='yes')setSelfComplete('');}}><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
      {legalIntakeNeeded&&<StaffPanel><StaffSectionHeader title="Legal/support handover" copy="By continuing, you are asking CONAGS to review the information collected here and identify outstanding evidence. This does not give CONAGS authority to sign a declaration in your name unless a separate lawful process applies."/><label className="staff-form-field"><span className="staff-form-label">Message for CONAGS legal/support team</span><textarea className="staff-form-input" rows={5} value={staffMessage} onChange={e=>setStaffMessage(e.target.value)} placeholder="Explain your deadline, concerns, family circumstances or anything you want reviewed."/></label><label className="staff-check-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I consent to CONAGS authorised legal/support staff reviewing the immigration information and documents I submit through this case.</span></label></StaffPanel>}
      <StaffNotice><strong>What happens next</strong><p>{legalRequested==='yes'?'Your case will enter the CONAGS legal/support queue. The reviewer can request missing information or documents, record the route to pursue and move the case to ready for submission when evidence is complete.':selfComplete==='yes'?'Your case records the preliminary route and supporting checklist. You can continue through the official GOV.UK application process, while keeping the case available for CONAGS follow-up.':'Select an assistance option to submit the case.'}</p></StaffNotice>
      <div className="staff-home-panel-actions"><StaffAction onClick={()=>setStep(3)}>Back</StaffAction><StaffAction onClick={()=>void save('save')} disabled={saving}>{saving?'Saving…':'Save progress'}</StaffAction><StaffAction primary onClick={()=>void save('submit')} disabled={saving}>{saving?'Submitting…':'Submit Visa Help case'}</StaffAction></div>
    </div>
  </StaffPanel>}

 </StaffPageInner></StaffPage>;
}

function DependantEditor({dependant,index,visaTypes,onChange,onRemove}:{dependant:Dependant;index:number;visaTypes:any[];onChange:(index:number,key:keyof Dependant,value:string)=>void;onRemove:()=>void}){
 return <div className="staff-panel-nested">
  <StaffSectionHeader title={'Dependant '+(index+1)} copy="Capture the identity and current immigration position so the route can be checked properly."/>
  <div className="staff-form-grid">
   <SelectField label="Relationship" value={dependant.relationship} onChange={v=>onChange(index,'relationship',v)} options={[['partner','Partner / spouse / civil partner'],['child','Child']]}/>
   <TextField label="Full name" value={dependant.fullName} onChange={v=>onChange(index,'fullName',v)}/>
   <DateField label="Date of birth" value={dependant.dateOfBirth} onChange={v=>onChange(index,'dateOfBirth',v)}/>
   <TextField label="Nationality" value={dependant.nationality} onChange={v=>onChange(index,'nationality',v)}/>
   <SelectField label="Current location" value={dependant.currentLocation} onChange={v=>onChange(index,'currentLocation',v)} options={[['UK','United Kingdom'],['outside_uk','Outside the UK']]}/>
   <SelectField label="Current visa type" value={dependant.currentVisaType} onChange={v=>onChange(index,'currentVisaType',v)} options={visaTypes.map(x=>[x.value,x.label])}/>
   <DateField label="Current visa end date" value={dependant.currentVisaEndDate} onChange={v=>onChange(index,'currentVisaEndDate',v)}/>
   {dependant.relationship==='child'&&<div className="staff-form-grid">
    <YesNo label="Was the child born in the UK?" value={dependant.bornInUk} onChange={v=>onChange(index,'bornInUk',v)}/>
    <YesNo label="Is the child's other parent also sponsored as a care worker or senior care worker?" value={dependant.otherParentSponsored} onChange={v=>onChange(index,'otherParentSponsored',v)}/>
   </div>}
  </div>
  <StaffAction onClick={onRemove}>Remove dependant</StaffAction>
 </div>;
}

function SelectField({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:string[][]}){return <label className="staff-form-field"><span className="staff-form-label">{label}</span><select className="staff-form-input" value={value} onChange={e=>onChange(e.target.value)}><option value="">Select</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;}
function YesNo({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <SelectField label={label} value={value} onChange={onChange} options={[['true','Yes'],['false','No']]}/>;}
function DateField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="staff-form-field"><span className="staff-form-label">{label}</span><input className="staff-form-input" type="date" value={value} onChange={e=>onChange(e.target.value)}/></label>;}
function TextField({label,value,onChange,type='text',placeholder}:{label:string;value:string;onChange:(v:string)=>void;type?:string;placeholder?:string}){return <label className="staff-form-field"><span className="staff-form-label">{label}</span><input className="staff-form-input" type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;}
function TextArea({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string}){return <label className="staff-form-field"><span className="staff-form-label">{label}</span><textarea className="staff-form-input" rows={5} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;}
