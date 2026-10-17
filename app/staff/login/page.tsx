'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function StaffLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activationUsed = searchParams.get('activation') === 'used';
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/staff/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ laurem_id: id, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Unable to sign in.');
      setBusy(false);
      return;
    }
    router.replace('/staff');
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', fontFamily: 'system-ui' }}>
      <form onSubmit={submit} style={{ background: '#fff', padding: 28, borderRadius: 18, border: '1px solid #e5eaf0', width: 'min(440px,90%)' }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e', letterSpacing: 1.4 }}>CONAGS CARE</div>
        <h1>Staff Portal</h1>
        <p style={{ color: '#627d98' }}>Use the CONAGS ID issued after onboarding.</p>
        {activationUsed && <div role="status" style={{ marginBottom: 12, padding: 12, background: '#fff8e7', border: '1px solid #f2d49b', borderRadius: 10, color: '#7a4f00', lineHeight: 1.5 }}>That activation link has already been used. Your account is active, so please sign in with your CONAGS ID and password.</div>}
        <input required placeholder="CON-001000" value={id} onChange={(event) => setId(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #cbd5e1', borderRadius: 10, marginBottom: 10 }} />
        <input required type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #cbd5e1', borderRadius: 10 }} />
        <div style={{ textAlign: 'right', marginTop: 10 }}><a href="/staff/password-reset" style={{ color: '#0f766e', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>Forgot your password?</a></div><button disabled={busy} style={{ width: '100%', marginTop: 12, padding: 12, border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {error && <p style={{ color: '#b42318' }}>{error}</p>}
      </form>
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui' }}>Loading Staff Portal…</main>}><StaffLoginPage /></Suspense>;
}
