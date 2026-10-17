'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Summary = {
  totalActiveStaff: number;
  totalPendingStaff: number;
  currentCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  missingCount: number;
  underReviewCount: number;
  nursesTotal: number;
  nursesFullyRegistered: number;
  nursesActionNeeded: number;
  generatedAt: string;
};

type StaffCompliance = {
  id: string;
  full_name: string;
  employee_number: string;
  job_title: string;
  location: string | null;
  employment_status: string;
  manager: { id: string; full_name: string; job_title: string } | null;
  compliance: {
    overallStatus: 'Current' | 'Expiring Soon' | 'Expired' | 'Missing' | 'Under Review';
    rightToWork: { pathway: string; verified: boolean; statusCategory: string; expiryDate: string | null; detail: string };
    dbsPvg: { verified: boolean; statusCategory: string; checkDate: string | null; expiryDate: string | null; detail: string };
    nmcRegistration: { isNurse: boolean; nmcNumber: string | null; registrationState: string; statusCategory: string; expiryDate: string | null; detail: string };
    documentsComplete: boolean;
    onboardingComplete: boolean;
    attentionItems: string[];
  };
};

type ExpiringItem = {
  staffId: string;
  fullName: string;
  employeeNumber: string;
  itemType: 'Right to Work' | 'DBS/PVG' | 'NMC Registration' | 'Unsigned Document';
  statusCategory: string;
  expiryDate: string | null;
  detail: string;
};

type ComplianceData = {
  summary: Summary;
  staffCompliance: StaffCompliance[];
  expiringItems: ExpiringItem[];
};

