'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StaffAction, StaffBadge, StaffLoading, StaffNotice, StaffPage, StaffPageHeader, StaffPageInner, StaffPanel, StaffSectionHeader } from '@/components/StaffPortalUI';

type DocumentRow = { id:string; category:string; title:string; description:string|null; signature_status:string; issuer_name:string; issuer_title:string; issued_at:string };
function issued(v:string){ return new Date(v).toLocaleDateString('en-GB',{dateStyle:'medium'}); }
export default function StaffDocumentsPage(){
  const router=useRouter();
  const [rows,setRows]=useState<DocumentRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  async function load(){
    setLoading(true); setError('');
    try{
      const r=await fetch('/api/staff/documents',{cache:'no-store'});
      if(r.status===401){router.replace('/staff/login');return;}
      const b=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(b.error||'Unable to load documents.');
      setRows(b.documents||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load documents.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[router]);
  const pending=useMemo(()=>rows.filter(x=>x.signature_status==='pending').length,[rows]);
  const signed=useMemo(()=>rows.filter(x=>x.signature_status==='signed').length,[rows]);
  if(loading) return <StaffLoading label="Loading employment documents…"/>;
  return <StaffPage className="staff-page--documents"><StaffPageInner>
    <StaffPageHeader eyebrow="Employment records" title="My Documents" subtitle="Contracts, job descriptions, policies and other records issued to your staff account." actions={<><StaffAction onClick={()=>void load()}>Refresh</StaffAction><StaffAction href="/staff/onboarding" primary>Onboarding</StaffAction></>}/>
    {error && <StaffNotice tone="danger"><strong>Documents unavailable</strong><p>{error}</p><StaffAction onClick={()=>void load()}>Try again</StaffAction></StaffNotice>}
    {!error && <>
      <div className="staff-stat-grid staff-document-stats"><div className="staff-stat"><div className="staff-stat-value">{rows.length}</div><div className="staff-stat-label">Documents available</div></div><div className="staff-stat"><div className="staff-stat-value">{pending}</div><div className="staff-stat-label">Signatures required</div></div><div className="staff-stat"><div className="staff-stat-value">{signed}</div><div className="staff-stat-label">Signed copies</div></div></div>
      {!rows.length ? <StaffPanel><StaffSectionHeader title="Your document centre is ready" copy="No employment documents have been issued to your portal yet. Newly issued records will appear here."/><div className="staff-empty">There is nothing you need to download right now.</div></StaffPanel> :
      <StaffPanel><StaffSectionHeader title="Employment record" copy="Open a document to review its contents. Documents needing your signature are brought to the front of your workflow."/><div className="staff-document-list">
        {rows.map(row=><article className="staff-document-card" key={row.id}>
          <div className="staff-document-main"><div className="staff-document-icon" aria-hidden="true">{row.category==='employment_contract'?'C':row.category==='job_description'?'J':'D'}</div><div className="staff-document-copy"><div className="staff-document-topline"><span className="staff-document-category">{row.category.replaceAll('_',' ')}</span><StaffBadge tone={row.signature_status==='pending'?'attention':row.signature_status==='signed'?'live':'neutral'}>{row.signature_status==='pending'?'Signature required':row.signature_status==='signed'?'Signed':'Available'}</StaffBadge></div><h3>{row.title}</h3>{row.description&&<p>{row.description}</p>}<div className="staff-document-meta">Issued {issued(row.issued_at)} · {row.issuer_name}, {row.issuer_title}</div></div></div>
          <div className="staff-document-actions"><StaffAction href={'/staff/documents/' + encodeURIComponent(row.id)}>{row.signature_status==='pending'?'Review & sign online':'Open document'}</StaffAction>{row.signature_status==='signed'&&<StaffAction href={'/api/staff/documents/' + encodeURIComponent(row.id) + '/download'}>Download signed copy</StaffAction>}</div>
        </article>)}
      </div></StaffPanel>}
    </>}
  </StaffPageInner></StaffPage>;
}
