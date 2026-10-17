'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Item = {
  id: string;
  item_key: string;
  title: string;
  description: string;
  required: boolean;
  status: 'pending' | 'completed' | 'waived';
  notes?: string | null;
};

export default function ReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [waiver, setWaiver] = useState<Record<string, string>>({});

  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/onboarding/readiness?applicationId=${encodeURIComponent(id)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load readiness.'); setItems(data.items || []); setReady(Boolean(data.ready)); })
      .catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load readiness.'));
  }, [id]);

  async function setStatus(item: Item, status: Item['status']) {
    setSaving(true); setNotice(null);
    try {
      const notes = waiver[item.item_key] || '';
      const response = await fetch(`/api/admin/onboarding/readiness?applicationId=${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemKey: item.item_key, status, notes }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to update readiness.');
      setItems(data.items || []); setReady(Boolean(data.ready)); setNotice('Readiness updated.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to update readiness.'); }
    finally { setSaving(false); }
  }

  return <main className="wrap" style={{ padding: '34px 0 80px', maxWidth: 980 }}>
    <Link href={`/admin/applications/${encodeURIComponent(id)}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Candidate file</Link>
    <header style={{ margin: '18px 0 24px' }}><p style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.08em' }}>PRE-STAFF READINESS</p><h1>Onboarding readiness gate</h1><p style={{ color: 'var(--muted)', maxWidth: 720 }}>Complete the compliance checks before converting the candidate into a staff profile. This gate is separate from the employee onboarding task package.</p></header>
    {notice && <div role="alert" className="card" style={{ padding: 14, marginBottom: 14 }}>{notice}</div>}
    <div className="card" style={{ padding: 18, marginBottom: 14, border: ready ? '2px solid var(--ink)' : '1px solid var(--line)' }}><strong>{ready ? 'READY FOR STAFF CONVERSION' : 'NOT READY FOR STAFF CONVERSION'}</strong><p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>{ready ? 'All required readiness controls are complete.' : 'Complete every required item, or record an approved waiver with a note, before staff conversion.'}</p></div>
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((item) => <section className="card" key={item.id} style={{ padding: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 18 }}>{item.title} {item.required && <span style={{ color: 'var(--muted)', fontSize: 12 }}>(required)</span>}</h2><p style={{ color: 'var(--muted)', lineHeight: 1.55 }}>{item.description}</p></div><strong>{item.status}</strong></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><button disabled={saving || item.status === 'completed'} onClick={() => setStatus(item, 'completed')} style={buttonPrimary}>Mark complete</button><button disabled={saving || item.status === 'pending'} onClick={() => setStatus(item, 'pending')} style={buttonSecondary}>Reset</button>{item.required && <><input value={waiver[item.item_key] || ''} onChange={(e) => setWaiver((current) => ({ ...current, [item.item_key]: e.target.value }))} placeholder="Waiver note" style={inputStyle} /><button disabled={saving || !waiver[item.item_key]} onClick={() => setStatus(item, 'waived')} style={buttonSecondary}>Waive with note</button></>}</div></section>)}
    </div>
  </main>;
}

const inputStyle = { padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, minWidth: 220 };
const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '10px 13px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
const buttonSecondary = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '10px 13px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
