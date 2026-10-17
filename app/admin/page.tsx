'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lauremCompany } from '@/lib/laurem-company-config';
import { LAUREM_CANONICAL_ROLES } from '@/lib/laurem-role-policy';
import AdminBulkInvites from '@/components/AdminBulkInvites';

type Application = { id:string; full_name:string; email:string; phone:string|null; role_applied:string; country_of_residence:string|null; living_in_uk:string|null; status:string; created_at:string; updated_at:string };
type InviteForm = { candidateName:string; candidateEmail:string; role:string };
type InviteResult = { link:string; email?:{status?:string;error?:string}; invite?:{expires_at?:string} };
const initialInvite:InviteForm={candidateName:'',candidateEmail:'',role:'Support Worker'};

export default function AdminPage(){
  const router=useRouter();
  const [applications,setApplications]=useState<Application[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [loggingOut,setLoggingOut]=useState(false);
  const [inviteForm,setInviteForm]=useState<InviteForm>(initialInvite);
  const [inviteBusy,setInviteBusy]=useState(false);
  const [inviteError,setInviteError]=useState<string|null>(null);
  const [inviteResult,setInviteResult]=useState<InviteResult|null>(null);
  const [unreadMessages,setUnreadMessages]=useState<number|null>(null);

  async function load(){
    try{
      const [applicationsResponse,messagesResponse]=await Promise.all([
        fetch('/api/admin/applications',{cache:'no-store'}),
        fetch('/api/admin/messages',{cache:'no-store'}),
      ]);
      const applicationsPayload=await applicationsResponse.json().catch(()=>({}));
      if(!applicationsResponse.ok)throw new Error(applicationsPayload.error||'Unable to load applications');
      setApplications(applicationsPayload.applications||[]);
      if(messagesResponse.ok){const messagesPayload=await messagesResponse.json().catch(()=>({}));setUnreadMessages(Number(messagesPayload.unreadCount||0));}
      else setUnreadMessages(null);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load applications');}
  }
  async function createInvite(){setInviteBusy(true);setInviteError(null);setInviteResult(null);try{const response=await fetch('/api/admin/invites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(inviteForm)});const payload=await response.json().catch(()=>({}));if(response.status===401){router.replace('/admin/login');return;}if(!response.ok)throw new Error(payload.error||'Unable to create invitation.');setInviteResult(payload as InviteResult);setInviteForm(initialInvite);}catch(e){setInviteError(e instanceof Error?e.message:'Unable to create invitation.');}finally{setInviteBusy(false);}}
  async function logout(){setLoggingOut(true);try{await fetch('/api/admin/logout',{method:'POST'});}finally{router.replace('/admin/login');router.refresh();}}
  useEffect(()=>{void load();},[]);
  const filtered=useMemo(()=>applications.filter((a)=>[a.full_name,a.email,a.role_applied,a.status,a.country_of_residence||''].join(' ').toLowerCase().includes(query.toLowerCase())),[applications,query]);
  const counts=applications.reduce<Record<string,number>>((acc,app)=>{acc[app.status]=(acc[app.status]||0)+1;return acc;},{});

  return <main className="wrap" style={{padding:'40px 0 80px'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'end',flexWrap:'wrap'}}><div><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em'}}>{lauremCompany.tradingName.toUpperCase()} RECRUITMENT</p><h1 style={{margin:'4px 0 8px',fontSize:42}}>Recruiter workspace</h1><p style={{color:'var(--muted)'}}>Private candidate invitations, screening and hiring pipeline.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Link href="/admin/workforce" style={navStyle}>Workforce operations</Link><Link href="/admin/messages" style={{...navStyle,display:'inline-flex',gap:6,alignItems:'center'}}>Messages{typeof unreadMessages==='number'&&unreadMessages>0&&<span style={{padding:'2px 6px',borderRadius:999,background:'#fff4e5',color:'#9a3412',fontSize:10,fontWeight:900}}>{unreadMessages>99?'99+':unreadMessages} NEW</span>}</Link><Link href="/admin/workforce/staff-account" style={navStyle}>Staff account lifecycle</Link><Link href="/admin/operations/exceptions" style={navStyle}>Exception center</Link><Link href="/admin/system/notifications" style={navStyle}>Notification recovery</Link><Link href="/admin/audit" style={navStyle}>Audit timeline</Link><Link href="/admin/data-governance" style={navStyle}>Data governance</Link><Link href="/admin/workforce/documents" style={navStyle}>Employment documents</Link><Link href="/admin/assessments" style={navStyle}>Assessment review</Link><Link href="/admin/system/health" style={navStyle}>System health</Link><Link href="/jobs" style={navStyle}>View careers page</Link><button type="button" onClick={logout} disabled={loggingOut} style={{...navStyle,background:'white',cursor:loggingOut?'wait':'pointer'}}>{loggingOut?'Signing out…':'Sign out'}</button></div></div>
    {error&&<div role="alert" className="card" style={{marginTop:18,padding:16,color:'#8a2323'}}>{error}</div>}
    <section className="card" style={{marginTop:22,padding:24}} aria-labelledby="invite-heading"><div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'start',flexWrap:'wrap'}}><div><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.07em',fontSize:12,margin:0}}>CANDIDATE ACCESS</p><h2 id="invite-heading" style={{margin:'5px 0 7px'}}>Create private invitation</h2><p style={{color:'var(--muted)',lineHeight:1.55,maxWidth:760,margin:0}}>Add the preferred candidate&apos;s name, email and role. CONAGS creates a secure expiring application link and emails it directly to the candidate.</p></div><span style={{padding:'7px 10px',borderRadius:999,background:'var(--soft)',color:'var(--muted)',fontSize:12,fontWeight:700}}>Invitation required</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14,marginTop:18}}><label>Candidate name<input value={inviteForm.candidateName} onChange={(e)=>setInviteForm({...inviteForm,candidateName:e.target.value})} placeholder="Full name" style={{display:'block',width:'100%',marginTop:6,padding:12,border:'1px solid var(--line)',borderRadius:9}} /></label><label>Candidate email<input type="email" value={inviteForm.candidateEmail} onChange={(e)=>setInviteForm({...inviteForm,candidateEmail:e.target.value})} placeholder="candidate@example.com" style={{display:'block',width:'100%',marginTop:6,padding:12,border:'1px solid var(--line)',borderRadius:9}} /></label><label>Role<select value={inviteForm.role} onChange={(e)=>setInviteForm({...inviteForm,role:e.target.value})} style={{display:'block',width:'100%',marginTop:6,padding:12,border:'1px solid var(--line)',borderRadius:9}}>{LAUREM_CANONICAL_ROLES.map((role)=><option key={role}>{role}</option>)}</select></label></div>{inviteError&&<div role="alert" style={{marginTop:14,color:'#8a2323'}}>{inviteError}</div>}<button type="button" onClick={()=>void createInvite()} disabled={inviteBusy||!inviteForm.candidateName.trim()||!inviteForm.candidateEmail.trim()} style={{marginTop:16,background:'var(--ink)',color:'white',border:0,padding:'12px 18px',borderRadius:9,fontWeight:800,cursor:inviteBusy?'wait':'pointer'}}>{inviteBusy?'Creating invitation…':'Create and email invitation'}</button>{inviteResult&&<div className="card" style={{marginTop:16,padding:16,background:'var(--soft)'}}><strong>{inviteResult.email?.status==='sent'?'Invitation emailed successfully':'Invitation created, email needs attention'}</strong><p style={{color:'var(--muted)',margin:'7px 0'}}>{inviteResult.email?.status==='sent'?'The candidate can continue only through the private link sent to their email.':(inviteResult.email?.error||('Email status: '+(inviteResult.email?.status||'unknown')))}</p><p style={{wordBreak:'break-all',margin:'8px 0'}}>{inviteResult.link}</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" onClick={()=>navigator.clipboard.writeText(inviteResult.link)} style={{border:'1px solid var(--line)',padding:'9px 12px',borderRadius:8,background:'white',fontWeight:700}}>Copy private link</button></div></div>}</section>
    <AdminBulkInvites />
    <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'26px 0'}}>{Object.entries(counts).map(([status,count])=><button key={status} type="button" onClick={()=>setQuery(status)} className="card" style={{padding:'12px 16px',cursor:'pointer',border:'1px solid var(--line)',background:'white'}}><strong>{count}</strong><span style={{marginLeft:8,color:'var(--muted)'}}>{status}</span></button>)}</div>
    <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search applicants, roles, location or status" style={{width:'100%',padding:13,border:'1px solid var(--line)',borderRadius:10,marginBottom:14}} />
    <div style={{display:'grid',gap:10}}>{filtered.map((app)=><article className="card" key={app.id} style={{padding:20}}><div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}><div><h2 style={{margin:0,fontSize:20}}>{app.full_name}</h2><div style={{color:'var(--muted)',marginTop:5}}>{app.role_applied} · {app.email}</div>{app.country_of_residence&&<div style={{color:'var(--muted)',marginTop:3}}>{app.country_of_residence} {app.living_in_uk==='No'?'· International':'· UK'}</div>}</div><div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{padding:'7px 10px',borderRadius:999,background:'var(--soft)',fontSize:12,fontWeight:800}}>{app.status}</span><Link href={'/admin/applications/'+app.id} style={{border:'1px solid var(--line)',padding:'8px 11px',borderRadius:9,textDecoration:'none',fontWeight:700}}>Open Candidate 360</Link></div></div></article>)}</div>
  </main>;
}

const navStyle={textDecoration:'none',border:'1px solid var(--line)',padding:'10px 14px',borderRadius:9,fontWeight:700};
