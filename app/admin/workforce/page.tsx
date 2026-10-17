'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LAUREM_TRAINING_LOCATIONS } from '@/lib/laurem-staff-operations';

type Manager = { id: string; full_name: string; job_title: string };
type ComplianceSnapshot = {
  overallStatus: 'Current' | 'Expiring Soon' | 'Expired' | 'Missing' | 'Under Review';
  attentionItems: string[];
};

type Staff = {
  id: string;
  employee_number: string;
  laurem_id: string | null;
  full_name: string;
  email: string;
  job_title: string;
  employment_status: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  manager: Manager | null;
  compliance: ComplianceSnapshot;
};

type Assignment = {
  id: string;
  staff_id: string;
  client_name: string | null;
  location: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  notes: string | null;
  staff_profiles?: { employee_number: string; full_name: string; email: string; job_title: string; employment_status: string };
};

type Timesheet = {
  id: string;
  work_date: string;
  total_hours: number | null;
  status: string;
  staff_profiles?: { employee_number: string; full_name: string; job_title: string };
};

type LeaveRequest = {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  reason: string | null;
  staff_profiles?: { employee_number: string; full_name: string; job_title: string };
};

type WorkforceReadiness = {
  summary: { totalStaff: number; activeStaff: number; ready: number; attention: number; blocked: number; latestPayrollPeriod: any | null; generatedAt: string };
  staff: { id: string; full_name: string; employee_number: string; job_title: string; readiness: { overall: 'ready' | 'attention' | 'blocked'; nextAction: string | null } }[];
};
type VisaRequest = { id:string; staff_id:string; pathway:string; status:string; requested_at:string; staff:any; invoice:any; cosDocument:any };

function londonInput(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day + 'T' + values.hour + ':' + values.minute;
}

function londonLocalToIso(value: string) {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const londonParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(localAsUtc);
  const values = Object.fromEntries(londonParts.map((part) => [part.type, part.value]));
  const projectedUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
  );
  const offsetMs = projectedUtc - localAsUtc.getTime();
  const instant = new Date(localAsUtc.getTime() - offsetMs);
  const check = londonInput(instant);
  if (check !== value) return null;
  return instant.toISOString();
}

