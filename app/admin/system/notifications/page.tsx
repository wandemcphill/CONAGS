'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Delivery = { id:string; event_type:string; entity_id:string|null; channel:string; status:string; attempt_count:number; provider_id:string|null; last_error:string|null; last_attempt_at:string|null; sent_at:string|null; created_at:string; updated_at:string; recoverable:boolean; };

function formatDate(value:string|null){return value?new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Not set';}

export default function NotificationRecoveryPage(){
  const [deliveries,setDeliveries]=useState<Delivery[]>([]);
  const [status,setStatus]=useState('failed');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/admin/notifications?status='+encodeURIComponent(status),{cache:'no-store'});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Unable to load notifications.');
      setDeliveries(body.deliveries||[]);
    }catch(err){setError(err instanceof Error?err.message:'Unable to load notifications.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[status]);
  async function retry(id:string){
    setBusy(id);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/notifications',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,action:'retry'})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Unable to retry notification.');
      setNotice(body.recovery?.status==='sent'?'Replacement notification sent successfully.':body.recovery?.status==='not_configured'?'Recovery ran but email provider configuration is still missing.':'Recovery completed without confirmed delivery.');
      await load();
    }catch(err){setError(err instanceof Error?err.message:'Unable to retry notification.');}
    finally{setBusy('');}
  }
  return <main className="wrap" style={{padding:'34px 0 80px',maxWidth:1100}}>
    <Link href="/admin" style={{color:'var(--muted)',textDecoration:'none'}}>← Recruiter workspace</Link>
    <header style={{margin:'18px 0 24px'}}><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em'}}>COMMUNICATION CONTROL</p><h1>Notification Recovery</h1><p style={{color:'var(--muted)',maxWidth:760}}>Failed critical deliveries stay visible without exposing message payloads or access tokens. Replay is available only where CONAGS can safely mint a replacement credential and reconstruct the message.</p></header>
    {error&&<div role="alert" className="card" style={{padding:14,marginBottom:14,color:'#8a2323'}}>{error}</div>}
    {notice&&<div role="status" className="card" style={{padding:14,marginBottom:14,color:'#176b4f'}}>{notice}</div>}
    <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}><select value={status} onChange={e=>setStatus(e.target.value)} style={{padding:10,border:'1px solid var(--line)',borderRadius:9}}><option value="failed">Failed</option><option value="sent">Sent</option><option value="not_configured">Not configured</option><option value="retrying">Retrying</option><option value="all">All</option></select><button onClick={()=>void load()} disabled={loading} style={{background:'var(--ink)',color:'#fff',border:0,padding:'10px 14px',borderRadius:9,fontWeight:800}}>{loading?'Loading…':'Refresh'}</button></div>
    <section style={{display:'grid',gap:10}}>{loading?<div className="card" style={{padding:20}}>Loading delivery history…</div>:deliveries.length===0?<div className="card" style={{padding:20}}>No notification deliveries in this view.</div>:deliveries.map(item=><article key={item.id} className="card" style={{padding:18}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><strong>{item.event_type}</strong><div style={{color:'var(--muted)',fontSize:13,marginTop:3}}>Workflow object: {item.entity_id||'Not linked'} · Attempts: {item.attempt_count}</div></div><span style={{padding:'5px 8px',borderRadius:999,background:item.status==='failed'?'#fff4e5':'#edf2f7',fontSize:11,fontWeight:900}}>{item.status.toUpperCase()}</span></div>{item.last_error&&<div style={{marginTop:9,color:'#7c2d12',fontSize:13}}>Last provider error: {item.last_error}</div>}<div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap',marginTop:10}}><div style={{color:'var(--muted)',fontSize:12}}>Last attempt {formatDate(item.last_attempt_at)} · Created {formatDate(item.created_at)}</div>{item.status==='failed'&&<button disabled={busy===item.id||!item.recoverable} onClick={()=>void retry(item.id)} style={{background:'var(--ink)',color:'#fff',border:0,padding:'9px 12px',borderRadius:8,fontWeight:800}}>{busy===item.id?'Recovering…':item.recoverable?'Retry safely':'No safe replay'}</button>}</div></article>)}</section>
  </main>;
}
