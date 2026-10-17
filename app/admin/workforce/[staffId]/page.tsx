'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const tabs = ['Identity', 'Employment', 'Compliance', 'Documents', 'Onboarding', 'Shifts', 'Timesheets', 'Leave', 'Payroll', 'Audit'] as const;
type Tab = typeof tabs[number];

type Manager = { id: string; full_name: string; job_title: string; email: string };

type Staff = {
  id: string;
  application_id: string | null;
  employee_number: string;
  laurem_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string;
  employment_status: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  manager_id: string | null;
  manager: Manager | null;
  employment_pathway: string;
  nmc_number: string | null;
  nmc_status: string | null;
  nmc_expiry_date: string | null;
  right_to_work_pathway: 'uk' | 'overseas' | 'sponsorship' | 'unknown' | null;
  right_to_work_verified: boolean;
  right_to_work_expiry_date: string | null;
  right_to_work_notes: string | null;
  dbs_verified: boolean;
  dbs_pvg_status: string | null;
  dbs_pvg_check_date: string | null;
  dbs_pvg_expiry_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  contract_id: string | null;
  activated_at: string | null;
  activation_expires_at: string | null;
  activation_used_at: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  profile_photo_path: string | null;
  profile_photo_updated_at: string | null;
  profile_photo_url?: string | null;
  created_at: string;
  updated_at: string;
};

type ComplianceSnapshot = {
  overallStatus: 'Current' | 'Expiring Soon' | 'Expired' | 'Missing' | 'Under Review';
  rightToWork: { pathway: string; verified: boolean; statusCategory: string; expiryDate: string | null; notes: string | null; detail: string };
  dbsPvg: { verified: boolean; statusCategory: string; checkDate: string | null; expiryDate: string | null; detail: string };
  nmcRegistration: { isNurse: boolean; nmcNumber: string | null; registrationState: string; statusCategory: string; expiryDate: string | null; detail: string };
  documentsComplete: boolean;
  onboardingComplete: boolean;
  attentionItems: string[];
  complianceFollowUps: string[];
};

type Document = {
  id: string;
  title: string;
  category: string;
  source_type: string;
  source_key: string | null;
  requires_signature: boolean;
  signature_status: string;
  signature_name: string | null;
  signed_at: string | null;
  status: string;
  issued_at: string;
  superseded_at: string | null;
  superseded_by: string | null;
  displayStatus?: string;
};

type Assignment = { id: string; client_name: string | null; location: string; scheduled_start: string; scheduled_end: string; status: string; notes: string | null };
type Timesheet = { id: string; assignment_id: string | null; work_date: string; clock_in: string | null; clock_out: string | null; break_minutes: number; total_hours: number | null; status: string; notes: string | null; approved_by: string | null; approved_at: string | null };
type LeaveRequest = { id: string; leave_type: string; start_date: string; end_date: string; total_days: number; reason: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null };
type PayrollEntry = { id: string; payroll_period_id: string; approved_hours: number | null; hourly_rate: number | null; gross_amount: number | null; status: string; notes: string | null };
type Task = { id: string; category: string; title: string; description: string | null; required: boolean; status: string; acknowledgement_required: boolean; acknowledged_at: string | null; completed_at: string | null; notes: string | null };
type Audit = { id: string; entity_type: string | null; entity_id: string | null; event_type: string; actor: string | null; details: Record<string, unknown> | null; created_at: string };

type Placement = { id:string; version:number; training_location:string|null; principal_work_location:string; hourly_rate:number; weekly_hours:number; effective_from:string; status:string; contract_document_id:string|null; issued_at:string|null; issued_by:string|null };
type PlacementPayload = { placement:Placement|null; latestRotaRequest:any|null };

type OperationalState = {
  level: 'clear' | 'active' | 'attention' | 'blocked';
  status: string;
  label: string;
  detail: string;
  counts: { upcomingAssignments: number; pendingTimesheets: number; rejectedTimesheets: number; pendingLeave: number; openPayrollEntries: number };
};

