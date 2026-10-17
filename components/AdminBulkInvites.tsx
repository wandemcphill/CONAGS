'use client';

import { useState } from 'react';

const card = { background:'var(--soft)', border:'1px solid var(--line)', borderRadius:12, padding:16 } as const;

export default function AdminBulkInvites(){
  const [rows,setRows]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [result,setResult]=useState<{summary:{total:number;created:number;rejected:number;failed:number};results:Array<Record<string,unknown>>}|null>(null);

  async function submit(){
    setBusy(true);setMessage('');setResult(null);
    try{
      const response=await fetch('/api/admin/invites/bulk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rows})});
      const body=await response.json();
      if(response.status===401){window.location.assign('/admin/login');return;}
      if(!response.ok)throw new Error(body.error||'Unable to process bulk invitations.');
      setResult(body);setMessage('Bulk invitation run completed.');
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to process bulk invitations.');}
    finally{setBusy(false);}
  }

  return <section className="card" style={{marginTop:22,padding:24}} aria-labelledby="bulk-invite-heading">
    <div><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.07em',fontSize:12,margin:0}}>BULK RECRUITMENT</p><h2 id="bulk-invite-heading" style={{margin:'5px 0 7px'}}>Invite multiple candidates</h2><p style={{color:'var(--muted)',lineHeight:1.55,maxWidth:760,margin:0}}>Paste one candidate per line as <code>name,email,role</code>. Tabs are also accepted. Maximum 25 candidates per run.</p></div>
    <textarea value={rows} onChange={e=>setRows(e.target.value)} rows={8} placeholder={'Jane Doe,jane@example.com,Registered Nurse\nJohn Smith,john@example.com,Support Worker'} style={{width:'100%',marginTop:16,padding:12,border:'1px solid var(--line)',borderRadius:9,fontFamily:'monospace',resize:'vertical'}} />
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:12}}><button type="button" disabled={busy||!rows.trim()} onClick={()=>void submit()} style={{background:'var(--ink)',color:'white',border:0,padding:'12px 18px',borderRadius:9,fontWeight:800,cursor:busy?'wait':'pointer'}}>{busy?'Processing invitations…':'Create and email invitations'}</button><span style={{color:'var(--muted)',fontSize:12}}>Each row gets its own secure expiring invitation.</span></div>
    {message&&<div role="status" style={{marginTop:14,color:result?'var(--ink)':'#8a2323'}}>{message}</div>}
    {result&&<div style={{...card,marginTop:14}}><strong>{result.summary.created} created · {result.summary.rejected} rejected · {result.summary.failed} failed</strong><div style={{display:'grid',gap:7,marginTop:10}}>{result.results.map((item,index)=><div key={index} style={{borderTop:'1px solid var(--line)',paddingTop:8,fontSize:13}}><strong>Row {String(item.row)}</strong> · {String(item.candidateName||'')} · {String(item.email||'')} · {String(item.status)}{item.emailStatus?` · email ${String(item.emailStatus)}`:''}{item.error?` · ${String(item.error)}`:''}</div>)}</div></div>}
  </section>;
}
