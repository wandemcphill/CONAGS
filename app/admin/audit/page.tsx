'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Event = {
  id:string;
  lifecycle_area:string;
  entity_type:string|null;
  entity_id:string|null;
  application_id:string|null;
  staff_id:string|null;
  actor_type:string;
  actor:string;
  action:string;
  previous_state:string|null;
  new_state:string|null;
  reason:string|null;
  metadata:Record<string, unknown>;
  occurred_at:string;
  staff?:{id:string;full_name:string;employee_number:string;job_title:string}|null;
  application?:{id:string;full_name:string;role_applied:string|null;status:string}|null;
};

const areas=['all','recruitment','evidence','contract','onboarding','workforce','payroll'];

function fmt(value:string){ return new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}); }

export default function AdminAuditPage(){
  const [events,setEvents]=useState<Event[]>([]);
  const [area,setArea]=useState('all');
  const [action,setAction]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  async function load(){
    setLoading(true); setError('');
    try{
      const p=new URLSearchParams();
      if(area!=='all') p.set('area',area);
      if(action.trim()) p.set('action',action.trim());
      p.set('limit','500');
      const response=await fetch('/api/admin/audit?'+p.toString(),{cache:'no-store'});
      const body=await response.json();
      if(!response.ok) throw new Error(body.error||'Unable to load audit history.');
      setEvents(body.events||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load audit history.');}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[area]);

  return <main className="wrap" style={{padding:'30px 0 80px',maxWidth:1220}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-end',flexWrap:'wrap'}}>
      <div>
        <Link href="/admin" style={{color:'var(--muted)',textDecoration:'none'}}>← Recruiter workspace</Link>
        <p style={{color:'var(--accent)',fontWeight:900,letterSpacing:'.08em',margin:'18px 0 6px'}}>CONTROL & ACCOUNTABILITY</p>
        <h1 style={{margin:0,fontSize:42}}>Audit timeline</h1>
        <p style={{margin:'8px 0 0',color:'var(--muted)',maxWidth:780}}>One chronological history across recruitment, evidence, contracts, onboarding, workforce and payroll. Historical source records remain intact.</p>
      </div>
      <button onClick={()=>void load()} style={primary}>Refresh</button>
    </div>

    {error&&<div role="alert" className="card" style={{padding:14,marginTop:16,color:'#8a2323'}}>{error}</div>}

    <section className="card" style={{padding:14,marginTop:18}}>
      <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
        <label style={label}>Area<select value={area} onChange={e=>setArea(e.target.value)} style={input}>{areas.map(v=><option key={v}>{v}</option>)}</select></label>
        <label style={{...label,flex:'1 1 260px'}}>Action contains<input value={action} onChange={e=>setAction(e.target.value)} placeholder="e.g. status_changed" style={input}/></label>
        <button onClick={()=>void load()} style={secondary}>Apply</button>
      </div>
    </section>

    <section style={{marginTop:16,display:'grid',gap:10}}>
      {loading&&<div className="card" style={{padding:20}}>Loading canonical audit history…</div>}
      {!loading&&!events.length&&<div className="card" style={{padding:20,color:'var(--muted)'}}>No matching audit events.</div>}
      {!loading&&events.map(event=><article key={event.id} className="card" style={{padding:18}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap',alignItems:'flex-start'}}>
          <div style={{minWidth:0,flex:'1 1 650px'}}>
            <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
              <Badge text={event.lifecycle_area}/>
              <Badge text={event.actor_type}/>
              <span style={{fontSize:11,fontWeight:900,color:'var(--muted)'}}>{event.action}</span>
            </div>
            <h2 style={{margin:'8px 0 4px',fontSize:20}}>{event.entity_type||'Audit event'}</h2>
            <div style={{color:'var(--muted)',fontSize:13}}>{fmt(event.occurred_at)} · {event.actor}</div>
            {(event.previous_state||event.new_state)&&<div style={{marginTop:10,fontWeight:800}}>{event.previous_state||'∅'} → {event.new_state||'∅'}</div>}
            {event.reason&&<p style={{margin:'10px 0 0',color:'var(--muted)'}}>Reason: {event.reason}</p>}
            {!!Object.keys(event.metadata||{}).length&&<pre style={pre}>{JSON.stringify(event.metadata,null,2)}</pre>}
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
            {event.application_id&&<Link href={`/admin/applications/${encodeURIComponent(event.application_id)}`} style={secondary}>Candidate 360</Link>}
            {event.staff_id&&<Link href={`/admin/workforce/${encodeURIComponent(event.staff_id)}`} style={secondary}>Staff 360</Link>}
          </div>
        </div>
      </article>)}
    </section>
  </main>;
}

function Badge({text}:{text:string}){return <span style={{padding:'6px 9px',borderRadius:999,background:'var(--soft)',fontSize:11,fontWeight:900,textTransform:'uppercase'}}>{text}</span>;}
const primary={background:'var(--ink)',color:'#fff',border:0,padding:'10px 14px',borderRadius:9,fontWeight:900,cursor:'pointer'} as const;
const secondary={background:'#fff',color:'var(--ink)',border:'1px solid var(--line)',padding:'9px 12px',borderRadius:9,fontWeight:800,textDecoration:'none',cursor:'pointer'} as const;
const label={display:'grid',gap:5,fontSize:11,fontWeight:900,color:'var(--muted)'} as const;
const input={border:'1px solid var(--line)',borderRadius:9,padding:'9px 10px',font:'inherit',minWidth:150} as const;
const pre={whiteSpace:'pre-wrap',fontSize:11,background:'#f7fafc',border:'1px solid var(--line)',borderRadius:9,padding:10,marginTop:10,overflowX:'auto'} as const;
