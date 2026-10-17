'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LAUREM_MESSAGE_TEAM_TARGETS } from '@/lib/laurem-messaging';

type Props = { compact?: boolean };

const labels: Record<string, string> = {
  admin: 'Admin',
  management: 'Management',
  recruitment: 'Recruitment',
};

export default function StaffTeamMessageQuickAction({ compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function close() {
    if (sending) return;
    setOpen(false);
    setFeedback('');
    setError('');
  }

  async function sendMessage() {
    const trimmed = message.trim();
    if (!team || !trimmed || sending) return;

    setSending(true);
    setFeedback('');
    setError('');

    try {
      const response = await fetch('/api/staff/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ team, message: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.href = '/staff/login';
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'Unable to send your message.');

      const conversationId = payload.conversation?.id;
      setMessage('');
      setFeedback('Message sent.');
      window.setTimeout(() => {
        window.location.href = conversationId
          ? '/staff/messages?conversation=' + encodeURIComponent(conversationId)
          : '/staff/messages';
      }, 250);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send your message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: compact ? 'auto' : '100%' }}>
      <button
        type="button"
        className={compact ? 'staff-nav-message-trigger staff-nav-message-trigger--compact' : 'staff-nav-message-trigger'}
        onClick={() => {
          setOpen((value) => !value);
          setError('');
          setFeedback('');
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">✦</span>
        <span>{compact ? 'Message' : 'Message a team'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Message a CONAGS team"
          style={{
            position: 'absolute',
            zIndex: 100,
            top: compact ? 'calc(100% + 10px)' : 'auto',
            bottom: compact ? 'auto' : 'calc(100% + 10px)',
            left: compact ? 'auto' : 0,
            right: compact ? 0 : 'auto',
            width: 'min(360px, calc(100vw - 28px))',
            padding: 14,
            border: '1px solid var(--line)',
            borderRadius: 16,
            background: 'var(--surface, #fff)',
            boxShadow: '0 20px 55px rgba(15, 23, 42, .18)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 11 }}>
            <div>
              <div className="staff-eyebrow">QUICK MESSAGE</div>
              <strong style={{ display: 'block', marginTop: 3, fontSize: 15 }}>Who do you need?</strong>
              <span style={{ display: 'block', marginTop: 3, color: 'var(--muted)', fontSize: 11, lineHeight: 1.45 }}>
                Choose the team. You do not need an email address.
              </span>
            </div>
            <button type="button" onClick={close} disabled={sending} aria-label="Close message composer" style={{ border: 0, background: 'transparent', color: 'var(--muted)', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 2 }}>×</button>
          </div>

          <label className="staff-form-field">
            <span className="staff-form-label">Recipient team</span>
            <select
              className="staff-form-input"
              value={team}
              onChange={(event) => setTeam(event.target.value)}
              autoFocus
              aria-label="Message recipient team"
            >
              <option value="">Select a team…</option>
              {LAUREM_MESSAGE_TEAM_TARGETS.map((target) => (
                <option key={target.key} value={target.key}>{labels[target.key] || target.label}</option>
              ))}
            </select>
          </label>

          {team && (
            <div style={{ marginTop: 7, padding: '8px 10px', borderRadius: 10, background: 'var(--soft)', color: 'var(--muted)', fontSize: 11, lineHeight: 1.45 }}>
              {LAUREM_MESSAGE_TEAM_TARGETS.find((target) => target.key === team)?.description}
            </div>
          )}

          <label className="staff-form-field" style={{ marginTop: 9 }}>
            <span className="staff-form-label">Message</span>
            <textarea
              className="staff-form-input"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={10000}
              placeholder="Tell the team what you need…"
            />
          </label>

          {error && <div role="alert" style={{ marginTop: 8, color: '#991b1b', fontSize: 11 }}>{error}</div>}
          {feedback && <div role="status" style={{ marginTop: 8, color: '#166534', fontSize: 11 }}>{feedback}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="staff-action-primary" onClick={() => void sendMessage()} disabled={sending || !team || !message.trim()} style={{ flex: 1 }}>
              {sending ? 'Sending…' : 'Send message'}
            </button>
            <Link href="/staff/messages" onClick={close} className="staff-action" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              Open inbox
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