export default function WorkforcePage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState('');
  const [workforceReadiness, setWorkforceReadiness] = useState<WorkforceReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [visaRequests, setVisaRequests] = useState<VisaRequest[]>([]);
  const [visaCounts, setVisaCounts] = useState({newRequests:0,processing:0,active:0});
  const [rotaRequests, setRotaRequests] = useState<any[]>([]);
  const [rotaCounts, setRotaCounts] = useState({requested:0,underReview:0,approved:0});
  const [trainingAssignments, setTrainingAssignments] = useState<any[]>([]);
  const [complianceRequests, setComplianceRequests] = useState<any[]>([]);
  const [complianceCounts, setComplianceCounts] = useState({open:0,unpaid:0,paid:0});
  const [trainingWeekStart, setTrainingWeekStart] = useState('');
  const [trainingLocation, setTrainingLocation] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [complianceFilter, setComplianceFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedStaff, setSelectedStaff] = useState('');
  const [trainingStaffId, setTrainingStaffId] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledStart, setScheduledStart] = useState(londonInput(new Date()));
  const [scheduledEnd, setScheduledEnd] = useState(londonInput(new Date(Date.now() + 4 * 3600000)));

  async function load(page = currentPage) {
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('q', searchTerm);
      if (statusFilter) params.set('status', statusFilter);
      if (complianceFilter) params.set('complianceState', complianceFilter);
      if (locationFilter) params.set('location', locationFilter);
      params.set('page', String(page));
      params.set('limit', '50');

      const [s, a, t, l, r, v, rr, tr, c] = await Promise.all([
        fetch(`/api/admin/workforce/staff?${params.toString()}`, { cache: 'no-store' }),
        fetch('/api/admin/workforce/assignments', { cache: 'no-store' }),
        fetch('/api/admin/workforce/timesheets', { cache: 'no-store' }),
        fetch('/api/admin/workforce/leave', { cache: 'no-store' }),
        fetch('/api/admin/workforce/readiness', { cache: 'no-store' }),
        fetch('/api/admin/workforce/visa-requests', { cache: 'no-store' }),
        fetch('/api/admin/workforce/rota-requests', { cache: 'no-store' }),
        fetch('/api/admin/workforce/training', { cache: 'no-store' }),
        fetch('/api/admin/workforce/compliance-requests', { cache: 'no-store' }),
      ]);

      const [sp, ap, tp, lp, rp, vp, rta, trp, cp] = await Promise.all([s.json(), a.json(), t.json(), l.json(), r.json(), v.json(), rr.json(), tr.json(), c.json()]);

      if (!s.ok || !a.ok || !t.ok || !l.ok) {
        throw new Error(sp.error || ap.error || tp.error || lp.error || 'Unable to load workforce data.');
      }

      setStaffList(sp.staff || []);
      if (sp.pagination) setPagination(sp.pagination);
      setAssignments(ap.assignments || []);
      setTimesheets(tp.timesheets || []);
      setLeave(lp.requests || lp.leaveRequests || []);
      setWorkforceReadiness(r.ok ? rp : null);
      setVisaRequests(v.ok ? (vp.requests || []) : []);
      setVisaCounts(v.ok ? (vp.counts || {newRequests:0,processing:0,active:0}) : {newRequests:0,processing:0,active:0});
      setRotaRequests(rr.ok ? (rta.requests || []) : []);
      setRotaCounts(rr.ok ? (rta.counts || {requested:0,underReview:0,approved:0}) : {requested:0,underReview:0,approved:0});
      setTrainingAssignments(tr.ok ? (trp.assignments || []) : []);
      setComplianceRequests(c.ok ? (cp.requests || []) : []);
      setComplianceCounts(c.ok ? (cp.counts || {open:0,unpaid:0,paid:0}) : {open:0,unpaid:0,paid:0});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load workforce data.');
    }
  }

  useEffect(() => {
    void load(currentPage);
  }, [currentPage, statusFilter, complianceFilter, locationFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCurrentPage(1);
    void load(1);
  }

  const activeStaff = useMemo(() => staffList.filter((s) => s.employment_status === 'active'), [staffList]);

  async function updateStaffStatus(id: string, employmentStatus: string, endDate?: string, note?: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/workforce/staff?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employmentStatus, endDate, note }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error || 'Unable to update staff status.');
      await load(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update staff status.');
    } finally {
      setBusy(false);
    }
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStaff) return;
    const scheduledStartIso = londonLocalToIso(scheduledStart);
    const scheduledEndIso = londonLocalToIso(scheduledEnd);
    if (!scheduledStartIso || !scheduledEndIso || new Date(scheduledEndIso).getTime() <= new Date(scheduledStartIso).getTime()) {
      setError('Enter valid UK time values for the shift, with the end after the start.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/admin/workforce/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: selectedStaff,
          clientName,
          location,
          scheduledStart: londonLocalToIso(scheduledStart),
          scheduledEnd: londonLocalToIso(scheduledEnd),
        }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error || 'Unable to create assignment.');
      setClientName('');
      setLocation('');
      await load(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create assignment.');
    } finally {
      setBusy(false);
    }
  }

  async function patch(path: string, id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${path}?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error || 'Update failed.');
      await load(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function scheduleTraining(e: React.FormEvent) {
    e.preventDefault();
    if (!trainingStaffId || !trainingWeekStart || !trainingLocation) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/workforce/training', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({staffId:trainingStaffId,weekStart:trainingWeekStart,location:trainingLocation,status:'scheduled'}) });
      const p = await r.json(); if (!r.ok) throw new Error(p.error || 'Unable to schedule training.');
      setTrainingWeekStart(''); setTrainingLocation(''); await load(currentPage);
    } catch(e) { setError(e instanceof Error ? e.message : 'Unable to schedule training.'); }
    finally { setBusy(false); }
  }

  const pendingTimesheets = timesheets.filter((t) => t.status === 'submitted');
  const pendingLeave = leave.filter((l) => l.status === 'pending');

  return (
    <main className="wrap" style={{ padding: '36px 0 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <Link href="/admin" style={{ textDecoration: 'none', color: 'var(--muted)' }}>← Recruitment workspace</Link>
          <h1 style={{ fontSize: 40, margin: '8px 0' }}>Workforce administration</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>Authorised workforce register, staff compliance, shift assignments & approvals.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/admin/workforce/compliance" style={navButton}>Compliance Dashboard</Link>
          <Link href="/admin/workforce/documents" style={navButton}>Document Administration</Link>
          <Link href="/admin/workforce/schedule" style={navButton}>Weekly schedule</Link>
          <Link href="/admin/workforce/reports" style={navButton}>Reports</Link>
          <Link href="/admin/workforce/staff-account" style={navButton}>Account lifecycle</Link>
          <span style={{ padding: '8px 11px', borderRadius: 999, background: 'var(--soft)', fontWeight: 800, fontSize: 12 }}>
            {pagination.total} Total Staff
          </span>
        </div>
      </div>

      {error && <div role="alert" className="card" style={{ marginTop: 18, padding: 14, color: '#8a2323' }}>{error}</div>}

      {workforceReadiness && (
        <section style={{ marginTop: 24 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--accent)' }}>WORKFORCE ACCEPTANCE</div>
                <h2 style={{ margin: '6px 0 4px' }}>Operational readiness</h2>
                <div style={{ color: 'var(--muted)' }}>One view of assignment, attendance, timesheet, leave and payroll exceptions.</div>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ padding: '7px 10px', borderRadius: 999, background: '#e8f7ee', color: '#166534', fontSize: 12, fontWeight: 800 }}>{workforceReadiness.summary.ready} ready</span>
                <span style={{ padding: '7px 10px', borderRadius: 999, background: '#fff4e5', color: '#9a3412', fontSize: 12, fontWeight: 800 }}>{workforceReadiness.summary.attention} attention</span>
                <span style={{ padding: '7px 10px', borderRadius: 999, background: '#fdecec', color: '#991b1b', fontSize: 12, fontWeight: 800 }}>{workforceReadiness.summary.blocked} blocked</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 24 }}>
        <article className="card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Create assignment</h2>
          <form onSubmit={addAssignment} style={{ display: 'grid', gap: 10 }}>
            <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} required style={{ padding: 11, border: '1px solid var(--line)', borderRadius: 9 }}>
              <option value="">Select active staff</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} · {s.job_title}</option>
              ))}
            </select>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client / service user (optional)" style={{ padding: 11, border: '1px solid var(--line)', borderRadius: 9 }} />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" required style={{ padding: 11, border: '1px solid var(--line)', borderRadius: 9 }} />
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>
              Start
              <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} required style={{ width: '100%', marginTop: 4, padding: 10, border: '1px solid var(--line)', borderRadius: 9 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>
              End
              <input type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} required style={{ width: '100%', marginTop: 4, padding: 10, border: '1px solid var(--line)', borderRadius: 9 }} />
            </label>
            <button disabled={busy} style={{ padding: 11, border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', background: 'var(--ink)', color: 'white' }}>Schedule shift</button>
          </form>
        </article>

        <article className="card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Approval queue</h2>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{pendingTimesheets.length}</div>
          <div style={{ color: 'var(--muted)' }}>timesheets awaiting review</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 16 }}>{pendingLeave.length}</div>
          <div style={{ color: 'var(--muted)' }}>leave requests awaiting review</div>
        </article>
      </section>

      <section style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2>Workforce directory</h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Showing page {pagination.page} of {pagination.totalPages}</span>
        </div>

        <form onSubmit={handleSearchSubmit} className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, employee # or CONAGS ID..."
            style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}
          />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}>
            <option value="">All Employment Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="leaver">Leaver</option>
          </select>
          <select value={complianceFilter} onChange={(e) => { setComplianceFilter(e.target.value); setCurrentPage(1); }} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}>
            <option value="">All Compliance States</option>
            <option value="Current">Current</option>
            <option value="Expiring Soon">Expiring Soon</option>
            <option value="Expired">Expired</option>
            <option value="Missing">Missing</option>
            <option value="Under Review">Under Review</option>
          </select>
          <input
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            placeholder="Filter location..."
            style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}
          />
          <button type="submit" style={{ padding: 10, background: 'var(--ink)', color: 'white', border: 0, borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>Search</button>
        </form>

        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {staffList.map((s) => (
            <article className="card" key={s.id} style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <Link href={`/admin/workforce/${encodeURIComponent(s.id)}`} style={{ fontSize: 17, fontWeight: 850, color: 'var(--ink)', textDecoration: 'none' }}>
                  {s.full_name}
                </Link>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                  {s.employee_number} {s.laurem_id ? `(${s.laurem_id})` : ''} · {s.job_title} · {s.location || 'Location not set'}
                  {s.manager && ` · Manager: ${s.manager.full_name}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 800,
                  background: s.compliance.overallStatus === 'Current' ? '#e8f7ee' : s.compliance.overallStatus === 'Expiring Soon' ? '#fff4e5' : '#fdecec',
                  color: s.compliance.overallStatus === 'Current' ? '#166534' : s.compliance.overallStatus === 'Expiring Soon' ? '#9a3412' : '#991b1b',
                }}>
                  {s.compliance.overallStatus}
                </span>

                <span style={{ padding: '6px 9px', borderRadius: 999, background: 'var(--soft)', fontSize: 12, fontWeight: 800 }}>
                  {s.employment_status}
                </span>

                {s.employment_status === 'pending' && (
                  <Link href="/admin/workforce/staff-account" style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, textDecoration: 'none', fontWeight: 800 }}>Manage account</Link>
                )}
                {s.employment_status === 'active' && (
                  <>
                    <button disabled={busy} onClick={() => {
                      const reason = window.prompt('Reason for suspending this staff member?')?.trim() || '';
                      if (reason) void updateStaffStatus(s.id, 'suspended', undefined, reason);
                    }} style={actionButton}>Suspend</button>
                    <button disabled={busy} onClick={() => {
                      const reason = window.prompt('Reason for marking this staff member as a leaver?')?.trim() || '';
                      if (reason) void updateStaffStatus(s.id, 'leaver', new Date().toISOString().slice(0, 10), reason);
                    }} style={actionButton}>Mark leaver</button>
                  </>
                )}
                {s.employment_status === 'suspended' && (
                  <button disabled={busy} onClick={() => {
                    const reason = window.prompt('Reason for reactivating this staff member?')?.trim() || '';
                    if (reason) void updateStaffStatus(s.id, 'active', undefined, reason);
                  }} style={actionButton}>Reactivate</button>
                )}
              </div>
            </article>
          ))}

          {!staffList.length && (
            <div className="card" style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>
              No workforce records match the current filters.
            </div>
          )}
        </div>

        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20, alignItems: 'center' }}>
            <button
              disabled={currentPage <= 1 || busy}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
            >
              Previous
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Page {pagination.page} of {pagination.totalPages}</span>
            <button
              disabled={currentPage >= pagination.totalPages || busy}
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
            >
              Next
            </button>
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Active assignments</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {assignments.map((a) => (
            <article className="card" key={a.id} style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <strong>{a.staff_profiles?.full_name || a.staff_id}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {a.location} · {a.client_name || 'No client'} · {new Date(a.scheduled_start).toLocaleString()} to {new Date(a.scheduled_end).toLocaleTimeString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <span style={{ padding: '6px 9px', borderRadius: 999, background: 'var(--soft)', fontSize: 12, fontWeight: 800 }}>{a.status}</span>
                  {a.status === 'scheduled' && (
                    <button disabled={busy} onClick={() => void patch('/api/admin/workforce/assignments', a.id, { status: 'confirmed' })}>Confirm</button>
                  )}
                  {(a.status === 'scheduled' || a.status === 'confirmed') && (
                    <button disabled={busy} onClick={() => void patch('/api/admin/workforce/assignments', a.id, { status: 'cancelled' })}>Cancel</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',flexWrap:'wrap'}}>
          <div><h2 style={{marginBottom:4}}>Visa & Sponsorship Requests</h2><p style={{color:'var(--muted)',marginTop:0}}>Staff requests for visa switch support or international sponsorship. Invoice amount, payment plan and COS status are shown here.</p></div><div style={{marginTop:8}}><Link href="/admin/workforce/visa-help" style={navButton}>Open Visa Help Queue</Link></div></div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <span style={{padding:'7px 10px',borderRadius:999,background:'var(--soft)',fontSize:12,fontWeight:800}}>New {visaCounts.newRequests}</span>
            <span style={{padding:'7px 10px',borderRadius:999,background:'var(--soft)',fontSize:12,fontWeight:800}}>Processing {visaCounts.processing}</span>
            <span style={{padding:'7px 10px',borderRadius:999,background:'var(--soft)',fontSize:12,fontWeight:800}}>Active {visaCounts.active}</span>
          </div>
        <div style={{display:'grid',gap:10,marginTop:12}}>
          {visaRequests.map((request) => {
            const userStatus = request.cosDocument && ['cos_assigned','completed'].includes(request.status)
              ? 'Active'
              : ['preparing_sms','submitted_to_sms','cos_pending'].includes(request.status)
                ? 'Processing COS'
                : 'Invoice requested';
            return <article className='card' key={request.id} style={{padding:16,display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap',alignItems:'center'}}>
              <div>
                <Link href={'/admin/workforce/'+encodeURIComponent(request.staff_id)+'/visa-sponsorship'} style={{fontSize:17,fontWeight:850,color:'var(--ink)',textDecoration:'none'}}>{request.staff?.full_name || 'Staff'}</Link>
                <div style={{color:'var(--muted)',fontSize:13,marginTop:2}}>{request.staff?.employee_number || request.staff?.laurem_id || ''} · {request.staff?.job_title || ''} · {request.pathway === 'visa_switch' ? 'Visa switch' : 'International sponsorship'}</div>
                <div style={{color:'var(--muted)',fontSize:12,marginTop:5}}>Invoice {request.invoice?.invoice_number || 'not issued'} · £{(Number(request.invoice?.amount_pence || 200000)/100).toFixed(2)} · {request.invoice?.status || 'issued'} · Requested {new Date(request.requested_at).toLocaleDateString('en-GB')}</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{padding:'7px 10px',borderRadius:999,background:userStatus==='Active'?'#e8f7ee':userStatus==='Processing COS'?'#fff4e5':'var(--soft)',color:userStatus==='Active'?'#166534':userStatus==='Processing COS'?'#9a3412':'var(--ink)',fontSize:12,fontWeight:900}}>{userStatus}</span>
                {request.cosDocument && <span style={{padding:'7px 10px',borderRadius:999,background:'#e8f7ee',color:'#166534',fontSize:12,fontWeight:900}}>COS uploaded</span>}
                <Link href={'/admin/workforce/'+encodeURIComponent(request.staff_id)+'/visa-sponsorship'} style={actionButton}>Open case</Link>
              </div>
            </article>;
          })}
          {!visaRequests.length && <div className='card' style={{padding:20,color:'var(--muted)'}}>No open visa support requests.</div>}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div><h2 style={{marginBottom:4}}>Rota requests</h2><p style={{color:'var(--muted)',marginTop:0}}>Staff preferences for regions, shifts, care settings, stable placements and driving.</p></div>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}><span className="badge">Requested {rotaCounts.requested}</span><span className="badge">Under review {rotaCounts.underReview}</span><span className="badge">Approved {rotaCounts.approved}</span></div>
        </div>
        <div style={{display:'grid',gap:9,marginTop:12}}>
          {rotaRequests.slice(0,30).map((r:any)=><article className="card" key={r.id} style={{padding:15}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><strong>{r.staff?.full_name || 'Staff'}</strong><div style={{color:'var(--muted)',fontSize:12}}>{r.staff?.job_title || ''} · Effective {r.effective_from}</div></div><span className="badge">{r.status.replaceAll('_',' ')}</span></div>
            <div style={{color:'var(--muted)',fontSize:13,marginTop:7}}>Service regions: {r.regions?.join(', ')} · Training city: {r.preferred_training_location || 'Not selected'} · Shifts: {r.shift_preferences?.join(', ')} · Settings: {r.care_settings?.join(', ')}</div>
            <div style={{color:'var(--muted)',fontSize:13,marginTop:4}}>Stable shift: {r.stable_shift_preference?'Yes':'No'} · Driver: {r.driver_available?'Available':'Not marked'}</div>
            {r.notes && <div style={{color:'var(--muted)',fontSize:12,marginTop:5}}>{r.notes}</div>}
            <div style={{display:'flex',gap:7,marginTop:9,flexWrap:'wrap'}}>{r.status==='requested' && <button disabled={busy} onClick={()=>void patch('/api/admin/workforce/rota-requests',r.id,{status:'under_review'})}>Review</button>}{['requested','under_review'].includes(r.status)&&<button disabled={busy} onClick={()=>void patch('/api/admin/workforce/rota-requests',r.id,{status:'approved',reviewNote:'Rota preference approved for workforce matching.'})}>Approve preference</button>}</div>
          </article>)}
          {!rotaRequests.length&&<div className="card" style={{padding:18,color:'var(--muted)'}}>No rota requests.</div>}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{marginBottom:4}}>Training schedule</h2><p style={{color:'var(--muted)',marginTop:0}}>Mandatory one-week training is scheduled here and appears in the staff portal. The selected staff member's preferred training city is preselected when available.</p></div></div>
        <div className="card" style={{padding:16,marginTop:12}}>
          <form onSubmit={scheduleTraining} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10,alignItems:'end'}}>
            <select value={trainingStaffId} onChange={e=>{const id=e.target.value;setTrainingStaffId(id);const pref=rotaRequests.find((x:any)=>x.staff_id===id)?.preferred_training_location;if(pref)setTrainingLocation(pref);}} required style={{padding:10,border:'1px solid var(--line)',borderRadius:8}}><option value="">Select active staff</option>{activeStaff.map((s)=><option key={s.id} value={s.id}>{s.full_name} · {s.job_title}</option>)}</select>
            <label style={{fontSize:12,color:'var(--muted)'}}>Training week starts<input type="date" value={trainingWeekStart} onChange={e=>setTrainingWeekStart(e.target.value)} required style={{width:'100%',marginTop:4,padding:9,border:'1px solid var(--line)',borderRadius:8}}/></label>
            <label style={{fontSize:12,color:'var(--muted)'}}>Training location<select value={trainingLocation} onChange={e=>setTrainingLocation(e.target.value)} required style={{width:'100%',marginTop:4,padding:9,border:'1px solid var(--line)',borderRadius:8}}><option value="">Select city</option>{LAUREM_TRAINING_LOCATIONS.map((x)=><option key={x} value={x}>{x}</option>)}</select></label>
            <button disabled={busy} style={{padding:10,background:'var(--ink)',color:'#fff',border:0,borderRadius:8,fontWeight:800}}>Schedule one-week training</button>
          </form>
        </div>
        <div style={{display:'grid',gap:8,marginTop:10}}>{trainingAssignments.slice(-30).reverse().map((r:any)=><article className="card" key={r.id} style={{padding:14,display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><strong>{r.staff?.full_name||'Staff'}</strong><div style={{color:'var(--muted)',fontSize:12}}>{r.week_start||'Due date not set'} to {r.week_end||'not scheduled'} · {r.location||'Location not set'}</div></div><div style={{display:'flex',gap:7,alignItems:'center'}}><span className="badge">{r.status.replaceAll('_',' ')}</span>{!['completed','cancelled','waived'].includes(r.status)&&<button disabled={busy} onClick={()=>void patch('/api/admin/workforce/training',r.id,{status:'completed'})}>Mark complete</button>}</div></article>)}</div>
      </section>

      <section style={{ marginTop: 32 }}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{marginBottom:4}}>DBS & PVG requests</h2><p style={{color:'var(--muted)',marginTop:0}}>Disclosure requests and invoices raised through the staff portal. Amounts shown are official disclosure fees only.</p></div><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><span className="badge">Open {complianceCounts.open}</span><span className="badge">Unpaid {complianceCounts.unpaid}</span><span className="badge">Paid {complianceCounts.paid}</span></div></div>
        <div style={{display:'grid',gap:9,marginTop:12}}>{complianceRequests.slice(0,30).map((r:any)=><article className="card" key={r.id} style={{padding:14,display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}><div><strong>{r.staff?.full_name||'Staff'} · {String(r.compliance_type).toUpperCase()}</strong><div style={{color:'var(--muted)',fontSize:12}}>{r.invoice_number} · £{(Number(r.amount_pence||0)/100).toFixed(2)} · {r.status}</div><div style={{color:'var(--muted)',fontSize:12,marginTop:3}}>{r.details?.official_fee_note||''}</div></div><div>{['requested','invoice_issued'].includes(r.status)&&<button disabled={busy} onClick={()=>void patch('/api/admin/workforce/compliance-requests',r.id,{markPaid:true,paymentReference:'',paymentMethod:'admin-recorded'})}>Mark paid</button>}{r.status==='paid'&&<button disabled={busy} onClick={()=>void patch('/api/admin/workforce/compliance-requests',r.id,{status:'submitted'})}>Mark submitted</button>}</div></article>)}{!complianceRequests.length&&<div className="card" style={{padding:18,color:'var(--muted)'}}>No open DBS/PVG requests.</div>}</div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Timesheet review</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {pendingTimesheets.map((t) => (
            <article className="card" key={t.id} style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <strong>{t.staff_profiles?.full_name || 'Staff'}</strong>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t.work_date} · {t.total_hours ?? 0} hours</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy} onClick={() => void patch('/api/admin/workforce/timesheets', t.id, { status: 'approved' })}>Approve</button>
                <button disabled={busy} onClick={() => void patch('/api/admin/workforce/timesheets', t.id, { status: 'rejected', note: 'Rejected in workforce operations' })}>Reject</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Leave review</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {pendingLeave.map((l) => (
            <article className="card" key={l.id} style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <strong>{l.staff_profiles?.full_name || 'Staff'}</strong>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{l.leave_type} · {l.start_date} to {l.end_date} · {l.total_days} day{l.total_days === 1 ? '' : 's'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy} onClick={() => void patch('/api/admin/workforce/leave', l.id, { status: 'approved', reviewNote: 'Approved in workforce operations' })}>Approve</button>
                <button disabled={busy} onClick={() => void patch('/api/admin/workforce/leave', l.id, { status: 'rejected', reviewNote: 'Rejected in workforce operations' })}>Reject</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

const navButton = { padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 9, textDecoration: 'none', color: 'var(--ink)', fontWeight: 800 };
const actionButton = { padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'white', fontWeight: 800, cursor: 'pointer' };
