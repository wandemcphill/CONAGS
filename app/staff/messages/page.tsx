'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StaffMessagesPage() {
  const router=useRouter();
  const [mailbox,setMailbox]=useState<any>(null);
  const [messageTargets,setMessageTargets]=useState<any[]>([]);
  const [rows,setRows]=useState<any[]>([]);
  const [active,setActive]=useState('');
  const [messages,setMessages]=useState<any[]>([]);
  const [team,setTeam]=useState('');
  const [draft,setDraft]=useState('');
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [sending,setSending]=useState(false);
  const [opening,setOpening]=useState('');
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');

  async function load(showSpinner=true){
    if(showSpinner)setLoading(true);else setRefreshing(true);
    setError('');
    try{
      const response=await fetch('/api/staff/messages',{cache:'no-store'});
      if(response.status===401){router.replace('/staff/login');return;}
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to load messages.');
      setMailbox(data.mailbox);
      setMessageTargets(data.messageTargets||[]);
      setRows(data.conversations||[]);
      if(active&&!(data.conversations||[]).some((row:any)=>row.id===active))setActive('');
    }catch(e){setError(e instanceof Error?e.message:'Unable to load messages.');}
    finally{setLoading(false);setRefreshing(false);}
  }

  async function openConversation(id:string){
    setOpening(id);setError('');
    try{
      const response=await fetch('/api/staff/messages/'+encodeURIComponent(id),{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to open conversation.');
      setActive(id);setMessages(data.messages||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to open conversation.');}
    finally{setOpening('');}
  }

  useEffect(()=>{void load();},[router]);
  useEffect(()=>{
    const desired=new URLSearchParams(window.location.search).get('conversation');
    if(desired)void openConversation(desired);
  },[]);

  async function sendNew(event:FormEvent){
    event.preventDefault();
    const message=draft.trim();
    if(!team||!message)return;
    setSending(true);setError('');setSaved('');
    try{
      const response=await fetch('/api/staff/messages',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({team,message})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to send.');
      setTeam('');setDraft('');setSaved('Message sent.');
      await load(false);
      await openConversation(data.conversation.id);
    }catch(e){setError(e instanceof Error?e.message:'Unable to send.');}
    finally{setSending(false);}
  }

  async function reply(event:FormEvent){
    event.preventDefault();
    const message=draft.trim();
    if(!active||!message)return;
    setSending(true);setError('');setSaved('');
    try{
      const response=await fetch('/api/staff/messages/'+encodeURIComponent(active),{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({message})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to send.');
      setMessages((current)=>[...current,data.message]);
      setDraft('');
      setSaved('Message sent.');
      await load(false);
    }catch(e){setError(e instanceof Error?e.message:'Unable to send.');}
    finally{setSending(false);}
  }

  const activeRow=rows.find((row)=>row.id===active)||null;
  const unread=rows.filter((row)=>row.unread).length;

  return <main className="staff-page--workforce">
    <div className="staff-page-inner">
      <header className="staff-workforce-header">
        <div>
          <p className="staff-eyebrow">Internal communication</p>
          <h1 className="staff-page-title">Messages</h1>
          <p className="staff-page-subtitle">Message the right CONAGS team directly. Choose Admin, Management or Recruitment from the dropdown below, then track the conversation here.</p>
        </div>
        <div className="staff-workforce-actions">
          {mailbox?.address&&<span className="staff-badge" title="Your internal CONAGS mailbox">{mailbox.address}</span>}
          {unread>0&&<span className="staff-badge staff-badge--attention">{unread} unread</span>}
          <button className="staff-action" onClick={()=>void load(false)} disabled={refreshing}>{refreshing?'Refreshing...':'Refresh'}</button>
        </div>
      </header>

      {error&&<div role="alert" className="staff-workforce-card" style={{marginBottom:12,color:'#991b1b',borderColor:'#f3cccc'}}>{error}</div>}
      {saved&&<div role="status" className="staff-workforce-card" style={{marginBottom:12,color:'#166534',borderColor:'#b7ead0',background:'#f8fffc'}}>{saved}</div>}

      <section className="staff-messages-layout">
        <aside className="staff-message-list" aria-label="Conversations">
          <form onSubmit={sendNew} className="staff-workforce-card" style={{padding:13,marginBottom:10}}>
            <p className="staff-eyebrow">New conversation</p>
            <div style={{fontSize:16,fontWeight:900,marginBottom:5}}>Message a CONAGS team</div>
            <p style={{margin:'0 0 11px',color:'var(--muted)',fontSize:12,lineHeight:1.5}}>Your message goes to the selected team inbox. You do not need to know an email address.</p>
            <label className="staff-form-field">
              <span className="staff-form-label">Who should receive this?</span>
              <select className="staff-form-input" value={team} onChange={(event)=>setTeam(event.target.value)} aria-label="Message recipient team">
                <option value="">Choose a team…</option>
                {messageTargets.map((target)=> <option key={target.key} value={target.key}>{target.label}</option>)}
              </select>
            </label>
            {team && messageTargets.find((target)=>target.key===team)?.description && <div style={{marginTop:7,padding:'8px 10px',borderRadius:10,background:'var(--soft)',color:'var(--muted)',fontSize:11,lineHeight:1.45}}>{messageTargets.find((target)=>target.key===team)?.description}</div>}
            <label className="staff-form-field" style={{marginTop:9}}><span className="staff-form-label">Message</span><textarea className="staff-form-input" value={draft} onChange={(event)=>setDraft(event.target.value)} rows={4} maxLength={10000} placeholder="Tell the team what you need help with…" /></label>
            <button className="staff-action-primary" disabled={sending||!team||!draft.trim()} style={{width:'100%',marginTop:9}}>{sending?'Sending...':'Send message'}</button>
          </form>

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 4px 8px'}}>
            <strong style={{fontSize:12}}>Conversations</strong>
            <span style={{fontSize:10,color:'var(--muted)'}}>{rows.length}</span>
          </div>

          {loading?<div className="staff-empty">Loading conversations...</div>:!rows.length?<div className="staff-empty">No conversations yet. Choose Admin, Management or Recruitment above to start a conversation.</div>:rows.map((row)=><button key={row.id} className={'staff-message-list-item'+(active===row.id?' is-active':'')} onClick={()=>void openConversation(row.id)} disabled={opening===row.id}>
            <div style={{display:'flex',justifyContent:'space-between',gap:8}}><span className="staff-message-list-name">{row.other?.full_name||row.other?.display||'CONAGS Admin'}</span>{row.unread&&<span className="staff-badge staff-badge--attention" style={{minHeight:22,padding:'3px 7px'}}>New</span>}</div>
            {row.other?.job_title&&<div className="staff-message-list-preview">{row.other.job_title}</div>}
            {row.latest?.body&&<div className="staff-message-list-preview">{row.latest.body}</div>}
          </button>)}
        </aside>

        <section className="staff-message-pane" aria-label="Conversation">
          {!active ? <div style={{margin:'auto',padding:28,textAlign:'center',color:'var(--muted)'}}>
            <div style={{fontSize:18,fontWeight:900,color:'var(--ink)'}}>Select a conversation</div>
            <p style={{maxWidth:430,lineHeight:1.6}}>Choose a conversation from the list or start a new message to Admin, Management or Recruitment.</p>
          </div> : <>
            <header className="staff-message-pane-header">
              <div className="staff-eyebrow">Conversation</div>
              <strong>{activeRow?.other?.full_name||activeRow?.other?.display||'CONAGS Admin'}</strong>
              {activeRow?.other?.job_title&&<div style={{marginTop:3,color:'var(--muted)',fontSize:12}}>{activeRow.other.job_title}</div>}
            </header>
            <div className="staff-message-stream" aria-live="polite">
              {!messages.length&&<div style={{margin:'auto',color:'var(--muted)'}}>No messages in this conversation yet.</div>}
              {messages.map((message)=>{const fromStaff=Boolean(message.sender_staff_id);return <article key={message.id} className={'staff-message-bubble '+(fromStaff?'is-staff':'is-admin')}>
                <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{message.body}</div>
                <div className="staff-message-meta">{new Date(message.created_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</div>
              </article>;})}
            </div>
            <form onSubmit={reply} className="staff-message-composer">
              <textarea value={draft} onChange={(event)=>setDraft(event.target.value)} rows={2} maxLength={10000} placeholder="Write a reply..." aria-label="Message reply" />
              <button className="staff-action-primary" disabled={sending||!draft.trim()} aria-busy={sending}>{sending?'Sending...':'Send'}</button>
            </form>
          </>}
        </section>
      </section>
    </div>
  </main>;
}
