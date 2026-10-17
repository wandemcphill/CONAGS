'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Policy={id:string;rule_key:string;area:string;title:string;description:string;owner_role:string;retention_days:number|null;action:string;requires_approval:boolean;active:boolean};
type Finding={id:string;finding_type:string;severity:'critical'|'high'|'medium'|'low';rule_key:string|null;subject_type:string;subject_id:string|null;application_id:string|null;staff_id:string|null;title:string;detail:string;status:'open'|'acknowledged'|'held'|'resolved';last_detected_at:string;resolution_note:string|null};
type Request={id:string;request_type:'export'|'deletion_review';subject_type:'application'|'staff';application_id:string|null;staff_id:string|null;requested_by:string;reason:string|null;status:'requested'|'approved'|'on_hold'|'completed'|'rejected';requested_at:string;reviewed_by:string|null;completed_at:string|null;resolution_note:string|null;manifest:any};

const badge=(value:string)=>({padding:'6px 9px',borderRadius:999,background:'var(--soft)',fontSize:11,fontWeight:900,textTransform:'uppercase'} as const);
const button=(solid=false)=>({background:solid?'var(--ink)':'#fff',color:solid?'#fff':'var(--ink)',border:solid?'0':'1px solid var(--line)',padding:'9px 12px',borderRadius:9,fontWeight:800,cursor:'pointer'} as const);
function fmt(v:string){return new Date(v).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});}

