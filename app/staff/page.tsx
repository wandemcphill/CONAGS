'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StaffLoading } from '@/components/StaffPortalUI';
import StaffHomeDashboard from '@/components/StaffHomeDashboard';

export type Staff = {
  laurem_id:string|null; employee_number:string; full_name:string; email:string; phone:string|null;
  job_title:string; employment_status:string; start_date:string|null; location:string|null;
  portal_address:string|null; address_line_1:string|null; city:string|null; postcode:string|null;
  country:string|null; profile_photo_path:string|null; profile_photo_url?:string|null;
};
export type Shift = { id:string; client_name:string|null; location:string; scheduled_start:string; scheduled_end:string; status:string; notes:string|null };
export type Timesheet = { id:string; assignment_id:string|null; work_date:string; clock_in:string|null; clock_out:string|null; total_hours:number|null; status:string; notes:string|null };
export type LeaveRequest = { id:string; leave_type:string; start_date:string; end_date:string; total_days:number; reason:string|null; status:string; review_note:string|null };
export type MessageSummary = { id:string; subject?:string|null; updated_at?:string|null; unread?:boolean; other?:{name:string;jobTitle:string}|null; latest?:{body:string|null;created_at:string|null;sender_staff_id?:string|null}|null };
export type OnboardingTask = { id:string; title:string; required:boolean; status:string; acknowledgement_required:boolean; acknowledged_at:string|null };
export type Onboarding = { title:string; status:string; tasks:OnboardingTask[] };
export type NotificationSummary = { id:string; title:string; body:string; read_at:string|null; action_url:string|null; created_at:string };
export type StaffDocument = { id:string; title:string; signature_status:string; category:string; issued_at:string };
export type AvailabilitySummary = { id:string; effective_from:string; full_time:boolean; part_time:boolean; days:boolean; nights:boolean; weekends:boolean; notes:string|null };
export type WorkforceReadiness = { overall:'ready'|'attention'|'blocked'; nextAction:string|null; lanes:{key:string;level:'ready'|'attention'|'blocked';label:string;detail:string;count:number}[] };
export type PayrollEntry = { id:string; payroll_period_id:string; approved_hours:number|null; hourly_rate:number|null; gross_amount:number|null; status:string; notes:string|null; created_at:string; updated_at:string; payroll_periods?:{period_start:string;period_end:string;pay_date:string|null;status:string}|null };
export type OperationalState = { level:'clear'|'active'|'attention'|'blocked'; status:string; label:string; detail:string; currentAssignmentId:string|null; upcomingAssignmentId:string|null; openAttendanceTimesheetId:string|null; counts:{upcomingAssignments:number;pendingTimesheets:number;rejectedTimesheets:number;pendingLeave:number;openPayrollEntries:number} };
export type WorkspaceBootstrap = {
  summary:{upcomingShifts:number;submittedTimesheets:number;rejectedTimesheets:number;approvedHours:number;pendingLeave:number;unreadNotifications:number;signaturePending:number;profileCompleteness:number;openPayroll:number};
  staff:Staff; nextShift:Shift|null; operationalState:OperationalState; readiness:WorkforceReadiness|null;
  notifications:NotificationSummary[]; documents:StaffDocument[];
};
export type VisaSupport = {
  available:boolean; pathway:'visa_switch'|'international_sponsorship'|null; label:string|null; explanation:string;
  cosStatus:{key:string;label:string;canDownload:boolean;documentId:string|null}; caseId:string|null;
  invoice:{invoiceNumber:string;status:string;amountPence:number;issueDate:string}|null;
};

