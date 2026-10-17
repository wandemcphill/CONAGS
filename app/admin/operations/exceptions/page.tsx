'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Exception = {
  id: string;
  dedupe_key: string;
  area: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  code: string;
  title: string;
  detail: string;
  application_id: string | null;
  staff_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  last_detected_at: string;
  acknowledged_by: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

const severityRank: Record<Exception['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

function badgeStyle(value: string) {
  const palette: Record<string, React.CSSProperties> = {
    critical: { background: '#fdecec', color: '#991b1b' },
    high: { background: '#fff4e5', color: '#9a3412' },
    medium: { background: '#fff8db', color: '#854d0e' },
    low: { background: '#eef3f8', color: '#486581' },
    open: { background: '#edf2f7', color: '#102a43' },
    acknowledged: { background: '#e7f0ff', color: '#1d4ed8' },
    resolved: { background: '#e8f7ee', color: '#166534' },
    dismissed: { background: '#f3f4f6', color: '#4b5563' },
  };
  return { ...palette[value], padding: '6px 9px', borderRadius: 999, fontSize: 11, fontWeight: 900 };
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set';
}

export default function OperationalExceptionsPage() {
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [status, setStatus] = useState('open');
  const [area, setArea] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scannedAt, setScannedAt] = useState('');

  async function load(nextStatus = status) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (nextStatus !== 'all') params.set('status', nextStatus);
      if (area !== 'all') params.set('area', area);
      if (severity !== 'all') params.set('severity', severity);
      const response = await fetch(`/api/admin/operations/exceptions?${params.toString()}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load operational exceptions.');
      setExceptions(body.exceptions || []);
      setScannedAt(body.scanner?.scannedAt || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load operational exceptions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [status, area, severity]);

  async function updateException(id: string, nextStatus: Exception['status']) {
    let reason = '';
    if (['resolved', 'dismissed'].includes(nextStatus)) {
      reason = window.prompt(`Reason for ${nextStatus}?`)?.trim() || '';
      if (!reason) return;
    }
    if (nextStatus === 'open') {
      reason = window.prompt('Reason for reopening this exception?')?.trim() || '';
      if (!reason) return;
    }

    setBusyId(id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/operations/exceptions?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update exception.');
      setNotice(`Exception marked ${nextStatus}.`);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update exception.');
    } finally {
      setBusyId('');
    }
  }

  const counts = useMemo(() => ({
    critical: exceptions.filter((item) => item.severity === 'critical').length,
    high: exceptions.filter((item) => item.severity === 'high').length,
    medium: exceptions.filter((item) => item.severity === 'medium').length,
    total: exceptions.length,
  }), [exceptions]);

  const ordered = [...exceptions].sort((a, b) => {
    const severityDelta = severityRank[a.severity] - severityRank[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return new Date(b.last_detected_at).getTime() - new Date(a.last_detected_at).getTime();
  });

  return (
    <main className="wrap" style={{ padding: '30px 0 80px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <Link href="/admin" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Recruiter workspace</Link>
          <p style={{ color: 'var(--accent)', fontWeight: 900, letterSpacing: '.08em', margin: '18px 0 6px' }}>OPERATIONS CONTROL</p>
          <h1 style={{ margin: 0, fontSize: 42 }}>Exception Center</h1>
          <p style={{ margin: '8px 0 0', color: 'var(--muted)', maxWidth: 760 }}>
            Detect and resolve cross-module records that no longer agree. Manual resolutions are reasoned, audited and never change the underlying lifecycle policy.
          </p>
        </div>
        <button onClick={() => void load()} style={buttonPrimary}>Run scanner</button>
      </div>

      {error && <div role="alert" className="card" style={{ padding: 14, marginTop: 16, color: '#8a2323' }}>{error}</div>}
      {notice && <div role="status" className="card" style={{ padding: 14, marginTop: 16, color: '#176b4f' }}>{notice}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(165px,1fr))', gap: 10, marginTop: 20 }}>
        <Metric label="Visible exceptions" value={counts.total} />
        <Metric label="Critical" value={counts.critical} />
        <Metric label="High" value={counts.high} />
        <Metric label="Medium" value={counts.medium} />
      </section>

      <section className="card" style={{ padding: 12, marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter label="Status" value={status} onChange={setStatus} options={['open', 'acknowledged', 'resolved', 'dismissed', 'all']} />
          <Filter label="Area" value={area} onChange={setArea} options={['all', 'recruitment', 'contract', 'onboarding', 'workforce', 'payroll']} />
          <Filter label="Severity" value={severity} onChange={setSeverity} options={['all', 'critical', 'high', 'medium', 'low']} />
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>Last scan: {dateTime(scannedAt)}</span>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {loading && <div className="card" style={{ padding: 20 }}>Scanning operational state…</div>}
        {!loading && !ordered.length && (
          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ marginTop: 0 }}>No exceptions in this view</h2>
            <p style={{ marginBottom: 0, color: 'var(--muted)' }}>The scanner did not find a matching operational inconsistency.</p>
          </div>
        )}

        {!loading && ordered.map((item) => (
          <article className="card" key={item.id} style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: '1 1 480px' }}>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={badgeStyle(item.severity)}>{item.severity.toUpperCase()}</span>
                  <span style={badgeStyle(item.status)}>{item.status.toUpperCase()}</span>
                  <span style={{ ...badgeStyle('low'), textTransform: 'uppercase' }}>{item.area}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{item.code}</span>
                </div>
                <h2 style={{ margin: '9px 0 5px' }}>{item.title}</h2>
                <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>{item.detail}</p>
                <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
                  Detected {dateTime(item.last_detected_at)}
                  {item.resolution_note ? ` · Resolution: ${item.resolution_note}` : ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {item.application_id && <Link href={`/admin/applications/${encodeURIComponent(item.application_id)}`} style={buttonSecondary}>Candidate 360</Link>}
                {item.staff_id && <Link href={`/admin/workforce/${encodeURIComponent(item.staff_id)}`} style={buttonSecondary}>Staff 360</Link>}
                {item.status === 'open' && <button disabled={busyId === item.id} onClick={() => void updateException(item.id, 'acknowledged')} style={buttonPrimary}>Acknowledge</button>}
                {['open', 'acknowledged'].includes(item.status) && <button disabled={busyId === item.id} onClick={() => void updateException(item.id, 'resolved')} style={buttonSecondary}>Resolve</button>}
                {['open', 'acknowledged'].includes(item.status) && <button disabled={busyId === item.id} onClick={() => void updateException(item.id, 'dismissed')} style={buttonSecondary}>Dismiss</button>}
                {['resolved', 'dismissed'].includes(item.status) && <button disabled={busyId === item.id} onClick={() => void updateException(item.id, 'open')} style={buttonSecondary}>Reopen</button>}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="card" style={{ padding: 16 }}><div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div><div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 12 }}>{label}</div></article>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 900, color: 'var(--muted)' }}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} style={{ minWidth: 145, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: '#fff', color: 'var(--ink)', fontWeight: 800 }}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '9px 12px', borderRadius: 9, fontWeight: 800, textDecoration: 'none', cursor: 'pointer' } as const;
const buttonSecondary = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '9px 12px', borderRadius: 9, fontWeight: 800, textDecoration: 'none', cursor: 'pointer' } as const;
