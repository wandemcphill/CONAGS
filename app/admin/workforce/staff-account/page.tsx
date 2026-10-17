'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Staff = {
  id: string;
  application_id: string | null;
  employee_number: string;
  laurem_id: string | null;
  full_name: string;
  email: string;
  job_title: string;
  employment_status: string;
  activated_at: string | null;
  activation_expires_at: string | null;
  activation_used_at: string | null;
  account_state: 'active' | 'suspended' | 'leaver' | 'activation_pending' | 'activation_needed' | 'activation_recovery_needed' | 'state_review';
};

const stateLabels: Record<Staff['account_state'], string> = {
  active: 'Portal active',
  suspended: 'Portal access suspended',
  leaver: 'Portal access ended',
  activation_pending: 'Activation link active',
  activation_needed: 'Activation required',
  activation_recovery_needed: 'Activation recovery required',
  state_review: 'Review state',
};

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set';
}

export default function StaffAccountLifecyclePage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [filter, setFilter] = useState<'all' | Staff['account_state']>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/workforce/staff/account', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to load staff account state.');
      setStaff(body.staff || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load staff account state.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function reissue(staffMember: Staff) {
    const recovery = staffMember.account_state === 'activation_recovery_needed';
    const reason = window.prompt(
      recovery
        ? 'Why are you revoking the previous activation and issuing a new link for ' + staffMember.full_name + '?'
        : 'Why are you reissuing the activation link for ' + staffMember.full_name + '?',
    )?.trim() || '';
    if (reason.length < 5) return;

    setBusyId(staffMember.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/workforce/staff/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: staffMember.id, action: 'reissue_activation', reason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to reissue activation.');
      const deliveryStatus = body.activation?.status || 'unknown';
      if (deliveryStatus === 'sent') {
        setNotice('A new activation email was sent to ' + (body.staff?.email || staffMember.email) + '.');
      } else if (deliveryStatus === 'not_configured') {
        setNotice('The previous activation has been revoked, but email delivery is not configured. Check CONAGS email settings before asking the staff member to activate.');
      } else {
        setNotice('The previous activation has been revoked, but the replacement email was not confirmed as sent. Email status: ' + deliveryStatus + '.');
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reissue activation.');
    } finally {
      setBusyId('');
    }
  }

  const visible = useMemo(() => filter === 'all' ? staff : staff.filter((item) => item.account_state === filter), [filter, staff]);

  return (
    <main className="wrap" style={{ padding: '30px 0 80px', maxWidth: 1200 }}>
      <Link href="/admin/workforce" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Workforce operations</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 18 }}>
        <div>
          <div style={{ color: 'var(--accent)', fontWeight: 900, letterSpacing: '.08em' }}>STAFF ACCESS CONTROL</div>
          <h1 style={{ margin: '6px 0' }}>Staff account lifecycle</h1>
          <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 760 }}>Activation, access state and recovery are derived from the canonical workforce account state. Pending staff must activate themselves through the one-time link.</p>
        </div>
        <button onClick={() => void load()} style={buttonPrimary}>Refresh</button>
      </div>

      {error && <div role="alert" className="card" style={{ padding: 14, marginTop: 16, color: '#8a2323' }}>{error}</div>}
      {notice && <div role="status" className="card" style={{ padding: 14, marginTop: 16, color: '#176b4f' }}>{notice}</div>}

      <section className="card" style={{ padding: 12, marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'activation_needed', 'activation_pending', 'activation_recovery_needed', 'active', 'suspended', 'leaver', 'state_review'] as const).map((item) => (
          <button key={item} onClick={() => setFilter(item)} style={{ ...buttonSecondary, background: filter === item ? 'var(--soft)' : '#fff' }}>
            {item === 'all' ? 'All' : stateLabels[item as Staff['account_state']]}
          </button>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {loading && <div className="card" style={{ padding: 20 }}>Loading account lifecycle…</div>}
        {!loading && !visible.length && <div className="card" style={{ padding: 20 }}>No staff accounts match this view.</div>}
        {!loading && visible.map((item) => (
          <article className="card" key={item.id} style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ ...badge, background: item.account_state === 'active' ? '#e8f7ee' : item.account_state === 'state_review' ? '#fdecec' : item.account_state === 'activation_recovery_needed' ? '#fff1d6' : '#edf2f7' }}>{stateLabels[item.account_state]}</span>
                  <span style={badge}>{item.employment_status}</span>
                </div>
                <h2 style={{ margin: '9px 0 4px' }}>{item.full_name}</h2>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{item.employee_number} · {item.job_title} · {item.email}</div>
                {item.laurem_id && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>CONAGS ID: {item.laurem_id}</div>}
                {item.account_state === 'activation_pending' && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 7 }}>Activation expires {dateTime(item.activation_expires_at)}</div>}
                {item.account_state === 'activation_needed' && <div style={{ color: '#9a3412', fontSize: 12, marginTop: 7 }}>No active activation link. Use recovery only after confirming the staff member needs a new invitation.</div>}
                {item.account_state === 'activation_recovery_needed' && <div style={{ color: '#92400e', fontSize: 12, marginTop: 7 }}>This account was activated while employment is still pending. Recovery revokes its existing sessions and credentials, then issues a fresh one-time activation. The application and employment status remain unchanged.</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Link href="/admin/workforce" style={buttonSecondary}>Workforce</Link>
                {(item.account_state === 'activation_needed' || item.account_state === 'activation_pending' || item.account_state === 'activation_recovery_needed') &&
                  <button disabled={busyId === item.id} onClick={() => void reissue(item)} style={buttonPrimary}>{busyId === item.id ? 'Reissuing…' : item.account_state === 'activation_recovery_needed' ? 'Revoke & reissue activation' : 'Reissue activation'}</button>}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '9px 12px', borderRadius: 9, fontWeight: 800, textDecoration: 'none', cursor: 'pointer' } as const;
const buttonSecondary = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '9px 12px', borderRadius: 9, fontWeight: 800, textDecoration: 'none', cursor: 'pointer' } as const;
const badge = { padding: '6px 9px', borderRadius: 999, background: '#edf2f7', color: '#486581', fontSize: 11, fontWeight: 900 } as const;