export default function StaffPortalHome() {
  const router = useRouter();
  const [staff,setStaff] = useState<Staff|null>(null);
  const [shifts,setShifts] = useState<Shift[]>([]);
  const [timesheets,setTimesheets] = useState<Timesheet[]>([]);
  const [leave,setLeave] = useState<LeaveRequest[]>([]);
  const [messages,setMessages] = useState<MessageSummary[]>([]);
  const [onboarding,setOnboarding] = useState<Onboarding|null>(null);
  const [notifications,setNotifications] = useState<NotificationSummary[]>([]);
  const [documents,setDocuments] = useState<StaffDocument[]>([]);
  const [availability,setAvailability] = useState<AvailabilitySummary|null>(null);
  const [workforceReadiness,setWorkforceReadiness] = useState<WorkforceReadiness|null>(null);
  const [operationalState,setOperationalState] = useState<OperationalState|null>(null);
  const [payroll,setPayroll] = useState<PayrollEntry[]>([]);
  const [visaSupport,setVisaSupport] = useState<VisaSupport|null>(null);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState('');
  const [leaveType,setLeaveType] = useState('Annual Leave');
  const [leaveStart,setLeaveStart] = useState('');
  const [leaveEnd,setLeaveEnd] = useState('');
  const [leaveReason,setLeaveReason] = useState('');
  const [submittingLeave,setSubmittingLeave] = useState(false);
  const [loggingOut,setLoggingOut] = useState(false);
  const [photoFailed,setPhotoFailed] = useState(false);
  const [workspaceBootstrap,setWorkspaceBootstrap] = useState(false);
  const [bootstrapSummary,setBootstrapSummary] = useState<WorkspaceBootstrap|null>(null);

  async function load(showSpinner=true) {
    if(showSpinner) setLoading(true); else setRefreshing(true);
    setError('');
    try {
      const response=await fetch('/api/staff/workforce-dashboard',{cache:'no-store'});
      if(response.status===401){ router.replace('/staff/login'); return; }
      const body=await response.json();
      if(!response.ok) throw new Error(body.error||'Unable to load the staff dashboard.');
      setStaff(body.staff);
      setPhotoFailed(false);
      setShifts(body.shifts||[]);
      setTimesheets(body.timesheets||[]);
      setLeave(body.leave||[]);
      setMessages(body.messages||[]);
      setNotifications(body.notifications||[]);
      setDocuments(body.documents||[]);
      setAvailability(body.availability||null);
      setWorkforceReadiness(body.readiness||null);
      setOperationalState(body.operationalState||null);
      setPayroll(body.payroll?.entries||[]);
      setVisaSupport(body.visaSupport||null);
      setOnboarding(body.onboarding ? {
        title:String(body.onboarding.package?.title||'Onboarding'),
        status:String(body.onboarding.package?.status||'active'),
        tasks:body.onboarding.tasks||[],
      } : null);
    } catch(e) {
      setError(e instanceof Error?e.message:'Unable to load the staff dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(()=>{
    let active=true;
    async function bootstrap() {
      setWorkspaceBootstrap(true);
      try {
        const response=await fetch('/api/staff/workspace-summary',{cache:'no-store'});
        if(response.status===401){ router.replace('/staff/login'); return; }
        const body=await response.json().catch(()=>({}));
        if(!response.ok || !active) { await load(); return; }
        setBootstrapSummary(body);
        setStaff(body.staff);
        setShifts(body.nextShift ? [body.nextShift] : []);
        setWorkforceReadiness(body.readiness||null);
        setOperationalState(body.operationalState||null);
        setNotifications(body.notifications||[]);
        setDocuments(body.documents||[]);
        setLoading(false);
        await load(false);
      } catch {
        if(active) await load();
      } finally {
        if(active) setWorkspaceBootstrap(false);
      }
    }
    void bootstrap();
    return ()=>{ active=false; };
  },[]);

  async function logout() {
    setLoggingOut(true);
    try { await fetch('/api/staff/auth/logout',{method:'POST'}); }
    finally { router.replace('/staff/login'); }
  }

  async function submitLeave(event:React.FormEvent) {
    event.preventDefault();
    setSubmittingLeave(true);
    setError('');
    try {
      const response=await fetch('/api/staff/leave',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({leaveType,startDate:leaveStart,endDate:leaveEnd,reason:leaveReason}),
      });
      const body=await response.json();
      if(!response.ok) throw new Error(body.error||'Unable to submit leave request.');
      setLeaveStart('');
      setLeaveEnd('');
      setLeaveReason('');
      await load(false);
    } catch(e) {
      setError(e instanceof Error?e.message:'Unable to submit leave request.');
    } finally {
      setSubmittingLeave(false);
    }
  }

  function openWorkforceAction() {
    if(operationalState?.status==='on_shift') { router.push('/staff/attendance'); return; }
    if(operationalState?.status==='awaiting_timesheet_review' || operationalState?.status==='timesheet_resubmission') { router.push('/staff/timesheets'); return; }
    if(operationalState?.status==='leave_pending') { router.push('/staff/leave'); return; }
    if(operationalState?.status==='payroll_open') { router.push('/staff/payroll'); return; }
    router.push('/staff/shifts');
  }

  if(workspaceBootstrap && staff && bootstrapSummary) {
    return <StaffHomeBootstrap
      staff={staff}
      summary={bootstrapSummary.summary}
      nextShift={bootstrapSummary.nextShift}
      operationalState={bootstrapSummary.operationalState}
      onOpen={openWorkforceAction}
    />;
  }

  if(loading || !staff) return <StaffLoading label="Loading your staff workspace" />;

  return <StaffHomeDashboard
    staff={staff}
    shifts={shifts}
    timesheets={timesheets}
    leave={leave}
    messages={messages}
    onboarding={onboarding}
    notifications={notifications}
    documents={documents}
    availability={availability}
    workforceReadiness={workforceReadiness}
    operationalState={operationalState}
    payroll={payroll}
    visaSupport={visaSupport}
    error={error}
    refreshing={refreshing}
    loggingOut={loggingOut}
    submittingLeave={submittingLeave}
    leaveType={leaveType}
    leaveStart={leaveStart}
    leaveEnd={leaveEnd}
    leaveReason={leaveReason}
    photoFailed={photoFailed}
    onRefresh={()=>void load(false)}
    onLogout={()=>void logout()}
    onRetry={()=>void load(false)}
    onLeaveTypeChange={setLeaveType}
    onLeaveStartChange={setLeaveStart}
    onLeaveEndChange={setLeaveEnd}
    onLeaveReasonChange={setLeaveReason}
    onSubmitLeave={submitLeave}
    onPhotoError={()=>setPhotoFailed(true)}
    onOpen={(href)=>router.push(href)}
    onOpenWorkforceAction={openWorkforceAction}
  />;
}

