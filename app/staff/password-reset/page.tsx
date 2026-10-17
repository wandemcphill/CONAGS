'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function StaffPasswordResetContent() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [mode, setMode] = useState(token ? 'complete' : 'request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => setMode(token ? 'complete' : 'request'), [token]);

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/staff/auth/password-reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to request a password reset.');
      setMessage(data.message || 'If an eligible CONAGS account exists, a reset link will be sent shortly.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to request a password reset.');
    } finally { setBusy(false); }
  }

  async function completeReset(event: React.FormEvent) {
    event.preventDefault();
    setMessage(''); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 10) { setError('Use a password of at least 10 characters.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/staff/auth/password-reset', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to reset your password.');
      setMessage(data.message || 'Your Staff Portal password has been changed.');
      setPassword(''); setConfirm('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reset your password.');
    } finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 24, fontFamily: 'system-ui' }}>
      <section style={{ width: '100%', maxWidth: 520, background: '#fff', padding: 32, borderRadius: 20, boxShadow: '0 14px 44px rgba(15,23,42,.08)', border: '1px solid #e5eaf0' }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.4, textTransform: 'uppercase', color: '#0f766e' }}>CONAGS Care</div>
        <h1 style={{ margin: '10px 0 8px', color: '#102a43', fontSize: 29 }}>{mode === 'complete' ? 'Create a new Staff Portal password' : 'Reset your Staff Portal password'}</h1>
        <p style={{ color: '#627d98', lineHeight: 1.55 }}>{mode === 'complete' ? 'Choose a new password for your CONAGS Staff Portal account. Existing sessions will be invalidated for security.' : 'Enter the email address attached to your CONAGS Staff Portal account. We will send a secure reset link if the account is eligible.'}</p>
        {error && <div role="alert" style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#9b2c2c', padding: 12, borderRadius: 10, marginBottom: 14 }}>{error}</div>}
        {message && <div role="status" style={{ background: '#effcf6', border: '1px solid #b7e4cc', color: '#166534', padding: 12, borderRadius: 10, marginBottom: 14, lineHeight: 1.5 }}>{message}</div>}
        {mode === 'request' ? (
          <form onSubmit={requestReset}>
            <label style={{ display: 'block', fontWeight: 800, marginBottom: 6 }}>CONAGS email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="name@conagscare.com" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #d9e2ec', borderRadius: 10, marginBottom: 14 }} />
            <button disabled={busy} style={{ width: '100%', padding: '13px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{busy ? 'Sending reset link…' : 'Send password reset link'}</button>
          </form>
        ) : (
          <form onSubmit={completeReset}>
            <label style={{ display: 'block', fontWeight: 800, marginBottom: 6 }}>New password</label>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={10} required autoComplete="new-password" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #d9e2ec', borderRadius: 10, marginBottom: 14 }} />
            <label style={{ display: 'block', fontWeight: 800, marginBottom: 6 }}>Confirm new password</label>
            <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" minLength={10} required autoComplete="new-password" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #d9e2ec', borderRadius: 10, marginBottom: 14 }} />
            <button disabled={busy} style={{ width: '100%', padding: '13px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{busy ? 'Changing password…' : 'Change password'}</button>
          </form>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <Link href="/staff/login" style={{ color: '#0f766e', fontWeight: 900, textDecoration: 'none' }}>← Back to Staff Portal login</Link>
          {mode === 'complete' && <Link href="/staff/password-reset" style={{ color: '#627d98', fontWeight: 800, textDecoration: 'none' }}>Request another link</Link>}
        </div>
      </section>
    </main>
  );
}

export default function StaffPasswordResetPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 24, fontFamily: 'system-ui' }}>Loading password reset…</main>}>
      <StaffPasswordResetContent />
    </Suspense>
  );
}
