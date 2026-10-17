'use client';

import { useEffect, useState } from 'react';
import { StaffAction, StaffBadge, StaffLoading, StaffNotice, StaffPage, StaffPageHeader, StaffPageInner, StaffPanel, StaffSectionHeader } from '@/components/StaffPortalUI';

type Row={id:string;status:string;legal_team_requested:boolean;self_complete_selected:boolean;selected_route:string;confirmed_route:string|null;conversation_id:string|null;legal_review_completed:boolean;legal_review_completed_by:string|null;legal_review_completed_at:string|null;submission_ready_at:string|null;target_role:string;target_work_location:string;monitor:any;milestones:any[];current_visa_type:string;current_visa_end_date:string;living_in_uk:boolean;updated_at:string;created_at:string;staff:any;recommendation:any;answers:any;dependants:any[];document_checklist:any[];documents:any[];documentLinks:any[];tasks:any[];events:any[];readiness:any;costSummary:any;legal_notes:string|null;staff_message:string|null};

export default function AdminVisaHelpPage(){
  const [rows,setRows]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState<'all'|'legal'|'self'|'review'|'urgent'>('all');
  const [selected,setSelected]=useState<Row|null>(null);
  const [notes,setNotes]=useState('');
  const [confirmedRoute,setConfirmedRoute]=useState('');
  const [legalReviewCompleted,setLegalReviewCompleted]=useState(false);
  const [requestType,setRequestType]=useState<'information'|'document'|'action'>('information');
  const [requestTitle,setRequestTitle]=useState('');
  const [requestDescription,setRequestDescription]=useState('');
  const [requestDueAt,setRequestDueAt]=useState('');
  const [taskAction,setTaskAction]=useState('');
  const [documentAction,setDocumentAction]=useState('');
  const [milestoneSaving,setMilestoneSaving]=useState('');

  async function load(){
    setLoading(true);setError('');
    try{
      const r=await fetch('/api/admin/workforce/visa-help',{cache:'no-store'});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b.error||'Unable to load Visa Help cases.');
      setRows(b.cases||[]);
      if(selected){
        const fresh=(b.cases||[]).find((x:Row)=>x.id===selected.id);
        if(fresh){setSelected(fresh);setNotes(fresh.legal_notes||'');setConfirmedRoute(fresh.confirmed_route||'');setLegalReviewCompleted(Boolean(fresh.legal_review_completed));}
      }
    }catch(e){setError(e instanceof Error?e.message:'Unable to load Visa Help cases.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  async function updateCase(patch:Record<string,any>){

    if(!selected)return;
    setError('');
    try{
      const r=await fetch('/api/admin/workforce/visa-help',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({caseId:selected.id,...patch})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b.error||'Unable to update case.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to update case.');}
  }

  async function createRequest(){
    if(!selected||!requestTitle.trim())return;
    setError('');
    try{
      const r=await fetch('/api/admin/workforce/visa-help/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({caseId:selected.id,taskType:requestType,title:requestTitle,description:requestDescription,dueAt:requestDueAt||null,required:true})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b.error||'Unable to create request.');
      setRequestTitle('');setRequestDescription('');setRequestDueAt('');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to create request.');}
  }

  async function reviewTask(taskId:string,action:'verify'|'reject'|'reopen'|'cancel'){
    setTaskAction(taskId+':'+action);setError('');
    try{
      const r=await fetch('/api/admin/workforce/visa-help/tasks',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({taskId,action,reviewerNote:notes})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b.error||'Unable to update request.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to update request.');}
    finally{setTaskAction('');}
  }

  async function updateMilestone(milestoneId:string,status:string){
    setMilestoneSaving(milestoneId);setError('');
    try{
      const r=await fetch('/api/admin/workforce/visa-help/milestones',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({milestoneId,status})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b.error||'Unable to update milestone.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to update milestone.');}
    finally{setMilestoneSaving('');}
  }

  async function reviewDocument(linkId:string,action:'accept'|'reject'){
    setDocumentAction(linkId+':'+action);setError('');
    try{
      const r=await fetch('/api/admin/workforce/visa-help/documents',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({linkId,action,reviewerNote:notes})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b.error||'Unable to review document.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to review document.');}
    finally{setDocumentAction('');}
  }

  if(loading)return <StaffLoading label="Loading Visa Help queue…"/>;
  const visible=rows.filter(row=>filter==='all'||(filter==='legal'&&row.legal_team_requested)||(filter==='self'&&row.self_complete_selected)||(filter==='review'&&['legal_review','awaiting_documents'].includes(row.status))||(filter==='urgent'&&row.monitor?.severity==='urgent'));

  return <StaffPage><StaffPageInner>
    <StaffPageHeader eyebrow="WORKFORCE · IMMIGRATION" title="Visa Help Queue" subtitle="Review preliminary route assessments, legal-support requests, dependant information, document readiness and staff questions." actions={<StaffAction onClick={()=>void load()}>Refresh</StaffAction>}/>
    {error&&<StaffNotice tone="danger"><strong>Visa Help error</strong><p>{error}</p></StaffNotice>}
    <div className="staff-stat-grid">
      <div className="staff-stat"><div className="staff-stat-value">{rows.length}</div><div className="staff-stat-label">Open cases</div></div>
      <div className="staff-stat"><div className="staff-stat-value">{rows.filter(x=>x.legal_team_requested).length}</div><div className="staff-stat-label">Legal team requested</div></div>
      <div className="staff-stat"><div className="staff-stat-value">{rows.filter(x=>x.status==='awaiting_documents').length}</div><div className="staff-stat-label">Awaiting documents</div></div>
      <div className="staff-stat"><div className="staff-stat-value">{rows.filter(x=>x.status==='ready_for_submission').length}</div><div className="staff-stat-label">Ready for submission</div></div>
    </div>
    <StaffPanel>
      <div className="staff-home-panel-actions">
        {(['all','legal','self','review','urgent'] as const).map(value=><StaffAction key={value} primary={filter===value} onClick={()=>setFilter(value)}>{value==='all'?'All':value==='legal'?'Legal queue':value==='self'?'Self-complete':'Needs review'}</StaffAction>)}
      </div>
      {!visible.length?<div className="staff-empty">No cases match this view.</div>:
      <div className="staff-document-list">{visible.map(row=><article key={row.id} className={'staff-document-card'+(row.legal_team_requested?' staff-document-card--attention':'')}>
        <div className="staff-document-main"><div className="staff-document-icon" aria-hidden="true">V</div><div className="staff-document-copy"><div className="staff-document-topline"><span className="staff-document-category">{row.updated_at?new Date(row.updated_at).toLocaleDateString('en-GB',{dateStyle:'medium'}):'Case'}</span><StaffBadge tone={row.legal_team_requested?'attention':'neutral'}>{row.legal_team_requested?'Legal help requested':row.status.replaceAll('_',' ')}</StaffBadge></div><h3>{row.staff?.full_name||'Staff member'}</h3><p>{row.target_role||row.staff?.job_title||'Role not recorded'} · {row.recommendation?.title||row.selected_route}</p><div className="staff-document-meta">Current visa: {row.current_visa_type||'Not recorded'}{row.current_visa_end_date?' · Expires '+row.current_visa_end_date:''} · Dependants: {Array.isArray(row.dependants)?row.dependants.length:0}</div>{row.monitor?.severity!=='normal'&&<div className="staff-document-meta"><StaffBadge tone={row.monitor.severity==='urgent'?'danger':'attention'}>{row.monitor.severity}</StaffBadge> · {row.monitor.nextAction}</div>}</div></div>
        <div className="staff-document-actions"><StaffAction primary onClick={()=>{setSelected(row);setNotes(row.legal_notes||'');setConfirmedRoute(row.confirmed_route||'');setLegalReviewCompleted(Boolean(row.legal_review_completed));}}>Open case</StaffAction></div>
      </article>)}</div>}
    </StaffPanel>

    {selected&&<StaffPanel>
      <StaffSectionHeader title={selected.staff?.full_name||'Visa Help case'} copy="Case review. The screening engine is a decision aid. Final route confirmation, evidence review and readiness remain under CONAGS staff/legal control."/>
      <div className="staff-stat-grid">
        <div className="staff-stat"><div className="staff-stat-value">{selected.recommendation?.title||'Review'}</div><div className="staff-stat-label">Preliminary route</div></div>
        <div className="staff-stat"><div className="staff-stat-value">{selected.recommendation?.decision||'unknown'}</div><div className="staff-stat-label">Screening decision</div></div>
        <div className="staff-stat"><div className="staff-stat-value">{selected.current_visa_end_date||'Not set'}</div><div className="staff-stat-label">Current visa end</div></div>
        <div className="staff-stat"><div className="staff-stat-value">{Array.isArray(selected.dependants)?selected.dependants.length:0}</div><div className="staff-stat-label">Dependants</div></div>
      </div>
      <StaffPanel>
        <StaffSectionHeader title="Applicant cost estimate" copy="Same current GOV.UK-based estimate shown to the staff member. This is an estimate, not a payment instruction."/>
        <div className="staff-visa-info-grid">
          <Info label="Visa application fees" value={selected.costSummary?.estimatedApplicationFees==null?'Route/duration review required':'£'+Number(selected.costSummary.estimatedApplicationFees).toLocaleString('en-GB')}/>
          <Info label="Estimated IHS" value={selected.costSummary?.estimatedIhsTotal==null?'Route/duration review required':selected.costSummary.ihsExempt?'£0':('£'+Number(selected.costSummary.estimatedIhsTotal).toLocaleString('en-GB'))}/>
          <Info label="IHS chargeable period" value={selected.costSummary?.estimatedIhsChargeableMonths==null?'Not calculated':selected.costSummary.estimatedIhsChargeableMonths+' months'}/>
          <Info label="Decision standard" value={selected.costSummary?.processingTime||'Route review required'}/>
        </div>
        {selected.costSummary?.feeReviewDueLabel&&<StaffNotice tone="warning"><strong>Fee freshness</strong><p>{selected.costSummary.feeReviewDueLabel}</p></StaffNotice>}
      </StaffPanel>
      <div className="staff-workforce-grid">
        <StaffPanel>
          <StaffSectionHeader title="Staff answers" copy="Information supplied through the Visa Help questionnaire."/>
          <div className="staff-visa-info-grid">
            <Info label="Current visa" value={selected.current_visa_type}/>
            <Info label="Work location" value={selected.target_work_location}/>
            <Info label="Months working for CONAGS" value={selected.answers?.monthsWorkingForLaurem}/>
            <Info label="Student condition" value={String(selected.answers?.studentCourseFinished??'Not answered')}/>
            <Info label="Previous refusal" value={String(selected.answers?.previousImmigrationRefusals??'Not answered')}/>
            <Info label="Previous overstay/breach" value={String(selected.answers?.previousOverstayOrBreach??'Not answered')}/>
            <Info label="Criminal convictions" value={String(selected.answers?.criminalConvictions??'Not answered')}/>
            <Info label="English evidence" value={selected.answers?.englishEvidence}/>
            <Info label="Maintenance evidence" value={selected.answers?.maintenanceEvidence}/>
            <Info label="Passport number" value={selected.answers?.passportNumber} sensitive/>
            <Info label="Passport country" value={selected.answers?.passportCountry}/>
            <Info label="Passport expiry" value={selected.answers?.passportExpiryDate}/>
            <Info label="UKVI reference" value={selected.answers?.ukviReference}/>
            <Info label="UKVI account email" value={selected.answers?.ukviAccountEmail}/>
            <Info label="Status share code" value={selected.answers?.ukStatusShareCode}/>
            <Info label="Right to work" value={selected.answers?.rightToWorkStatus}/>
            <Info label="RTW evidence supplied" value={selected.answers?.rightToWorkProofProvided}/>
          </div>
          {selected.staff_message&&<StaffNotice><strong>Staff message</strong><p>{selected.staff_message}</p></StaffNotice>}
        </StaffPanel>
        <StaffPanel>
          <StaffSectionHeader title="Case communication and audit trail" copy="The private case conversation is the place for staff questions. The timeline below records workflow actions separately."/>
      <div className="staff-home-panel-actions">{selected.conversation_id?<StaffAction primary href={'/admin/messages?conversation='+encodeURIComponent(selected.conversation_id)}>Open case conversation</StaffAction>:<StaffNotice><strong>No case conversation yet</strong><p>A case conversation is created when legal/support review is opened.</p></StaffNotice>}</div>
      {selected.events?.length>0&&<div className="staff-panel-nested"><div className="staff-document-list">{selected.events.slice(0,15).map((event:any)=><article key={event.id} className="staff-document-card"><div className="staff-document-main"><div className="staff-document-copy"><span className="staff-document-category">{event.actor_type} · {event.event_type.replaceAll('_',' ')}</span><h3>{new Date(event.created_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</h3><p>{event.metadata?.title||event.metadata?.taskId||event.metadata?.to||event.metadata?.reason||'Workflow activity recorded.'}</p></div></div></article>)}</div></div>}
      
      <StaffSectionHeader title="Recommendation conditions" copy="The reasons and conditions returned by the screening engine."/>
          <p className="staff-card-copy">{selected.recommendation?.reason}</p>
          <div className="staff-home-lane-grid">{(selected.recommendation?.conditions||[]).map((item:string)=><article className="staff-home-lane" key={item}><StaffBadge tone="neutral">Condition</StaffBadge><span>{item}</span></article>)}</div>
        </StaffPanel>
      </div>
      <StaffPanel>
        <StaffSectionHeader title="Visa Help milestones" copy="Structured case progress. Reviewers can move milestones as evidence and external application events are confirmed."/>
        {!selected.milestones?.length?<div className="staff-empty">No milestones have been created for this case yet.</div>:<div className="staff-document-list">{selected.milestones.map((milestone:any)=><article key={milestone.id} className="staff-document-card">
          <div className="staff-document-main"><div className="staff-document-icon" aria-hidden="true">{milestone.status==='completed'?'✓':'•'}</div><div className="staff-document-copy"><div className="staff-document-topline"><span className="staff-document-category">{milestone.milestone_type.replaceAll('_',' ')}</span><StaffBadge tone={milestone.status==='completed'?'live':milestone.status==='in_progress'?'attention':'neutral'}>{milestone.status}</StaffBadge></div><h3>{milestone.title}</h3><p>{milestone.due_at?'Target '+new Date(milestone.due_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'No target date'}</p>{milestone.notes&&<div className="staff-document-meta">{milestone.notes}</div>}</div></div>
          <div className="staff-document-actions"><select className="staff-form-input" value={milestone.status} onChange={e=>void updateMilestone(milestone.id,e.target.value)} disabled={milestoneSaving===milestone.id}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="skipped">Skipped</option></select></div>
        </article>)}</div>}
      </StaffPanel>

      <StaffPanel>
        <StaffSectionHeader title="Document readiness" copy="Route-specific evidence expected by the screening workflow and the files currently attached to the staff record."/>
        <div className="staff-home-lane-grid">{(selected.document_checklist||[]).map((item:any)=><article className="staff-home-lane" key={item.key}><StaffBadge tone={item.required?'attention':'neutral'}>{item.required?'Required':'Conditional'}</StaffBadge><strong>{item.label}</strong><span>{(selected.documents||[]).some((doc:any)=>String(doc.title||'').toLowerCase()===String(item.label||'').toLowerCase())?'Matched uploaded file':'Awaiting evidence / review'}</span></article>)}</div>
        {(selected.documents||[]).length>0&&<div className="staff-document-meta">Uploaded Visa Help files: {(selected.documents||[]).map((doc:any)=>doc.title).join(' · ')}</div>}
      </StaffPanel>

      <StaffPanel>
        <StaffSectionHeader title="Dependants" copy="Each dependant is captured separately so legal/support staff can assess identity, location, relationship and immigration position."/>
        {!selected.dependants?.length?<div className="staff-empty">No dependants were entered.</div>:
        <div className="staff-document-list">{selected.dependants.map((dep:any,index:number)=><article key={index} className="staff-document-card"><div className="staff-document-main"><div className="staff-document-copy"><span className="staff-document-category">{dep.relationship||'Dependant'}</span><h3>{dep.fullName||'Name not recorded'}</h3><p>{dep.currentLocation||'Location not recorded'} · Current visa: {dep.currentVisaType||'Not recorded'}</p><div className="staff-document-meta">DOB {dep.dateOfBirth||'Not set'} · Nationality {dep.nationality||'Not set'}</div></div></div></article>)}</div>}
      </StaffPanel>
      <StaffPanel>
        <StaffSectionHeader title="Readiness control" copy="The server blocks submission readiness until the required case conditions are met."/>
        <div className="staff-visa-info-grid">
          <Info label="Readiness" value={selected.readiness?.ready?'Ready':'Blocked'}/>
          <Info label="Required requests verified" value={selected.readiness?.verifiedRequiredTasks+'/'+(selected.readiness?.verifiedRequiredTasks+selected.readiness?.openRequiredTasks)}/>
          <Info label="Legal review" value={selected.legal_review_completed?'Completed':'Pending'}/>
          <Info label="Confirmed route" value={selected.confirmed_route||'Not confirmed'}/>
        </div>
        {selected.readiness?.issues?.length>0&&<StaffNotice tone="warning"><strong>Gate blockers</strong>{selected.readiness.issues.map((issue:string)=><p key={issue}>{issue}</p>)}</StaffNotice>}
        <div className="staff-form-grid">
          <label className="staff-form-field"><span className="staff-form-label">Confirmed route</span><select className="staff-form-input" value={confirmedRoute} onChange={e=>setConfirmedRoute(e.target.value)}><option value="">Use preliminary route</option><option value="health_and_care_worker">Health and Care Worker</option><option value="skilled_worker">Skilled Worker</option><option value="outside_uk_skilled_worker">Skilled Worker from outside UK</option><option value="legal_review_required">Legal review required</option><option value="not_switchable_from_current_permission">Not switchable on current permission</option></select></label>
          <label className="staff-check-row"><input type="checkbox" checked={legalReviewCompleted} onChange={e=>setLegalReviewCompleted(e.target.checked)}/><span>Legal/support review completed</span></label>
        </div>
        <div className="staff-home-panel-actions"><StaffAction onClick={()=>void updateCase({confirmedRoute:confirmedRoute||null,legalReviewCompleted,legalNotes:notes})}>Save review decision</StaffAction><StaffAction primary onClick={()=>void updateCase({status:'ready_for_submission',confirmedRoute:confirmedRoute||null,legalReviewCompleted,legalNotes:notes})}>Mark ready for submission</StaffAction><StaffAction onClick={()=>void updateCase({status:'submitted',legalNotes:notes})}>Record submitted</StaffAction></div>
      </StaffPanel>

      <StaffPanel>
        <StaffSectionHeader title="Create a case request" copy="Create an explicit, trackable request instead of putting evidence gaps only into free-text notes."/>
        <div className="staff-form-grid">
          <label className="staff-form-field"><span className="staff-form-label">Request type</span><select className="staff-form-input" value={requestType} onChange={e=>setRequestType(e.target.value as any)}><option value="information">Information</option><option value="document">Document</option><option value="action">Action</option></select></label>
          <label className="staff-form-field"><span className="staff-form-label">Due date</span><input className="staff-form-input" type="datetime-local" value={requestDueAt} onChange={e=>setRequestDueAt(e.target.value)}/></label>
          <label className="staff-form-field" style={{gridColumn:'1 / -1'}}><span className="staff-form-label">Title</span><input className="staff-form-input" value={requestTitle} onChange={e=>setRequestTitle(e.target.value)} placeholder="e.g. Upload current eVisa evidence"/></label>
          <label className="staff-form-field" style={{gridColumn:'1 / -1'}}><span className="staff-form-label">Instructions</span><textarea className="staff-form-input" rows={4} value={requestDescription} onChange={e=>setRequestDescription(e.target.value)} placeholder="Tell the staff member exactly what is needed and why." /></label>
        </div>
        <StaffAction primary onClick={()=>void createRequest()} disabled={!requestTitle.trim()}>Create request</StaffAction>
      </StaffPanel>

      <StaffPanel>
        <StaffSectionHeader title="Case requests" copy="Each request has its own lifecycle and must be verified before it stops blocking the readiness gate."/>
        {!selected.tasks?.length?<div className="staff-empty">No structured requests yet.</div>:<div className="staff-document-list">{selected.tasks.filter((task:any)=>task.status!=='cancelled').map((task:any)=><article key={task.id} className="staff-document-card">
          <div className="staff-document-main"><div className="staff-document-copy"><div className="staff-document-topline"><span className="staff-document-category">{task.task_type}{task.required?' · required':''}</span><StaffBadge tone={task.status==='verified'?'live':task.status==='rejected'?'danger':task.status==='submitted'?'attention':'neutral'}>{task.status}</StaffBadge></div><h3>{task.title}</h3><p>{task.description}</p><div className="staff-document-meta">{task.requested_by} · Created {new Date(task.created_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}{task.due_at?' · Due '+new Date(task.due_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):''}</div></div></div>
          <div className="staff-document-actions">{task.status==='submitted'&&<><StaffAction primary onClick={()=>void reviewTask(task.id,'verify')} disabled={taskAction.startsWith(task.id)}>{taskAction===task.id+':verify'?'Verifying…':'Verify'}</StaffAction><StaffAction onClick={()=>void reviewTask(task.id,'reject')} disabled={taskAction.startsWith(task.id)}>Reject</StaffAction></>}{task.status==='rejected'&&<StaffAction onClick={()=>void reviewTask(task.id,'reopen')} disabled={taskAction.startsWith(task.id)}>Reopen</StaffAction>}</div>
        </article>)}</div>}
      </StaffPanel>

      <StaffPanel>
        <StaffSectionHeader title="Evidence review" copy="Submitted documents are separate from accepted evidence. Reviewers can record a decision against the exact case link."/>
        {!selected.documentLinks?.length?<div className="staff-empty">No case-linked evidence yet.</div>:<div className="staff-document-list">{selected.documentLinks.map((link:any)=><article key={link.id} className="staff-document-card">
          <div className="staff-document-main"><div className="staff-document-copy"><div className="staff-document-topline"><span className="staff-document-category">{link.checklist_key||'General evidence'}</span><StaffBadge tone={link.status==='accepted'?'live':link.status==='rejected'?'danger':'attention'}>{link.status}</StaffBadge></div><h3>{(selected.documents||[]).find((doc:any)=>doc.id===link.document_id)?.title||'Visa Help document'}</h3><p>{(selected.documents||[]).find((doc:any)=>doc.id===link.document_id)?.original_filename||'Portal upload'}</p><div className="staff-document-meta">{link.reviewed_by?'Reviewed by '+link.reviewed_by:'Awaiting review'}{link.reviewer_note?' · '+link.reviewer_note:''}</div></div></div>
          <div className="staff-document-actions">{link.status!=='accepted'&&<StaffAction primary onClick={()=>void reviewDocument(link.id,'accept')} disabled={documentAction.startsWith(link.id)}>Accept</StaffAction>}{link.status!=='rejected'&&<StaffAction onClick={()=>void reviewDocument(link.id,'reject')} disabled={documentAction.startsWith(link.id)}>Reject</StaffAction>}</div>
        </article>)}</div>}
      </StaffPanel>

      <StaffPanel>
        <StaffSectionHeader title="Legal / admin action" copy="Move the case through the workflow as evidence and review are completed. The readiness gate is enforced server-side."/>
        <label className="staff-form-field"><span className="staff-form-label">Internal legal notes</span><textarea className="staff-form-input" rows={5} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Record evidence gaps, legal review notes, or the next action."/></label>
        <div className="staff-home-panel-actions">
          <StaffAction onClick={()=>void updateCase({status:'awaiting_staff',legalNotes:notes})}>Request more information</StaffAction>
          <StaffAction onClick={()=>void updateCase({status:'awaiting_documents',legalNotes:notes})}>Request documents</StaffAction>
          <StaffAction primary onClick={()=>void updateCase({status:'ready_for_submission',legalNotes:notes})}>Mark ready for submission</StaffAction>
          <StaffAction onClick={()=>void updateCase({status:'closed',legalNotes:notes})}>Close case</StaffAction>
        </div>
      </StaffPanel>
    </StaffPanel>}
  </StaffPageInner></StaffPage>;
}

function maskSensitive(value:any){const v=String(value||'').trim();if(!v)return 'Not recorded';return v.length<=4?'••••':'••••'+v.slice(-4);}
function Info({label,value,sensitive=false}:{label:string;value:any;sensitive?:boolean}){return <div className="staff-visa-info"><span>{label}</span><strong>{sensitive?maskSensitive(value):(value||'Not recorded')}</strong></div>;}