function StaffHomeBootstrap({
  staff,summary,nextShift,operationalState,onOpen,
}:{
  staff:Staff;
  summary:WorkspaceBootstrap['summary'];
  nextShift:Shift|null;
  operationalState:OperationalState;
  onOpen:()=>void;
}) {
  return <main className="staff-dashboard-page staff-bootstrap-page">
    <div className="staff-page-inner">
      <header className="staff-bootstrap-hero">
        <div>
          <p className="staff-eyebrow">CONAGS CARE · STAFF PORTAL</p>
          <h1>Welcome, {staff.full_name}</h1>
          <p>{staff.job_title} · {staff.location||'Location not set'} · CONAGS ID {staff.laurem_id||staff.employee_number}</p>
        </div>
        <span className="staff-badge staff-badge-live">{staff.employment_status}</span>
      </header>
      <section className="staff-bootstrap-command">
        <div>
          <p className="staff-eyebrow staff-eyebrow--light">MY DAY</p>
          <h2>What needs your attention</h2>
          <p>{operationalState?.detail||'We are securely loading your full staff workspace.'}</p>
        </div>
        <button className="staff-action-primary" onClick={onOpen}>Open attendance</button>
      </section>
      <div className="staff-stat-grid">
        <div className="staff-metric"><strong>{summary.upcomingShifts}</strong><span>Upcoming shifts</span></div>
        <div className="staff-metric"><strong>{summary.submittedTimesheets+summary.rejectedTimesheets}</strong><span>Pending timesheets</span></div>
        <div className="staff-metric"><strong>{summary.pendingLeave}</strong><span>Pending leave</span></div>
        <div className="staff-metric"><strong>{summary.approvedHours.toFixed(2)}</strong><span>Approved hours</span></div>
        <div className="staff-metric"><strong>{summary.unreadNotifications}</strong><span>Unread notifications</span></div>
      </div>
      {nextShift&&<section className="staff-panel staff-bootstrap-panel">
        <div className="staff-section-header"><div><h2>Next shift</h2><p>Your nearest assignment is ready while the rest of the workspace loads.</p></div></div>
        <div className="staff-bootstrap-shift">
          <div>
            <span className="staff-badge">{nextShift.status}</span>
            <h3>{nextShift.client_name||'CONAGS Assignment'}</h3>
            <p>{nextShift.location}</p>
            <strong>{new Date(nextShift.scheduled_start).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'})}</strong>
          </div>
          <a className="staff-action-primary" href="/staff/attendance">Open attendance</a>
        </div>
      </section>}
      <div className="staff-bootstrap-loading"><span className="staff-spinner" aria-hidden="true"></span><span>Finishing your secure workspace…</span></div>
    </div>
  </main>;
}
