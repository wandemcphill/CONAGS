'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Task = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  required: boolean;
  status: 'pending' | 'completed' | 'waived';
  acknowledgement_required: boolean;
  acknowledged_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  document_path?: string | null;
};

type PackageRow = { id: string; audience: string; title: string; status: string; completed_at?: string | null };

export default function StaffOnboardingPage({ params }: { params: Promise<{ staffId: string }> }) {
  const [staffId, setStaffId] = useState('');
  const [packageRow, setPackageRow] = useState<PackageRow | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { params.then((value) => setStaffId(value.staffId)); }, [params]);

  async function load() {
    if (!staffId) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/onboarding/tasks?staffId=${encodeURIComponent(staffId)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load onboarding package.');
      setPackageRow(body.package);
      setTasks(body.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load onboarding package.');
    }
  }

  useEffect(() => { load(); }, [staffId]);

  async function updateTask(id: string, status: Task['status']) {
    setSaving(id); setError(null);
    try {
      const response = await fetch(`/api/admin/onboarding/tasks?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update onboarding task.');
      setTasks((current) => current.map((task) => task.id === id ? body.task : task));
      setPackageRow(body.package);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update onboarding task.');
    } finally {
      setSaving(null);
    }
  }

  const completed = tasks.filter((task) => task.status === 'completed' || task.status === 'waived').length;
  const required = tasks.filter((task) => task.required).length;
  const requiredCompleted = tasks.filter((task) => task.required && (task.status === 'completed' || task.status === 'waived')).length;
  const progress = useMemo(() => required ? Math.round((requiredCompleted / required) * 100) : 100, [required, requiredCompleted]);

  return <main className="wrap" style={{ padding: '36px 0 80px', maxWidth: 1040 }}>
    <Link href="/admin" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Recruiter workspace</Link>
    <header style={{ margin: '18px 0 24px' }}>
      <p style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.08em' }}>STAFF ONBOARDING</p>
      <h1 style={{ marginBottom: 6 }}>{packageRow?.title || 'Conags onboarding package'}</h1>
      <p style={{ color: 'var(--muted)' }}>Staff ID: {staffId}</p>
    </header>

    {error && <div role="alert" className="card" style={{ padding: 14, marginBottom: 16 }}>{error}</div>}
    {!packageRow ? <section className="card" style={{ padding: 22 }}><p>Loading onboarding package...</p></section> : <>
      <section className="card" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div><strong>Package status</strong><div style={{ marginTop: 6 }}>{packageRow.status.replace('_', ' ')}</div></div>
          <div><strong>Audience</strong><div style={{ marginTop: 6 }}>{packageRow.audience}</div></div>
          <div><strong>Progress</strong><div style={{ marginTop: 6 }}>{requiredCompleted}/{required} required · {progress}%</div></div>
        </div>
        <div style={{ height: 10, borderRadius: 99, background: 'var(--soft)', marginTop: 16, overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--ink)' }} /></div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        {tasks.map((task) => <article key={task.id} className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 730 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'var(--accent)' }}>{task.category.toUpperCase()}</span>{task.required && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Required</span>}</div>
              <h2 style={{ fontSize: 18, margin: '7px 0 6px' }}>{task.title}</h2>
              <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.55 }}>{task.description}</p>
              {task.document_path && <div style={{ marginTop: 10 }}><Link href={`/${task.document_path}`} target="_blank" rel="noreferrer">Open handbook/package source</Link></div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ padding: '7px 10px', borderRadius: 99, background: 'var(--soft)', fontWeight: 800, fontSize: 12 }}>{task.status}</span>
              {task.status !== 'completed' && <button disabled={saving === task.id} onClick={() => updateTask(task.id, 'completed')} style={buttonPrimary}>{saving === task.id ? 'Saving…' : 'Complete'}</button>}
              {task.status === 'completed' && <button disabled={saving === task.id} onClick={() => updateTask(task.id, 'pending')} style={buttonSecondary}>Reopen</button>}
              {task.required && task.status !== 'waived' && <button disabled={saving === task.id} onClick={() => updateTask(task.id, 'waived')} style={buttonSecondary}>Waive</button>}
            </div>
          </div>
        </article>)}
      </section>
    </>}
    <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 20 }}>{completed} total tasks tracked. Required tasks determine onboarding completion.</p>
  </main>;
}

const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '10px 13px', borderRadius: 9, fontWeight: 800, cursor: 'pointer' };
const buttonSecondary = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '10px 13px', borderRadius: 9, fontWeight: 800, cursor: 'pointer' };
