'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lauremCompany } from '@/lib/laurem-company-config';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to sign in.');
      router.push('/admin');
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }

  return <main className="wrap" style={{ padding: '80px 0' }}><section className="card" style={{ maxWidth: 520, margin: '0 auto', padding: 32 }}><p style={{ color: 'var(--accent)', fontWeight: 800 }}>{lauremCompany.tradingName.toUpperCase()}</p><h1>Recruiter sign in</h1><p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Access applications, interviews, documents and hiring workflow.</p>{error && <div role="alert" style={{ margin: '18px 0', padding: 14, border: '1px solid #d98282', borderRadius: 10, color: '#8a2323' }}>{error}</div>}<form onSubmit={submit} style={{ display: 'grid', gap: 14 }}><label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: 12, border: '1px solid var(--line)', borderRadius: 9 }} /></label><label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: 12, border: '1px solid var(--line)', borderRadius: 9 }} /></label><button disabled={busy} type="submit" style={{ marginTop: 6, padding: 13, border: 0, borderRadius: 9, background: 'var(--ink)', color: 'white', fontWeight: 800 }}>{busy ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}
