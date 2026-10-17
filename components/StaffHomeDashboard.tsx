'use client';

import { StaffAction, StaffBadge, StaffMetric, StaffNotice, StaffPage, StaffPageHeader, StaffPageInner, StaffPanel, StaffSectionHeader } from '@/components/StaffPortalUI';
import type { AvailabilitySummary, LeaveRequest, MessageSummary, NotificationSummary, Onboarding, OperationalState, PayrollEntry, Shift, Staff, StaffDocument, Timesheet, VisaSupport, WorkforceReadiness } from '@/app/staff/page';

type Props = {
  staff:Staff; shifts:Shift[]; timesheets:Timesheet[]; leave:LeaveRequest[]; messages:MessageSummary[];
  onboarding:Onboarding|null; notifications:NotificationSummary[]; documents:StaffDocument[]; availability:AvailabilitySummary|null;
  workforceReadiness:WorkforceReadiness|null; operationalState:OperationalState|null; payroll:PayrollEntry[]; visaSupport:VisaSupport|null;
  error:string; refreshing:boolean; loggingOut:boolean; submittingLeave:boolean; leaveType:string; leaveStart:string; leaveEnd:string; leaveReason:string;
  photoFailed:boolean; onRefresh:()=>void; onLogout:()=>void; onRetry:()=>void; onLeaveTypeChange:(value:string)=>void;
  onLeaveStartChange:(value:string)=>void; onLeaveEndChange:(value:string)=>void; onLeaveReasonChange:(value:string)=>void;
  onSubmitLeave:(event:React.FormEvent)=>void; onPhotoError:()=>void; onOpen:(href:string)=>void; onOpenWorkforceAction:()=>void;
};

const statusLabel=(value:string)=>value.replaceAll('_',' ');
const fmtDate=(value:string|null)=>value ? new Date(value+'T00:00:00').toLocaleDateString('en-GB',{dateStyle:'medium'}) : 'Not set';
const fmtDateTime=(value:string|null)=>value ? new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}) : 'Not set';
const money=(value:number|null|undefined)=>value==null||!Number.isFinite(Number(value))?'Not set':'£'+Number(value).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});

function tone(value:string):'live'|'attention'|'danger'|'neutral' {
  if(['active','ready','approved','confirmed','completed'].includes(value)) return 'live';
  if(['rejected','cancelled','blocked','declined'].includes(value)) return 'danger';
  if(['attention','pending','processing','on_shift'].includes(value)) return 'attention';
  return 'neutral';
}

function operationalTone(level:OperationalState['level']) {
  return level==='blocked'?'danger':level==='attention'?'attention':level==='active'?'live':'neutral';
}

