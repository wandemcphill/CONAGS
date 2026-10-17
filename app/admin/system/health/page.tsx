'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Health = {
  ok: boolean;
  timestamp: string;
  release?: { commit: string | null; environment: string };
  dependencies: {
    environment: { ok: boolean; missing: string[] };
    database: { ok: boolean; latencyMs: number; error: string | null };
    schema: { ok: boolean; missing: string[] };
    storage: { ok: boolean; bucketsPresent: string[]; missingBuckets: string[]; error: string | null };
    readiness: { ok: boolean; requiredFunctionCount: number; missingFunctions: string[]; error: string | null };
  };
};

function Badge({ ok }: { ok: boolean }) {
  return <span style={{ display: 'inline-block', padding: '4px 9px', borderRadius: 999, fontSize: 12, fontWeight: 800, border: '1px solid var(--line)' }}>{ok ? 'PASS' : 'ACTION REQUIRED'}</span>;
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/admin/system/health', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok && !payload?.dependencies) throw new Error(payload?.error || 'Health check failed.');
      setHealth(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load system health.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <main className="wrap" style={{ padding: '34px 0 80px', maxWidth: 1080 }}>
    <Link href="/admin" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Recruiter workspace</Link>
    <header style={{ margin: '18px 0 24px' }}>
      <p style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.08em' }}>SYSTEM CONTROL</p>
      <h1>Production health</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>Checks the CONAGS-isolated tables, server configuration, database connectivity and private document storage. Legacy shared tables are intentionally outside this health contract.</p>
    </header>
    {error && <div role="alert" className="card" style={{ padding: 14, marginBottom: 14 }}>{error}</div>}
    <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}><button onClick={() => void load()} disabled={loading} style={buttonPrimary}>{loading ? 'Checking…' : 'Run health check'}</button></div>
    {health && <>
      <section className="card" style={{ padding: 22, marginBottom: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}><div><div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>OVERALL</div><h2 style={{ margin: '6px 0' }}>{health.ok ? 'System ready' : 'System not ready'}</h2><p style={{ color: 'var(--muted)', margin: 0 }}>Checked {new Date(health.timestamp).toLocaleString()}</p></div><Badge ok={health.ok} /></div></section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: 14 }}>
        <Check title="Environment" ok={health.dependencies.environment.ok} detail={health.dependencies.environment.ok ? 'Required server configuration is present.' : `Missing: ${health.dependencies.environment.missing.join(', ')}`} />
        <Check title="Database" ok={health.dependencies.database.ok} detail={health.dependencies.database.ok ? `Responsive in ${health.dependencies.database.latencyMs} ms.` : health.dependencies.database.error || 'Database unavailable.'} />
        <Check title="CONAGS schema" ok={health.dependencies.schema.ok} detail={health.dependencies.schema.ok ? 'Expected isolated portal tables are present.' : `Missing: ${health.dependencies.schema.missing.join(', ')}`} />
        <Check title="Private storage" ok={health.dependencies.storage.ok} detail={health.dependencies.storage.ok ? `Required private buckets are present (${health.dependencies.storage.bucketsPresent.length}).` : health.dependencies.storage.error || `Missing: ${health.dependencies.storage.missingBuckets.join(', ') || 'required private bucket'}`} />
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: 14, marginTop: 14 }}><Check title="Critical functions" ok={health.dependencies.readiness.ok} detail={health.dependencies.readiness.ok ? `${health.dependencies.readiness.requiredFunctionCount} required database functions are available.` : health.dependencies.readiness.error || `Missing: ${health.dependencies.readiness.missingFunctions.join(', ') || 'required function'}`} /></section>
      <section className="card" style={{ padding: 22, marginTop: 14 }}><h2>Release</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: 16 }}><div><div style={label}>Environment</div><div>{health.release?.environment || 'Unknown'}</div></div><div><div style={label}>Commit</div><div style={{ wordBreak: 'break-all' }}>{health.release?.commit || 'Not exposed by host'}</div></div></div></section>
    </>}
  </main>;
}

function Check({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return <section className="card" style={{ padding: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2><Badge ok={ok} /></div><p style={{ color: 'var(--muted)', lineHeight: 1.55, marginBottom: 0 }}>{detail}</p></section>;
}

const label = { color: 'var(--muted)', fontSize: 12, fontWeight: 800, marginBottom: 4 };
const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '11px 14px', borderRadius: 9, fontWeight: 800, cursor: 'pointer' };