type StaffPayload = {
  staff: Staff;
  application: { id: string; status: string | null } | null;
  compliance: ComplianceSnapshot;
  documents: Document[];
  assignments: Assignment[];
  timesheets: Timesheet[];
  leaveRequests: LeaveRequest[];
  payrollEntries: PayrollEntry[];
  onboarding: { package: Record<string, unknown>; tasks: Task[] } | null;
  audit: Audit[];
  availability: any | null;
  documentsSummary: { total: number; signaturePending: number; latestIssuedAt: string | null };
  operationalState: OperationalState;
};

function dateTime(value: string | null) { return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set'; }
function dateOnly(value: string | null) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString([], { dateStyle: 'medium' }) : 'Not set'; }
function badge(status: string) { return { padding: '6px 9px', borderRadius: 999, background: 'var(--soft)', fontSize: 12, fontWeight: 800 } as const; }

export default function StaffRecordPage({ params }: { params: Promise<{ staffId: string }> }) {
  const [staffId, setStaffId] = useState('');
  const [data, setData] = useState<StaffPayload | null>(null);
  const [tab, setTab] = useState<Tab>('Identity');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const [placement, setPlacement] = useState<Placement|null>(null);
  const [latestRotaRequest, setLatestRotaRequest] = useState<any|null>(null);
  const [placementWorkLocation, setPlacementWorkLocation] = useState('');
  const [placementTrainingLocation, setPlacementTrainingLocation] = useState('');
  const [placementEffectiveFrom, setPlacementEffectiveFrom] = useState('');
  const [placementWeeklyHours, setPlacementWeeklyHours] = useState('37.5');
  const [placementHourlyRate, setPlacementHourlyRate] = useState('');

  const [showEditDetails, setShowEditDetails] = useState(false);
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [editRtwPathway, setEditRtwPathway] = useState<'uk' | 'overseas' | 'sponsorship' | 'unknown'>('unknown');

  const [showIssueDoc, setShowIssueDoc] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('compliance');
  const [docContent, setDocContent] = useState('');
  const [docRequiresSig, setDocRequiresSig] = useState(false);

  useEffect(() => { params.then(({ staffId: id }) => setStaffId(id)); }, [params]);

  async function load() {
    if (!staffId) return;
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/workforce/staff/${encodeURIComponent(staffId)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load staff record.');
      setData(body);
      setPhotoFailed(false);
      setEditJobTitle(body.staff.job_title || '');
      setEditLocation(body.staff.location || '');
      setEditManagerId(body.staff.manager_id || '');
      setEditRtwPathway(body.staff.right_to_work_pathway || 'unknown');
      const placementResponse = await fetch(`/api/admin/workforce/staff/${encodeURIComponent(staffId)}/placement`, { cache: 'no-store' });
      if (placementResponse.ok) {
        const placementBody = await placementResponse.json();
        setPlacement(placementBody.placement || null);
        setLatestRotaRequest(placementBody.latestRotaRequest || null);
        setPlacementWorkLocation(placementBody.placement?.principal_work_location || body.staff.location || '');
        setPlacementTrainingLocation(placementBody.placement?.training_location || placementBody.latestRotaRequest?.preferred_training_location || '');
        setPlacementEffectiveFrom(placementBody.placement?.effective_from || new Date().toISOString().slice(0,10));
        setPlacementWeeklyHours(String(placementBody.placement?.weekly_hours || '37.5'));
        setPlacementHourlyRate(placementBody.placement?.hourly_rate != null ? String(placementBody.placement.hourly_rate) : '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load staff record.');
    }
  }

  useEffect(() => { void load(); }, [staffId]);

  async function performHrAction(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/workforce/staff/${encodeURIComponent(staffId)}/hr-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'HR action failed.');
      await load();
      setShowEditDetails(false);
      setShowIssueDoc(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'HR action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function reissueActivation() {
    const reason = window.prompt(`Why are you issuing a new staff activation link for ${data?.staff.full_name || 'this staff member'}?`)?.trim() || '';
    if (reason.length < 5) {
      setError('A reason of at least 5 characters is required for activation recovery.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/workforce/staff/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId, action: 'reissue_activation', reason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to issue the staff activation link.');
      await load();
      setNotice(`Staff activation link issued for ${data?.staff.full_name || 'the staff member'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to issue the staff activation link.');
    } finally {
      setBusy(false);
    }
  }

  async function markApplicationHired() {
    if (!data?.application?.id || data.application.status !== 'Onboarding') return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/applications/hire?id=${encodeURIComponent(data.application.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to complete the Hired transition.');
      await load();
      setNotice(
        body.activation?.status === 'already_activated'
          ? 'Candidate is now Hired and the previously activated Staff Portal account has been promoted to active employment.'
          : 'Candidate is now Hired and the Staff Portal employment package is ready.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete the Hired transition.');
    } finally {
      setBusy(false);
    }
  }

  async function patchStaffStatus(employmentStatus: string, endDate?: string) {
    if (!data) return;
    const reason = window.prompt(`Reason for updating employment status to ${employmentStatus}?`) || '';
    if (!reason.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/workforce/staff/${encodeURIComponent(staffId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employmentStatus, endDate, note: reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update staff status.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update staff status.');
    } finally {
      setBusy(false);
    }
  }

  async function issueFinalPlacementContract() {
    if (!placementWorkLocation.trim() || !placementEffectiveFrom || !placementHourlyRate.trim() || !placementWeeklyHours.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/workforce/staff/${encodeURIComponent(staffId)}/placement`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          principalWorkLocation: placementWorkLocation.trim(),
          trainingLocation: placementTrainingLocation || null,
          effectiveFrom: placementEffectiveFrom,
          weeklyHours: Number(placementWeeklyHours),
          hourlyRate: Number(placementHourlyRate),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to issue the final assignment contract.');
      await load();
      setNotice('Final assignment contract issued. The staff member can now review and sign it in Documents.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to issue the final assignment contract.');
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(id: string, status: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/onboarding/tasks?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update onboarding task.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update onboarding task.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="wrap" style={{ padding: '36px 0 80px', maxWidth: 1120 }}>
        <Link href="/admin/workforce" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Workforce directory</Link>
        <h1 style={{ marginTop: 16 }}>HR Staff Record</h1>
        {error ? <div role="alert" className="card" style={{ padding: 16, marginTop: 18 }}>{error}</div> : <div className="card" style={{ padding: 20, marginTop: 18 }}>Loading HR staff record…</div>}
      </main>
    );
  }

  const s = data.staff;
  const c = data.compliance;
  const activationLinkActive = Boolean(
    s.employment_status === 'pending' &&
    s.activation_expires_at &&
    new Date(s.activation_expires_at).getTime() > Date.now()
  );

  return (
    <main className="wrap" style={{ padding: '30px 0 80px', maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden', background: 'var(--soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {s.profile_photo_url && !photoFailed ? (
              <img src={s.profile_photo_url} alt="Staff photograph" onError={() => setPhotoFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontWeight: 900, color: 'var(--ink)', fontSize: 24 }}>
                {s.full_name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <Link href="/admin/workforce" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Workforce directory</Link>
            <p style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.08em', margin: '12px 0 4px' }}>HR AUTHORITATIVE STAFF RECORD</p>
            <h1 style={{ fontSize: 40, margin: '0 0 4px' }}>{s.full_name}</h1>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              {s.employee_number} {s.laurem_id ? `(${s.laurem_id})` : ''} · {s.job_title} · {s.location || 'Location not set'} · Pathway: {s.employment_pathway}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            padding: '7px 11px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 900,
            background: c.overallStatus === 'Current' ? '#e8f7ee' : c.overallStatus === 'Expiring Soon' ? '#fff4e5' : '#fdecec',
            color: c.overallStatus === 'Current' ? '#166534' : c.overallStatus === 'Expiring Soon' ? '#9a3412' : '#991b1b',
          }}>
            Compliance: {c.overallStatus}
          </span>
          <span style={badge(s.employment_status)}>{s.employment_status}</span>

          <button onClick={() => setShowEditDetails(!showEditDetails)} style={buttonSecondary}>Edit Employment</button>
          <button onClick={() => setShowIssueDoc(!showIssueDoc)} style={buttonSecondary}>Issue Document</button>

          {s.employment_status === 'pending' && <span style={{ ...badge('pending'), color: '#1f4f73' }}>Portal activation pending</span>}
          {s.employment_status === 'active' && (
            <>
              <button disabled={busy} onClick={() => void patchStaffStatus('suspended')} style={buttonSecondary}>Suspend</button>
              <button disabled={busy} onClick={() => void patchStaffStatus('leaver', new Date().toISOString().slice(0, 10))} style={buttonSecondary}>Mark Leaver</button>
            </>
          )}
          {s.employment_status === 'suspended' && <button disabled={busy} onClick={() => void patchStaffStatus('active')} style={buttonPrimary}>Reactivate</button>}
        </div>
      </div>

      {error && <div role="alert" className="card" style={{ padding: 14, marginTop: 16, color: '#8a2323' }}>{error}</div>}
      {notice && <div role="status" className="card" style={{ padding: 14, marginTop: 16, color: '#176b4f' }}>{notice}</div>}
      {s.employment_status === 'pending' && (
        <section className="card" style={{ padding: 16, marginTop: 16, background: '#f7fbff', border: '1px solid #cfe3f5' }}>
          <strong style={{ color: '#1f4f73' }}>STAFF PORTAL ACTIVATION REQUIRED</strong>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
            Pending staff accounts become active through the one-time staff portal activation flow. Employment status cannot be manually changed to active before the staff member completes that activation.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <Link href="/admin/workforce/staff-account" style={buttonSecondary}>Manage Staff Account</Link>
            {activationLinkActive
              ? <span style={{ color: '#176b4f', fontSize: 12, fontWeight: 800 }}>Activation link is currently active.</span>
              : <button disabled={busy} onClick={() => void reissueActivation()} style={buttonPrimary}>{busy ? 'Issuing…' : 'Issue / Reissue Activation'}</button>}
          </div>
        </section>
      )}

      {showEditDetails && (
        <section className="card" style={{ padding: 20, marginTop: 18, background: '#fafafa' }}>
          <h2 style={{ marginTop: 0 }}>Edit Authoritative Employment Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Job Title
              <input value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Work Location
              <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Manager ID / Staff ID
              <input value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)} placeholder="UUID of manager..." style={{ width: '100%', marginTop: 4, padding: 8, border: '1px solid var(--line)', borderRadius: 6 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button disabled={busy} onClick={() => void performHrAction('update_details', { jobTitle: editJobTitle, location: editLocation, managerId: editManagerId })} style={buttonPrimary}>Save Changes</button>
            <button onClick={() => setShowEditDetails(false)} style={buttonSecondary}>Cancel</button>
          </div>
        </section>
      )}

      {showIssueDoc && (
        <section className="card" style={{ padding: 20, marginTop: 18, background: '#fafafa' }}>
          <h2 style={{ marginTop: 0 }}>Issue Official Workforce Document</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Document Title (e.g. Staff Policy Addendum)" style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 6 }} />
            <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 6 }}>
              <option value="compliance">Compliance</option>
              <option value="policy">Policy</option>
              <option value="contract">Contract</option>
              <option value="job_description">Job Description</option>
              <option value="handbook">Handbook</option>
            </select>
            <textarea value={docContent} onChange={(e) => setDocContent(e.target.value)} placeholder="Document body text or contents..." rows={4} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 6 }} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={docRequiresSig} onChange={(e) => setDocRequiresSig(e.target.checked)} />
              Require electronic signature from employee
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button disabled={busy} onClick={() => void performHrAction('issue_document', { title: docTitle, category: docCategory, contentText: docContent, requiresSignature: docRequiresSig })} style={buttonPrimary}>Issue Document</button>
            <button onClick={() => setShowIssueDoc(false)} style={buttonSecondary}>Cancel</button>
          </div>
        </section>
      )}

      <section className="card" style={{ padding: 6, marginTop: 20, overflowX: 'auto' }}>
        <nav style={{ display: 'flex', minWidth: 'max-content' }}>
          {tabs.map((item) => (
            <button key={item} onClick={() => setTab(item)} style={{ ...tabButton, background: tab === item ? 'var(--ink)' : 'transparent', color: tab === item ? 'white' : 'var(--ink)' }}>
              {item}
            </button>
          ))}
        </nav>
      </section>

      {tab === 'Identity' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 20 }}>
          <article className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Employee Identity</h2>
            <dl style={{ margin: 0 }}>
              <Row label="Full Name" value={s.full_name} />
              <Row label="Email" value={s.email} />
              <Row label="Phone" value={s.phone || 'Not recorded'} />
              <Row label="Address" value={[s.address_line_1, s.address_line_2, s.city, s.county, s.postcode, s.country].filter(Boolean).join(', ') || 'Not recorded'} />
            </dl>
          </article>

          <article className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Emergency Contact</h2>
            <dl style={{ margin: 0 }}>
              <Row label="Contact Name" value={s.emergency_contact_name || 'Not set'} />
              <Row label="Phone Number" value={s.emergency_contact_phone || 'Not set'} />
              <Row label="Relationship" value={s.emergency_contact_relationship || 'Not set'} />
            </dl>
          </article>
        </section>
      )}

      {tab === 'Employment' && (
        <section style={{ display: 'grid', gap: 16, marginTop: 20 }}>
          <article className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Authoritative Employment Record</h2>
            <dl style={{ margin: 0 }}>
              <Row label="Employee Number" value={s.employee_number} />
              <Row label="CONAGS ID" value={s.laurem_id || 'Not assigned'} />
              <Row label="Job Title" value={s.job_title} />
              <Row label="Employment Status" value={s.employment_status} />
              <Row label="Pathway" value={s.employment_pathway} />
              <Row label="Work Location" value={s.location || 'Location not set'} />
              <Row label="Line Manager" value={s.manager ? `${s.manager.full_name} (${s.manager.job_title})` : 'Unassigned'} />
              <Row label="Start Date" value={dateOnly(s.start_date)} />
              <Row label="End Date" value={dateOnly(s.end_date)} />
            </dl>
          </article>

          <article className="card" style={{ padding: 20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:16, flexWrap:'wrap', alignItems:'start' }}>
              <div>
                <div style={{ color:'var(--accent)', fontWeight:900, letterSpacing:'.07em', fontSize:12 }}>PLACEMENT & FINAL TERMS</div>
                <h2 style={{ margin:'6px 0' }}>Final assignment contract</h2>
                <p style={{ margin:0, color:'var(--muted)', maxWidth:760, lineHeight:1.6 }}>
                  The original accepted employment contract remains unchanged. Use this workflow to record the actual assignment-specific pay and principal work location after the staff member completes their portal preferences.
                </p>
              </div>
              {placement?.status === 'issued' && <span style={{ ...badge('issued'), color:'#176b4f', background:'#e8f7ee' }}>Issued · v{placement.version}</span>}
            </div>

            <div style={{ marginTop:16, padding:14, borderRadius:10, background:'#f7fafc', border:'1px solid var(--line)' }}>
              <strong>Staff Portal preference</strong>
              {latestRotaRequest ? (
                <div style={{ marginTop:7, color:'var(--muted)', fontSize:13, lineHeight:1.6 }}>
                  Status: {String(latestRotaRequest.status).replaceAll('_',' ')}
                  {' · '}
                  Training: {latestRotaRequest.preferred_training_location || 'Not selected'}
                  {' · '}
                  Regions: {Array.isArray(latestRotaRequest.regions) && latestRotaRequest.regions.length ? latestRotaRequest.regions.join(', ') : 'None selected'}
                </div>
              ) : (
                <div style={{ marginTop:7, color:'#9a3412', fontSize:13 }}>No work-preference request has been submitted yet. Ask the staff member to complete Work Preferences in the Staff Portal.</div>
              )}
            </div>

            {placement?.status === 'issued' && (
              <div style={{ marginTop:14, padding:14, borderRadius:10, background:'#f8fffc', border:'1px solid #b7ead0' }}>
                <strong>Current issued terms</strong>
                <div style={{ marginTop:6, color:'var(--muted)', fontSize:13 }}>
                  £{Number(placement.hourly_rate).toFixed(2)}/hour · {Number(placement.weekly_hours).toFixed(2)} hours/week · {placement.principal_work_location}
                  {' · Effective '}
                  {dateOnly(placement.effective_from)}
                </div>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginTop:16 }}>
              <label style={{ fontSize:13, fontWeight:800 }}>
                Confirmed principal work location
                <input value={placementWorkLocation} onChange={e=>setPlacementWorkLocation(e.target.value)} placeholder="Client/site/area or confirmed address" style={{ display:'block', width:'100%', marginTop:5, padding:10, border:'1px solid var(--line)', borderRadius:8, fontWeight:500 }} />
              </label>
              <label style={{ fontSize:13, fontWeight:800 }}>
                Mandatory training location
                <select value={placementTrainingLocation} onChange={e=>setPlacementTrainingLocation(e.target.value)} style={{ display:'block', width:'100%', marginTop:5, padding:10, border:'1px solid var(--line)', borderRadius:8, fontWeight:500 }}>
                  <option value="">Not recorded</option>
                  <option>Birmingham</option><option>London</option><option>Glasgow</option><option>Manchester</option>
                </select>
              </label>
              <label style={{ fontSize:13, fontWeight:800 }}>
                Effective from
                <input type="date" value={placementEffectiveFrom} onChange={e=>setPlacementEffectiveFrom(e.target.value)} style={{ display:'block', width:'100%', marginTop:5, padding:10, border:'1px solid var(--line)', borderRadius:8, fontWeight:500 }} />
              </label>
              <label style={{ fontSize:13, fontWeight:800 }}>
                Guaranteed weekly hours
                <input type="number" min="0.01" max="84" step="0.01" value={placementWeeklyHours} onChange={e=>setPlacementWeeklyHours(e.target.value)} style={{ display:'block', width:'100%', marginTop:5, padding:10, border:'1px solid var(--line)', borderRadius:8, fontWeight:500 }} />
              </label>
              <label style={{ fontSize:13, fontWeight:800 }}>
                Basic hourly rate (£)
                <input type="number" min="0.01" max="1000" step="0.01" value={placementHourlyRate} onChange={e=>setPlacementHourlyRate(e.target.value)} placeholder="Enter approved rate" style={{ display:'block', width:'100%', marginTop:5, padding:10, border:'1px solid var(--line)', borderRadius:8, fontWeight:500 }} />
              </label>
            </div>

            <div style={{ marginTop:12, color:'var(--muted)', fontSize:12, lineHeight:1.55 }}>
              Only issue this document after confirming the actual placement and approved rate. A preferred location is not itself a guaranteed placement. A new issue creates a new version and supersedes the previous final assignment contract while preserving document history.
            </div>
            <button disabled={busy || !placementWorkLocation.trim() || !placementEffectiveFrom || !placementWeeklyHours || !placementHourlyRate} onClick={()=>void issueFinalPlacementContract()} style={{ ...buttonPrimary, marginTop:14 }}>
              {busy ? 'Issuing…' : placement?.status === 'issued' ? 'Issue updated final contract' : 'Issue final assignment contract'}
            </button>
          </article>
        </section>
      )}

      {tab === 'Compliance' && (
        <section style={{ display: 'grid', gap: 16, marginTop: 20 }}>
          <article className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Compliance Verification Summary</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <Check label="Right to Work Pathway" value={c.rightToWork.pathway !== 'unknown'} detail={c.rightToWork.pathway === 'unknown' ? 'Pathway is not recorded authoritatively.' : `Recorded pathway: ${c.rightToWork.pathway}`} />
              <Check label="Right to Work Verified" value={c.rightToWork.verified && c.rightToWork.pathway !== 'unknown'} detail={c.rightToWork.detail} />
              <Check label="DBS/PVG Check Verified" value={c.dbsPvg.verified} detail={c.dbsPvg.detail} />
              {c.nmcRegistration.isNurse && (
                <Check label="NMC Nurse Registration" value={c.nmcRegistration.registrationState === 'fully_registered'} detail={`${c.nmcRegistration.detail} (PIN: ${c.nmcRegistration.nmcNumber || 'N/A'})`} />
              )}
            </div>

            {c.attentionItems.length > 0 && (
              <div style={{ marginTop: 18, padding: 14, background: '#fff4e5', border: '1px solid #fed7aa', borderRadius: 8 }}>
                <strong style={{ color: '#9a3412' }}>Compliance Attention Required:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#9a3412', fontSize: 13 }}>
                  {c.attentionItems.map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
            )}

            {c.complianceFollowUps.length > 0 && (
              <div style={{ marginTop: 18, padding: 14, background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 8 }}>
                <strong>Non-blocking compliance follow-up:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--muted)', fontSize: 13 }}>
                  {c.complianceFollowUps.map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
                <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
                  These items remain visible for HR action but do not block contract issuance, Hired status, portal provisioning, or staff activation.
                </div>
              </div>
            )}

            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ marginTop: 0 }}>Authoritative Right-to-Work Record</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 10, alignItems: 'end' }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Pathway
                  <select value={editRtwPathway} onChange={(e) => setEditRtwPathway(e.target.value as typeof editRtwPathway)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 9, border: '1px solid var(--line)', borderRadius: 6 }}>
                    <option value="unknown">Not recorded</option>
                    <option value="uk">UK / unrestricted</option>
                    <option value="overseas">Overseas</option>
                    <option value="sponsorship">Sponsorship</option>
                  </select>
                </label>
                <button disabled={busy} onClick={() => void performHrAction('update_compliance', { rightToWorkPathway: editRtwPathway })} style={buttonPrimary}>Save Pathway</button>
              </div>
            </div>
          </article>
        </section>
      )}

      {tab === 'Documents' && (
        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2>Authoritative Workforce Documents</h2>
            <button onClick={() => setShowIssueDoc(true)} style={buttonPrimary}>Issue New Document</button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {data.documents.map((doc) => (
              <article key={doc.id} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong>{doc.title}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                    Category: {doc.category} · Issued {dateTime(doc.issued_at)}
                    {doc.signed_at && ` · Signed by ${doc.signature_name} on ${dateTime(doc.signed_at)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={badge(doc.status === 'issued' ? (doc.requires_signature && doc.signature_status === 'pending' ? 'awaiting signature' : 'active') : doc.status)}>
                    {doc.status === 'issued' ? (doc.requires_signature && doc.signature_status === 'pending' ? 'Awaiting signature' : 'Active') : doc.status}
                  </span>
                </div>
              </article>
            ))}
            {!data.documents.length && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>No official workforce documents issued yet.</div>}
          </div>
        </section>
      )}

      {tab === 'Onboarding' && (
        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0 }}>Onboarding Package & Progress</h2><p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>Complete the staff onboarding tasks here. The Hired transition remains governed by the same contract, readiness and staff-identity gates.</p></div>
            {data.application?.status === 'Onboarding' && (
              <button
                disabled={busy}
                onClick={() => void markApplicationHired()}
                style={buttonPrimary}
              >
                {busy ? 'Processing…' : 'Mark Hired'}
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data.onboarding?.tasks || []).map((task) => (
              <article key={task.id} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>{task.category.toUpperCase()}</span>
                  <h3 style={{ margin: '4px 0' }}>{task.title}</h3>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{task.description}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={badge(task.status)}>{task.status}</span>
                  {task.status !== 'completed' && <button disabled={busy} onClick={() => void updateTask(task.id, 'completed')} style={buttonPrimary}>Complete</button>}
                  {task.status === 'completed' && <button disabled={busy} onClick={() => void updateTask(task.id, 'pending')} style={buttonSecondary}>Reopen</button>}
                </div>
              </article>
            ))}
            {!data.onboarding?.tasks?.length && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>No onboarding tasks found for this staff member.</div>}
          </div>
        </section>
      )}

      {tab === 'Audit' && (
        <section style={{ marginTop: 20 }}>
          <h2>Staff Audit Trail</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {data.audit.map((event) => (
              <article key={event.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{event.event_type}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{dateTime(event.created_at)}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Actor: {event.actor || 'System'}</div>
                {event.details && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '8px 0 0', color: 'var(--muted)', background: '#fafafa', padding: 8, borderRadius: 6 }}>{JSON.stringify(event.details, null, 2)}</pre>}
              </article>
            ))}
            {!data.audit.length && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>No audit events recorded yet.</div>}
          </div>
        </section>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <dt style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );
}

function Check({ label, value, detail }: { label: string; value: boolean; detail?: string }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{label}</span>
        <strong style={{ color: value ? '#166534' : '#991b1b' }}>{value ? 'Verified / Cleared' : 'Outstanding / Pending'}</strong>
      </div>
      {detail && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{detail}</div>}
    </div>
  );
}

const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '8px 12px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
const buttonSecondary = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
const tabButton = { border: 0, padding: '10px 14px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