function initialLetters(name:string) {
  return name.split(' ').map(part=>part[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
}

export default function StaffHomeDashboard(props:Props) {
  const {staff,shifts,timesheets,leave,messages,onboarding,notifications,documents,availability,workforceReadiness,operationalState,payroll,visaSupport,error,refreshing,loggingOut,submittingLeave,leaveType,leaveStart,leaveEnd,leaveReason,photoFailed,onRefresh,onLogout,onRetry,onLeaveTypeChange,onLeaveStartChange,onLeaveEndChange,onLeaveReasonChange,onSubmitLeave,onPhotoError,onOpen,onOpenWorkforceAction}=props;
  const metrics={
    upcoming:shifts.filter(s=>['scheduled','confirmed'].includes(s.status)).length,
    submitted:timesheets.filter(t=>t.status==='submitted').length,
    approvedHours:timesheets.filter(t=>['approved','paid'].includes(t.status)).reduce((sum,t)=>sum+(Number(t.total_hours)||0),0),
    pendingLeave:leave.filter(r=>r.status==='pending').length,
    unreadMessages:messages.filter(m=>Boolean(m.unread)).length,
    unreadNotifications:notifications.filter(n=>!n.read_at).length,
    openPayroll:payroll.filter(p=>!['paid','void'].includes(p.status)).length,
  };
  const required=onboarding?.tasks.filter(task=>task.required)||[];
  const onboardingProgress=required.length?Math.round((required.filter(task=>(task.status==='completed'||task.status==='waived')&&(!task.acknowledgement_required||Boolean(task.acknowledged_at))).length/required.length)*100):onboarding?100:0;
  const profileFields=[staff.phone,staff.address_line_1,staff.city,staff.postcode,staff.country,staff.profile_photo_path];
  const profileCompleteness=Math.round(profileFields.filter(Boolean).length/profileFields.length*100);
  const visaStatus=visaSupport?.cosStatus?.label||'COS not requested';
  const visaKey=visaSupport?.cosStatus?.key||'not_requested';
  const visaDocument=visaSupport?.cosStatus?.canDownload?visaSupport.cosStatus.documentId:null;

  return <StaffPage className="staff-page--home"><StaffPageInner>
    <StaffPageHeader
      eyebrow="CONAGS CARE · STAFF PORTAL"
      title={'Welcome, '+staff.full_name}
      subtitle={staff.job_title+' · '+(staff.location||'Location not set')+' · CONAGS ID '+(staff.laurem_id||staff.employee_number)}
      actions={<><StaffBadge tone={tone(staff.employment_status)}>{statusLabel(staff.employment_status)}</StaffBadge><StaffAction onClick={onRefresh} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</StaffAction><StaffAction onClick={onLogout} disabled={loggingOut}>{loggingOut?'Signing out…':'Sign out'}</StaffAction></>}
    />

    <div className="staff-home-identity">
      <div className="staff-home-avatar">{staff.profile_photo_url&&!photoFailed?<img src={staff.profile_photo_url} alt="CONAGS staff photograph" onError={onPhotoError}/>:<span>{initialLetters(staff.full_name)}</span>}</div>
      <div><strong>{staff.employee_number}</strong><span>{staff.email}</span><span>{staff.portal_address||'Staff portal address provisioned from your employment record.'}</span></div>
      <StaffAction href="/staff/profile">Edit profile</StaffAction>
    </div>

    {error&&<StaffNotice tone="danger"><strong>Staff workspace needs attention</strong><p>{error}</p><StaffAction onClick={onRetry}>Try again</StaffAction></StaffNotice>}

    <StaffPanel className="staff-home-command">
      <div className="staff-home-command-inner">
        <div><p className="staff-eyebrow staff-eyebrow--light">MY DAY</p><h2>What needs your attention</h2><p>{operationalState?.detail||'Your staff workspace is ready. Review your next shift, messages and outstanding tasks.'}</p></div>
        <div className="staff-home-command-actions"><StaffAction onClick={onOpenWorkforceAction} primary>{operationalState?.status==='on_shift'?'Open attendance':operationalState?.status==='awaiting_timesheet_review'||operationalState?.status==='timesheet_resubmission'?'Review timesheets':operationalState?.status==='leave_pending'?'View leave':operationalState?.status==='payroll_open'?'View payroll':'View my shifts'}</StaffAction><StaffAction href="/staff/messages">Messages {metrics.unreadMessages?'('+metrics.unreadMessages+')':''}</StaffAction><StaffAction href="/staff/week">My Week</StaffAction></div>
      </div>
    </StaffPanel>

    {visaSupport&&<div className="staff-home-grid staff-home-grid--wide"><StaffPanel className="staff-home-cos"><StaffSectionHeader title="Certificate of Sponsorship" copy="Your immigration and COS status stays visible in the main workspace."/><div className="staff-home-cos-top"><div><StaffBadge tone={visaKey==='active'?'live':visaKey==='processing'?'attention':'neutral'}>{visaStatus}</StaffBadge><p>{visaSupport.explanation}</p></div><div className="staff-home-actions">{visaSupport.available&&<StaffAction href="/staff/visa-sponsorship" primary>{visaSupport.label||'Visa & Sponsorship'}</StaffAction>}{visaDocument&&<StaffAction href={'/api/staff/documents/'+encodeURIComponent(visaDocument)+'/download'}>Download COS</StaffAction>}<StaffAction href="/staff/messages">Message Admin / HR</StaffAction></div></div></StaffPanel><StaffPanel className="staff-home-support"><StaffSectionHeader title="Need help?" copy="Send a private message directly to CONAGS Admin / HR."/><StaffAction href="/staff/messages" primary>Open Messages</StaffAction></StaffPanel></div>}

    <div className="staff-stat-grid"><StaffMetric label="Upcoming shifts" value={metrics.upcoming}/><StaffMetric label="Timesheets submitted" value={metrics.submitted}/><StaffMetric label="Approved hours" value={metrics.approvedHours.toFixed(2)}/><StaffMetric label="Pending leave" value={metrics.pendingLeave}/><StaffMetric label="Open payroll" value={metrics.openPayroll}/></div>

    <StaffPanel><StaffSectionHeader title="How we work" copy="CONAGS recruits care staff and places them into contracted services across London, West Midlands, Manchester and Glasgow, with stable-shift and longer-term posting preferences where client contracts allow."/><div className="staff-home-link-grid"><StaffAction href="/staff/availability" primary>Rota & work preferences</StaffAction><StaffAction href="/staff/training" primary>Training</StaffAction><StaffAction href="/staff/compliance">DBS & PVG</StaffAction><StaffAction href="/staff/week">My Week</StaffAction></div></StaffPanel>\n\n    <StaffPanel><StaffSectionHeader title="CONAGS assurance & visa help" copy="Check CONAGS regulatory and sponsor information, then use the guided Visa Help Centre for route screening, dependant questions and legal/support handover."/><div className="staff-home-link-grid"><StaffAction href="/staff/laurem-assurance" primary>CONAGS Assurance</StaffAction><StaffAction href="/staff/visa-help" primary>Visa Help Centre</StaffAction><StaffAction href="/staff/visa-sponsorship">Visa & Sponsorship</StaffAction><StaffAction href="/staff/documents">Visa documents</StaffAction></div></StaffPanel>

    {workforceReadiness&&<StaffPanel><StaffSectionHeader title="Workforce operations" copy={workforceReadiness.nextAction||'No operational exceptions detected.'}/><div className="staff-home-status-head"><StaffBadge tone={tone(workforceReadiness.overall)}>{workforceReadiness.overall.toUpperCase()}</StaffBadge><StaffAction href="/staff/profile">Open profile</StaffAction></div><div className="staff-home-lane-grid">{workforceReadiness.lanes.map(lane=><article key={lane.key} className="staff-home-lane"><StaffBadge tone={tone(lane.level)}>{lane.level==='ready'?'Ready':lane.level==='attention'?'Needs attention':'Blocked'}</StaffBadge><strong>{lane.label}</strong><span>{lane.detail}</span></article>)}</div></StaffPanel>}

    {operationalState&&<StaffPanel className="staff-home-state"><StaffSectionHeader title="Today's workforce state" copy={operationalState.detail}/><div className="staff-home-state-head"><div><h3>{operationalState.label}</h3><span>Current status: {statusLabel(operationalState.status)}</span></div><StaffAction onClick={onOpenWorkforceAction} primary>{operationalState.status==='on_shift'?'Open attendance':operationalState.status==='upcoming_shift'?'View next shift':operationalState.status==='leave_pending'?'View leave':operationalState.status==='payroll_open'?'View payroll':'Review timesheets'}</StaffAction></div><div className="staff-home-mini-grid"><StaffMetric label="Upcoming" value={operationalState.counts.upcomingAssignments}/><StaffMetric label="Pending timesheets" value={operationalState.counts.pendingTimesheets}/><StaffMetric label="Rejected timesheets" value={operationalState.counts.rejectedTimesheets}/><StaffMetric label="Pending leave" value={operationalState.counts.pendingLeave}/><StaffMetric label="Open payroll" value={operationalState.counts.openPayrollEntries}/></div></StaffPanel>}

    <StaffPanel><StaffSectionHeader title="Your staff record" copy="Keep the core areas current so your Staff Portal stays complete and useful."/><div className="staff-home-readiness-grid"><StaffHomeReadiness title="Profile" value={profileCompleteness===100?'Complete':profileCompleteness+'% complete'} text={profileCompleteness===100?'Phone, address and photograph are present.':'Add missing contact, address or photograph details.'} href="/staff/profile"/><StaffHomeReadiness title="Availability" value={availability?'Recorded':'Not set'} text={availability?'Current work preferences are recorded.':'Tell CONAGS how you prefer to work.'} href="/staff/availability"/><StaffHomeReadiness title="Documents" value={documents.length?documents.length+' issued':'None issued'} text={documents.some(d=>d.signature_status==='pending')?'A document needs your signature.':'Review your employment documents.'} href="/staff/documents"/><StaffHomeReadiness title="Notifications" value={metrics.unreadNotifications?metrics.unreadNotifications+' unread':'All caught up'} text="Keep track of workforce updates and decisions." href="/staff/notifications"/></div></StaffPanel>

    {onboarding&&<StaffPanel><StaffSectionHeader title={onboarding.title} copy="Complete required onboarding items and acknowledgements."/><div className="staff-home-progress-head"><StaffBadge tone={onboardingProgress===100?'live':'attention'}>{onboardingProgress}% complete</StaffBadge><StaffAction href="/staff/onboarding" primary>Open onboarding</StaffAction></div><div className="staff-progress"><progress className="staff-progress-bar" max="100" value={onboardingProgress} aria-label="Onboarding progress"/></div><div className="staff-home-meta-row"><span>{onboarding.tasks.filter(t=>t.required&&t.status!=='completed'&&t.status!=='waived').length} required items open</span><span>{onboarding.tasks.filter(t=>t.required&&t.acknowledgement_required&&!t.acknowledged_at).length} acknowledgements pending</span></div></StaffPanel>}

    <div className="staff-home-grid"><StaffPanel><StaffSectionHeader title="Next shift" copy="Your nearest scheduled assignment."/><div className="staff-home-panel-actions"><StaffAction href="/staff/shifts">View shifts</StaffAction><StaffAction href="/staff/availability">Availability</StaffAction></div>{shifts[0]?<div className="staff-home-next-shift"><div><StaffBadge tone={tone(shifts[0].status)}>{statusLabel(shifts[0].status)}</StaffBadge><h3>{shifts[0].client_name||'CONAGS Assignment'}</h3><p>{shifts[0].location}</p><span>{fmtDateTime(shifts[0].scheduled_start)} to {fmtDateTime(shifts[0].scheduled_end)}</span>{shifts[0].notes&&<small>{shifts[0].notes}</small>}</div><StaffAction href="/staff/attendance" primary>Attendance</StaffAction></div>:<div className="staff-empty">No upcoming shifts are currently scheduled.</div>}</StaffPanel>

      <StaffPanel><StaffSectionHeader title="Quick access" copy="Everything you use most often."/><div className="staff-home-quick-links">{[['Onboarding','/staff/onboarding'],['Visa & Sponsorship','/staff/visa-sponsorship'],['Notifications',notifications.some(n=>!n.read_at)?'/staff/notifications':'/staff/notifications'],['Messages','/staff/messages'],['Attendance','/staff/attendance'],['Timesheets','/staff/timesheets'],['Payroll','/staff/payroll'],['My Profile','/staff/profile'],['Documents','/staff/documents'],['Availability & Preferences','/staff/availability'],['My Shifts','/staff/shifts'],['My Week','/staff/week']].map(([label,href])=><StaffAction key={href} href={href}>{label}<span aria-hidden="true">→</span></StaffAction>)}</div></StaffPanel></div>

    <div className="staff-home-grid"><StaffPanel><StaffSectionHeader title="Payroll" copy="Latest approved hours, rate and gross amount."/><div className="staff-home-panel-actions"><StaffAction href="/staff/payroll">Open payroll</StaffAction></div>{payroll[0]?<div className="staff-home-payroll"><div><StaffBadge tone={tone(payroll[0].status)}>{statusLabel(payroll[0].status)}</StaffBadge><strong>{payroll[0].approved_hours??0} approved hours</strong></div><div className="staff-home-pay-grid"><StaffHomeInfo label="Hourly rate" value={money(payroll[0].hourly_rate)}/><StaffHomeInfo label="Gross" value={money(payroll[0].gross_amount)}/><StaffHomeInfo label="Pay date" value={payroll[0].payroll_periods?.pay_date?fmtDate(payroll[0].payroll_periods.pay_date):'Not set'}/></div></div>:<div className="staff-empty">No payroll entry has been published yet.</div>}</StaffPanel>

      <StaffPanel><StaffSectionHeader title="Notifications" copy="Latest decisions and workforce updates."/><div className="staff-home-panel-actions"><StaffAction href="/staff/notifications">View all</StaffAction></div><div className="staff-home-list">{notifications.slice(0,4).map(n=><a href={n.action_url||'/staff/notifications'} key={n.id} className="staff-home-list-item"><div><strong>{n.title}</strong><span>{n.body}</span></div>{!n.read_at&&<StaffBadge tone="danger">NEW</StaffBadge>}</a>)}{!notifications.length&&<div className="staff-empty">No notifications yet.</div>}</div></StaffPanel></div>

    <div className="staff-home-grid"><StaffPanel><StaffSectionHeader title="Timesheets" copy="Latest submissions and approvals."/><div className="staff-home-panel-actions"><StaffAction href="/staff/timesheets">Manage</StaffAction></div><div className="staff-home-list">{timesheets.slice(0,5).map(t=><div key={t.id} className="staff-home-list-item"><div><strong>{fmtDate(t.work_date)}</strong><span>{Number(t.total_hours||0).toFixed(2)} hours</span></div><StaffBadge tone={tone(t.status)}>{statusLabel(t.status)}</StaffBadge></div>)}{!timesheets.length&&<div className="staff-empty">No timesheets have been submitted yet.</div>}</div></StaffPanel>

      <StaffPanel><StaffSectionHeader title="My leave" copy="Request time away and track decisions."/><form className="staff-home-leave-form" onSubmit={onSubmitLeave}><label>Leave type<select value={leaveType} onChange={e=>onLeaveTypeChange(e.target.value)}><option>Annual Leave</option><option>Sick Leave</option><option>Emergency Leave</option><option>Other</option></select></label><label>Start date<input type="date" value={leaveStart} onChange={e=>onLeaveStartChange(e.target.value)} required/></label><label>End date<input type="date" value={leaveEnd} onChange={e=>onLeaveEndChange(e.target.value)} required/></label><label>Reason<textarea value={leaveReason} onChange={e=>onLeaveReasonChange(e.target.value)} placeholder="Reason or additional context (optional)" rows={3} maxLength={2000}/></label><StaffAction primary disabled={submittingLeave}>{submittingLeave?'Submitting…':'Request leave'}</StaffAction></form><div className="staff-home-list">{leave.slice(0,3).map(r=><div key={r.id} className="staff-home-list-item"><div><strong>{r.leave_type}</strong><span>{fmtDate(r.start_date)} to {fmtDate(r.end_date)} · {r.total_days} day{r.total_days===1?'':'s'}</span></div><StaffBadge tone={tone(r.status)}>{statusLabel(r.status)}</StaffBadge></div>)}</div></StaffPanel></div>

    <StaffPanel><StaffSectionHeader title="Recent messages" copy="Internal communication."/><div className="staff-home-panel-actions"><StaffAction href="/staff/messages">Open messages</StaffAction></div><div className="staff-home-list">{messages.slice(0,4).map(m=><a href="/staff/messages" key={m.id} className="staff-home-list-item"><div><strong>{m.other?.name||m.subject||'Conversation'}</strong><span>{m.latest?.body||'Open the conversation to view the latest message.'}</span></div>{m.unread&&<StaffBadge tone="attention">Unread</StaffBadge>}</a>)}{!messages.length&&<div className="staff-empty">No internal conversations yet.</div>}</div></StaffPanel>

    <StaffPanel><StaffSectionHeader title="Employment record" copy="Basic details linked to your CONAGS staff identity."/><div className="staff-home-info-grid"><StaffHomeInfo label="Email" value={staff.email}/><StaffHomeInfo label="Phone" value={staff.phone||'Not set'}/><StaffHomeInfo label="Start date" value={fmtDate(staff.start_date)}/><StaffHomeInfo label="Internal address" value={staff.portal_address||'Provisioning…'}/></div></StaffPanel>
  </StaffPageInner></StaffPage>;
}

function StaffHomeReadiness({title,value,text,href}:{title:string;value:string;text:string;href:string}) {
  return <a href={href} className="staff-home-readiness-card"><span>{title}</span><strong>{value}</strong><small>{text}</small><em>Open →</em></a>;
}

function StaffHomeInfo({label,value}:{label:string;value:string}) {
  return <div className="staff-home-info"><span>{label}</span><strong>{value}</strong></div>;
}