export default function ComplianceDashboardPage() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'nurses' | 'expiries'>('overview');

  async function load() {
    setError('');
    try {
      const res = await fetch('/api/admin/workforce/compliance', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Unable to load compliance dashboard.');
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load compliance dashboard.');
    }
  }

  useEffect(() => { void load(); }, []);

  if (!data) {
    return (
      <main className="wrap" style={{ padding: '36px 0 80px', maxWidth: 1180 }}>
        <Link href="/admin/workforce" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Workforce administration</Link>
        <h1 style={{ marginTop: 16 }}>Workforce Compliance Dashboard</h1>
        {error ? <div role="alert" className="card" style={{ padding: 16, marginTop: 18 }}>{error}</div> : <div className="card" style={{ padding: 20, marginTop: 18 }}>Loading compliance dataset…</div>}
      </main>
    );
  }

  const { summary, staffCompliance, expiringItems } = data;
  const nurseList = staffCompliance.filter((s) => s.compliance.nmcRegistration.isNurse);

  return (
    <main className="wrap" style={{ padding: '36px 0 80px', maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <Link href="/admin/workforce" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Workforce administration</Link>
          <h1 style={{ fontSize: 40, margin: '8px 0 4px' }}>Workforce Readiness & Compliance</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>Authorised administrative readiness view across Right to Work, DBS/PVG, NMC registration and document completion.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/workforce/documents" style={buttonSecondary}>Document Administration</Link>
          <button onClick={() => void load()} style={buttonPrimary}>Refresh View</button>
        </div>
      </div>

      {error && <div role="alert" className="card" style={{ marginTop: 18, padding: 14, color: '#8a2323' }}>{error}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
        <MetricCard label="Active Workforce" value={summary.totalActiveStaff} color="var(--ink)" />
        <MetricCard label="Current Compliance" value={summary.currentCount} color="#166534" bg="#e8f7ee" />
        <MetricCard label="Expiring Soon" value={summary.expiringSoonCount} color="#9a3412" bg="#fff4e5" />
        <MetricCard label="Expired / Non-Compliant" value={summary.expiredCount} color="#991b1b" bg="#fdecec" />
        <MetricCard label="Under Review" value={summary.underReviewCount} color="#1e40af" bg="#eff6ff" />
        <MetricCard label="Missing Evidence" value={summary.missingCount} color="#854d0e" bg="#fefce8" />
      </section>

      <section className="card" style={{ padding: 6, marginTop: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setActiveTab('overview')} style={activeTab === 'overview' ? tabActive : tabInactive}>Workforce Matrix ({staffCompliance.length})</button>
          <button onClick={() => setActiveTab('nurses')} style={activeTab === 'nurses' ? tabActive : tabInactive}>Registered Nurses ({summary.nursesTotal})</button>
          <button onClick={() => setActiveTab('expiries')} style={activeTab === 'expiries' ? tabActive : tabInactive}>Expiries & Attention ({expiringItems.length})</button>
        </div>
      </section>

      {activeTab === 'overview' && (
        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {staffCompliance.map((s) => (
              <article key={s.id} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <Link href={`/admin/workforce/${encodeURIComponent(s.id)}`} style={{ fontSize: 16, fontWeight: 850, color: 'var(--ink)', textDecoration: 'none' }}>
                    {s.full_name}
                  </Link>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                    {s.employee_number} · {s.job_title} · {s.location || 'Location not set'} {s.manager && `· Manager: ${s.manager.full_name}`}
                  </div>
                  {s.compliance.attentionItems.length > 0 && (
                    <div style={{ color: '#9a3412', fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                      Attention: {s.compliance.attentionItems.join(' | ')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Badge label={`RTW: ${s.compliance.rightToWork.statusCategory}`} category={s.compliance.rightToWork.statusCategory} />
                  <Badge label={`DBS: ${s.compliance.dbsPvg.statusCategory}`} category={s.compliance.dbsPvg.statusCategory} />
                  {s.compliance.nmcRegistration.isNurse && (
                    <Badge label={`NMC: ${s.compliance.nmcRegistration.statusCategory}`} category={s.compliance.nmcRegistration.statusCategory} />
                  )}
                  <span style={{
                    padding: '6px 11px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                    background: s.compliance.overallStatus === 'Current' ? '#e8f7ee' : s.compliance.overallStatus === 'Expiring Soon' ? '#fff4e5' : '#fdecec',
                    color: s.compliance.overallStatus === 'Current' ? '#166534' : s.compliance.overallStatus === 'Expiring Soon' ? '#9a3412' : '#991b1b',
                  }}>
                    Overall: {s.compliance.overallStatus}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'nurses' && (
        <section style={{ marginTop: 20 }}>
          <div className="card" style={{ padding: 18, marginBottom: 16, background: '#fafafa' }}>
            <h2 style={{ marginTop: 0 }}>Registered Nurses Administrative Clearance</h2>
            <p style={{ color: 'var(--muted)', margin: 0 }}>Specific NMC verification, pin tracking, and clearance status for nursing staff.</p>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <div><strong>{summary.nursesTotal}</strong> Registered Nurses Total</div>
              <div><strong style={{ color: '#166534' }}>{summary.nursesFullyRegistered}</strong> Fully Cleared & Active</div>
              <div><strong style={{ color: '#9a3412' }}>{summary.nursesActionNeeded}</strong> Action Needed / Verification Pending</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {nurseList.map((nurse) => (
              <article key={nurse.id} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <Link href={`/admin/workforce/${encodeURIComponent(nurse.id)}`} style={{ fontSize: 16, fontWeight: 850, color: 'var(--ink)', textDecoration: 'none' }}>
                    {nurse.full_name}
                  </Link>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                    NMC Pin: <strong>{nurse.compliance.nmcRegistration.nmcNumber || 'Not recorded'}</strong> · Job Title: {nurse.job_title}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                    {nurse.compliance.nmcRegistration.detail}
                    {nurse.compliance.nmcRegistration.expiryDate && ` · Expiry: ${nurse.compliance.nmcRegistration.expiryDate}`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    padding: '6px 11px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                    background: nurse.compliance.nmcRegistration.registrationState === 'fully_registered' ? '#e8f7ee' : '#fff4e5',
                    color: nurse.compliance.nmcRegistration.registrationState === 'fully_registered' ? '#166534' : '#9a3412',
                  }}>
                    {nurse.compliance.nmcRegistration.registrationState.replaceAll('_', ' ').toUpperCase()}
                  </span>
                </div>
              </article>
            ))}

            {!nurseList.length && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>No registered nurses currently in active/pending workforce.</div>}
          </div>
        </section>
      )}

      {activeTab === 'expiries' && (
        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {expiringItems.map((item, idx) => (
              <article key={idx} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <Link href={`/admin/workforce/${encodeURIComponent(item.staffId)}`} style={{ fontSize: 16, fontWeight: 850, color: 'var(--ink)', textDecoration: 'none' }}>
                    {item.fullName}
                  </Link>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                    {item.employeeNumber} · Requirement: <strong>{item.itemType}</strong>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                    {item.detail} {item.expiryDate && `(Expires: ${item.expiryDate})`}
                  </div>
                </div>

                <Badge label={item.statusCategory} category={item.statusCategory} />
              </article>
            ))}

            {!expiringItems.length && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>No upcoming compliance expiries or missing items detected.</div>}
          </div>
        </section>
      )}
    </main>
  );
}

function MetricCard({ label, value, color, bg }: { label: string; value: number; color: string; bg?: string }) {
  return (
    <article className="card" style={{ padding: 16, background: bg || 'white' }}>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </article>
  );
}

function Badge({ label, category }: { label: string; category: string }) {
  const bg = category === 'Current' ? '#e8f7ee' : category === 'Expiring Soon' ? '#fff4e5' : '#fdecec';
  const color = category === 'Current' ? '#166534' : category === 'Expiring Soon' ? '#9a3412' : '#991b1b';
  return (
    <span style={{ padding: '5px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: bg, color }}>
      {label}
    </span>
  );
}

const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '8px 12px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
const buttonSecondary = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: 8, fontWeight: 800, textDecoration: 'none' };
const tabActive = { padding: '8px 14px', borderRadius: 6, background: 'var(--ink)', color: 'white', border: 0, fontWeight: 800, cursor: 'pointer' };
const tabInactive = { padding: '8px 14px', borderRadius: 6, background: 'transparent', color: 'var(--ink)', border: 0, fontWeight: 800, cursor: 'pointer' };