export default function DataGovernancePage(){
  const [policies,setPolicies]=useState<Policy[]>([]);
  const [findings,setFindings]=useState<Finding[]>([]);
  const [requests,setRequests]=useState<Request[]>([]);
  const [tab,setTab]=useState<'findings'|'policies'|'requests'>('findings');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(){
    setLoading(true);setError('');
    try{
      const r=await fetch('/api/admin/data-governance',{cache:'no-store'});
      const b=await r.json();
      if(!r.ok)throw new Error(b.error||'Unable to load data governance.');
      setPolicies(b.policies||[]);setFindings(b.findings||[]);setRequests(b.requests||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load data governance.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  async function change(kind:'finding'|'request',id:string,nextStatus:string){
    const reason=window.prompt('Reason for '+nextStatus.replaceAll('_',' ')+'?')?.trim()||'';
    if(!reason)return;
    setNotice('');setError('');
    const r=await fetch('/api/admin/data-governance',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({kind,id,status:nextStatus,reason})});
    const b=await r.json();
    if(!r.ok){setError(b.error||'Unable to update governance item.');return;}
    setNotice('Marked '+nextStatus.replaceAll('_',' ')+'.');
    await load();
  }

  async function createRequest(requestType:'export'|'deletion_review'){
    const subjectType=(window.prompt('Subject type: application or staff')||'').trim();
    const subjectId=(window.prompt('Subject ID')||'').trim();
    const reason=(window.prompt('Reason for '+requestType.replace('_',' ')+'?')||'').trim();
    if(!['application','staff'].includes(subjectType)||!subjectId||!reason)return;
    const r=await fetch('/api/admin/data-governance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestType,subjectType,subjectId,reason})});
    const b=await r.json();
    if(!r.ok){setError(b.error||'Unable to create data request.');return;}
    setNotice('Created '+requestType.replace('_',' ')+' request.');
    await load();
  }

  const openCount=useMemo(()=>findings.filter(f=>f.status!=='resolved').length,[findings]);
  const critical=useMemo(()=>findings.filter(f=>f.status!=='resolved'&&f.severity==='critical').length,[findings]);

  return <main className="wrap" style={{padding:'30px 0 80px',maxWidth:1240}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-end',flexWrap:'wrap'}}>
      <div>
        <Link href="/admin" style={{color:'var(--muted)',textDecoration:'none'}}>← Recruiter workspace</Link>
        <p style={{color:'var(--accent)',fontWeight:900,letterSpacing:'.08em',margin:'18px 0 6px'}}>DATA PROTECTION CONTROL</p>
        <h1 style={{margin:0,fontSize:42}}>Data Governance Center</h1>
        <p style={{margin:'8px 0 0',color:'var(--muted)',maxWidth:820}}>Explicit retention ownership, orphan detection, controlled data requests and recoverable review states. Destructive deletion is never automatic.</p>
      </div>
      <button onClick={()=>void load()} style={button(true)}>Run governance scan</button>
    </div>

    {error&&<div role="alert" className="card" style={{padding:14,marginTop:16,color:'#8a2323'}}>{error}</div>}
    {notice&&<div role="status" className="card" style={{padding:14,marginTop:16,color:'#176b4f'}}>{notice}</div>}

    <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:18}}>
      <Metric label="Open findings" value={openCount}/><Metric label="Critical" value={critical}/><Metric label="Policies" value={policies.length}/><Metric label="Requests" value={requests.length}/>
    </section>

    <nav className="card" style={{padding:6,marginTop:16,display:'flex',gap:5,overflowX:'auto'}}>
      {(['findings','policies','requests'] as const).map(v=><button key={v} onClick={()=>setTab(v)} style={{...button(false),background:tab===v?'var(--ink)':'#fff',color:tab===v?'#fff':'var(--ink)'}}>{v}</button>)}
    </nav>

    {loading?<div className="card" style={{padding:20,marginTop:16}}>Scanning governance controls…</div>:
    tab==='findings'?<section style={{display:'grid',gap:10,marginTop:16}}>
      {findings.filter(f=>f.status!=='resolved').map(f=><article className="card" key={f.id} style={{padding:18}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
          <div style={{flex:'1 1 650px'}}>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}><span style={badge(f.severity)}>{f.severity}</span><span style={badge(f.finding_type)}>{f.finding_type}</span><span style={badge(f.status)}>{f.status}</span></div>
            <h2 style={{margin:'9px 0 5px',fontSize:20}}>{f.title}</h2>
            <p style={{margin:0,color:'var(--muted)'}}>{f.detail}</p>
            <div style={{marginTop:8,color:'var(--muted)',fontSize:12}}>Detected {fmt(f.last_detected_at)} · Rule {f.rule_key||'unassigned'}</div>
          </div>
          <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
            {f.application_id&&<Link href={'/admin/applications/'+encodeURIComponent(f.application_id)} style={button(false)}>Candidate 360</Link>}
            {f.staff_id&&<Link href={'/admin/workforce/'+encodeURIComponent(f.staff_id)} style={button(false)}>Staff 360</Link>}
            {f.status==='open'&&<button onClick={()=>void change('finding',f.id,'acknowledged')} style={button(false)}>Acknowledge</button>}
            {['open','acknowledged'].includes(f.status)&&<button onClick={()=>void change('finding',f.id,'held')} style={button(false)}>Place on hold</button>}
            {['acknowledged','held'].includes(f.status)&&<button onClick={()=>void change('finding',f.id,'resolved')} style={button(false)}>Resolve</button>}
            {f.status!=='open'&&<button onClick={()=>void change('finding',f.id,'open')} style={button(false)}>Reopen</button>}
          </div>
        </div>
      </article>)}
      {!findings.filter(f=>f.status!=='resolved').length&&<div className="card" style={{padding:22,color:'var(--muted)'}}>No active governance findings.</div>}
    </section>:
    tab==='policies'?<section style={{display:'grid',gap:10,marginTop:16}}>
      {policies.map(p=><article className="card" key={p.id} style={{padding:18}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}><div><span style={badge(p.area)}>{p.area}</span><h2 style={{margin:'8px 0 5px'}}>{p.title}</h2><p style={{margin:0,color:'var(--muted)'}}>{p.description}</p><div style={{marginTop:9,fontSize:12,color:'var(--muted)'}}>Owner: <strong>{p.owner_role}</strong> · Action: <strong>{p.action}</strong> · Window: <strong>{p.retention_days==null?'Not configured':'configured'}</strong></div></div><span style={badge(p.requires_approval?'approval required':'standard')}>{p.requires_approval?'approval required':'standard'}</span></div>
      </article>)}
    </section>:
    <section style={{marginTop:16}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><button onClick={()=>void createRequest('export')} style={button(true)}>New metadata export request</button><button onClick={()=>void createRequest('deletion_review')} style={button(false)}>New deletion review request</button></div>
      <div style={{display:'grid',gap:10}}>
        {requests.map(r=><article className="card" key={r.id} style={{padding:18}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><span style={badge(r.request_type)}>{r.request_type.replace('_',' ')}</span><span style={badge(r.status)}>{r.status}</span></div><h2 style={{margin:'8px 0 4px',fontSize:18}}>{r.subject_type} · {r.application_id||r.staff_id}</h2><div style={{color:'var(--muted)',fontSize:12}}>Requested by {r.requested_by} on {fmt(r.requested_at)}</div><p style={{margin:'9px 0 0',color:'var(--muted)'}}>{r.reason||'No reason provided.'}</p></div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{r.status==='requested'&&<><button onClick={()=>void change('request',r.id,'approved')} style={button(true)}>Approve</button><button onClick={()=>void change('request',r.id,'on_hold')} style={button(false)}>Hold</button><button onClick={()=>void change('request',r.id,'rejected')} style={button(false)}>Reject</button></>}{r.status==='approved'&&<button onClick={()=>void change('request',r.id,'completed')} style={button(false)}>Mark completed</button>}{['on_hold','rejected','completed'].includes(r.status)&&<button onClick={()=>void change('request',r.id,'requested')} style={button(false)}>Reopen</button>}</div>
          </div>
          {r.manifest&&Object.keys(r.manifest).length>0&&<pre style={pre}>{JSON.stringify(r.manifest,null,2)}</pre>}
        </article>)}
        {!requests.length&&<div className="card" style={{padding:22,color:'var(--muted)'}}>No data access requests yet.</div>}
      </div>
    </section>}
  </main>;
}

function Metric({label,value}:{label:string;value:number}){return <article className="card" style={{padding:16}}><div style={{fontSize:28,fontWeight:900}}>{value}</div><div style={{marginTop:3,color:'var(--muted)',fontSize:12}}>{label}</div></article>;}
const pre={whiteSpace:'pre-wrap',fontSize:11,background:'#f7fafc',border:'1px solid var(--line)',borderRadius:9,padding:10,marginTop:12,overflowX:'auto'} as const;
