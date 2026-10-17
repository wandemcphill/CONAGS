'use client';
import { useEffect, useState } from 'react';

export default function AdminMessagesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [active, setActive] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/admin/messages', { cache: 'no-store' });
    if (response.ok) setRows((await response.json()).conversations || []);
    else if (response.status !== 401) setError('Unable to load message centre.');
  }

  async function openConversation(id: string) {
    setActive(id);
    const response = await fetch(`/api/admin/messages/${id}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setMessages(data.messages || []);
    else setError(data.error || 'Unable to open conversation.');
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { const desired=new URLSearchParams(window.location.search).get('conversation'); if(desired)void openConversation(desired); }, []);

  async function reply() {
    const message = draft.trim();
    if (!message || !active) return;
    const response = await fetch(`/api/admin/messages/${active}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ message }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || 'Unable to send message.'); return; }
    setMessages((current) => [...current, data.message]);
    setDraft('');
    await load();
  }

  const activeRow = rows.find((row) => row.id === active) || null;
  const visible = rows.filter((row) => {
    const matchesQuery = !query || row.participants.some((p: any) => `${p.full_name} ${p.laurem_id} ${p.address || ''}`.toLowerCase().includes(query.toLowerCase()));
    const matchesTeam = teamFilter === 'all' || row.inbox_team === teamFilter;
    return matchesQuery && matchesTeam;
  });

  return (
    <main className="admin-messages-page" style={{ minHeight: '100vh', background: '#f4f7fb', fontFamily: 'system-ui', padding: 24, color: '#102a43' }}>
      <div className="admin-message-centre" style={{ maxWidth: 1250, margin: '0 auto' }}>
        <h1>CONAGS Message Centre</h1>
        <p style={{ color: '#627d98' }}>Admin-only oversight of private staff conversations, routed by Admin, Management and Recruitment team.</p>
        <div className="admin-message-centre-layout" style={{ display: 'grid', gridTemplateColumns: '390px 1fr', minHeight: 700, background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, overflow: 'hidden' }}>
          <aside style={{ padding: 14, borderRight: '1px solid #edf2f7' }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff, CONAGS ID or handle" style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, marginBottom: 8 }} />
            <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, marginBottom: 12, background: '#fff' }} aria-label="Filter messages by team">
              <option value="all">All teams</option>
              <option value="admin">CONAGS Admin</option>
              <option value="management">Management</option>
              <option value="recruitment">Recruitment</option>
            </select>
            {visible.map((row) => (
              <button key={row.id} onClick={() => void openConversation(row.id)} style={{ width: '100%', textAlign: 'left', border: 0, background: active === row.id ? '#e6fffb' : '#fff', padding: 12, borderRadius: 10, marginBottom: 6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center' }}><strong style={{ minWidth:0 }}>{row.participants.map((p: any) => p.full_name).join(' ↔ ')}</strong>{row.unreadByAdmin&&<span style={{ fontSize:10, fontWeight:900, color:'#b42318' }}>NEW</span>}</div>
                <span style={{ display:'inline-flex', marginTop:5, padding:'4px 7px', borderRadius:999, background:'#e8f5ef', color:'#245b4d', fontSize:9, fontWeight:900, textTransform:'uppercase', letterSpacing:'.05em' }}>{row.team?.label || (row.participants.length > 1 ? 'Staff' : 'CONAGS Admin')}</span>
                <div style={{ fontSize: 12, color: '#627d98' }}>{row.participants.map((p: any) => p.address).filter(Boolean).join(' · ')}</div>
                <div style={{ fontSize: 12, color: '#829ab1' }}>{row.latest?.body || ''}</div>
              </button>
            ))}
          </aside>
          <section style={{ display: 'flex', flexDirection: 'column' }}>
            {!active ? <div style={{ margin: 'auto', color: '#627d98' }}>Select a conversation.</div> : <>
              <div style={{ padding: 16, borderBottom: '1px solid #edf2f7', fontWeight: 900 }}>
                <div style={{ fontSize: 11, textTransform:'uppercase', letterSpacing:'.08em', color:'#627d98', marginBottom:5 }}>{activeRow?.team?.label || 'CONAGS Admin'}</div>
                Conversation with {activeRow?.participants?.map((p:any)=>p.full_name).join(' · ') || 'staff'}
              </div>
              <div style={{ flex: 1, padding: 18, display: 'grid', alignContent: 'start', gap: 10 }}>
                {messages.map((message) => <div key={message.id} style={{ justifySelf: message.sender_admin_email ? 'end' : 'start', maxWidth: '80%', background: message.sender_admin_email ? '#0f766e' : '#f4f7fb', color: message.sender_admin_email ? '#fff' : '#243b53', borderRadius: 14, padding: 12 }}><div style={{ fontSize: 11, fontWeight: 800 }}>{message.sender_admin_email ? (activeRow?.team?.label || 'CONAGS Admin') : 'Staff'}</div><div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div><small>{new Date(message.created_at).toLocaleString('en-GB')}</small></div>)}
              </div>
              <div style={{ padding: 14, borderTop: '1px solid #edf2f7', display: 'flex', gap: 8 }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} style={{ flex: 1, padding: 10, border: '1px solid #cbd5e1', borderRadius: 10 }} /><button onClick={() => void reply()} style={{ padding: '10px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>Reply</button></div>
            </>}
          </section>
        </div>
        {error && <p style={{ color: '#b42318' }}>{error}</p>}
      </div>
    </main>
  );
}
