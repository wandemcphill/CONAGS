'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { lauremInternationalNurseContractConfig as contractConfig } from '@/lib/laurem-international-nurse-contract-config';
import LauremContractDocument from '@/components/LauremContractDocument';
import { calculateThreeYearContractEndDate, enforceMinimumLauremContractStartDate } from '@/lib/laurem-contract-dates';
import { LAUREM_MINIMUM_CONTRACT_START_DATE } from '@/lib/laurem-role-policy';
import { getLauremSponsorshipOccupation } from '@/lib/laurem-sponsorship-occupation';
import { normalizeLauremRole } from '@/lib/laurem-role-policy';

type Application = { id:string; full_name:string; email:string; role_applied:string; living_in_uk?:string|null; requires_sponsorship?:string|null; start_date?:string|null; address?:string|null };
type ContractResult = { id?:string; status?:string; acceptanceLink?:string; documentPackLink?:string; email?:{status?:string;error?:string}; contract?:{id?:string;status?:string;issued_at?:string|null;viewed_at?:string|null;accepted_at?:string|null;accepted_by_name?:string|null;version?:number|null;job_title?:string|null;contract_content?:string|null;contract_type?:string|null;contract_end_date?:string|null;start_date?:string|null} };

function eligible(app: Application | null) { return Boolean(app); }

export default function InternationalNurseContractPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [application, setApplication] = useState<Application|null>(null);
  const [message, setMessage] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContractResult|null>(null);
  const [form, setForm] = useState({
    startDate: '', contractEndDate: '',
    weeklyHours: String(contractConfig.defaultWeeklyHours), annualSalary: String(contractConfig.defaultAnnualSalaryBenchmark), hourlyRate: '', postRegistrationSalary: String(contractConfig.defaultAnnualSalaryBenchmark), preRegistrationSalary: '',
    visaRoute: contractConfig.defaultVisaRoute, sponsorshipOccupationCode: '', nmcStatus: 'Working towards full NMC registration',
    registrationDeadline: 'Within the period permitted by the applicable immigration rules and NMC process', probation: '6 months',
    noticePeriodEmployee: '1 week during probation and 4 weeks thereafter', noticePeriodEmployer: '1 week during probation and 4 weeks thereafter, or the statutory minimum where greater',
    holidayEntitlement: 'Statutory minimum entitlement plus any more favourable Conags entitlement stated in the offer', pensionScheme: 'Conags workplace pension arrangement for eligible employees',
    workLocations: 'Scotland', relocationSupport: 'As expressly stated in the signed relocation/offer schedule', repayableCosts: '',
    repaymentSchedule: '0–12 months: 100%; 13–24 months: 50%; 25–36 months: 25%; after 36 months: 0%, subject to applicable law and individual circumstances',
  });

  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch('/api/admin/applications',{cache:'no-store'})
      .then(async (r)=>{const p=await r.json();if(!r.ok)throw new Error(p.error||'Unable to load application.');return p;})
      .then(async (p)=>{
        const app=(p.applications||[]).find((a:Application)=>a.id===id)||null;
        setApplication(app);
        if (!app) return;
        const contractResponse=await fetch('/api/admin/contracts?applicationId='+encodeURIComponent(id),{cache:'no-store'});
        const contractPayload=await contractResponse.json().catch(()=>({}));
        if (!contractResponse.ok) throw new Error(contractPayload.error||'Unable to load existing contract.');
        const existing=contractPayload.contract;
        const occupation = getLauremSponsorshipOccupation(app.role_applied);
        const existingStartDate = existing?.start_date || app.start_date || LAUREM_MINIMUM_CONTRACT_START_DATE;
        const safeStartDate = enforceMinimumLauremContractStartDate(existingStartDate);
        setForm((current) => ({
          ...current,
          startDate: safeStartDate,
          contractEndDate: existing?.contract_end_date || calculateThreeYearContractEndDate(safeStartDate) || current.contractEndDate,
          sponsorshipOccupationCode: occupation?.code || '',
        }));
        if (existing) {
          setResult({ id: existing.id, status: existing.status, contract: existing });
          setMessage(existing.status==='draft'
            ? 'A saved contract draft is already available. Review it, then issue the complete offer package.'
            : 'Existing contract status: '+existing.status+'.');
        }
      })
      .catch((e)=>setMessage(e instanceof Error?e.message:'Unable to load application.'));
  },[id]);

  const isEligible=useMemo(()=>eligible(application),[application]);
  const isInternationalNurse = useMemo(
    () => Boolean(
      application
      && normalizeLauremRole(application.role_applied) === 'Registered Nurse'
      && application.living_in_uk === 'No',
    ),
    [application],
  );
  function setField(name:keyof typeof form,value:string){setForm((current)=>({...current,[name]:value}));}

  async function generate(){
    if(!application||!isEligible)return;
    setBusy(true);setMessage(null);setResult(null);
    try{
      const response=await fetch('/api/admin/contracts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        applicationId:application.id,startDate:form.startDate,weeklyHours:Number(form.weeklyHours),annualSalary:Number(form.annualSalary),hourlyRate:form.hourlyRate?Number(form.hourlyRate):undefined,postRegistrationSalary:Number(form.postRegistrationSalary),preRegistrationSalary:form.preRegistrationSalary?Number(form.preRegistrationSalary):undefined,
        visaRoute:isInternationalNurse ? form.visaRoute : undefined,sponsorshipOccupationCode:form.sponsorshipOccupationCode,nmcStatus:isInternationalNurse ? form.nmcStatus : undefined,registrationDeadline:isInternationalNurse ? form.registrationDeadline : undefined,probation:form.probation,
        noticePeriodEmployee:form.noticePeriodEmployee,noticePeriodEmployer:form.noticePeriodEmployer,holidayEntitlement:form.holidayEntitlement,pensionScheme:form.pensionScheme,
        workLocations:form.workLocations.split(',').map(v=>v.trim()).filter(Boolean),relocationSupport:form.relocationSupport,repayableCosts:form.repayableCosts,repaymentSchedule:form.repaymentSchedule,
      })});
      const payload=await response.json(); if(!response.ok)throw new Error(payload.error||'Unable to generate contract.');
      const normalized={...payload,id:payload.id||payload.contract?.id,status:payload.status||payload.contract?.status,contract:payload.contract};
      setResult(normalized);setMessage('Contract draft generated. Review all terms before issuing it to the candidate.');
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to generate contract.');}finally{setBusy(false);}
  }

  async function issue(){
    if(!result?.id)return;
    setBusy(true);setMessage(null);
    try{
      const response=await fetch(`/api/admin/contracts?id=${encodeURIComponent(result.id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'issued'})});
      const payload=await response.json(); if(!response.ok)throw new Error(payload.error||'Unable to issue contract.');
      const normalized={...payload,id:payload.id||payload.contract?.id,status:payload.status||payload.contract?.status,contract:payload.contract};
      setResult(normalized);setMessage(payload.email?.status==='sent'?'Complete offer package issued and emailed to the candidate.':'Complete offer package issued, but email delivery needs attention.');
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to issue contract.');}finally{setBusy(false);}
  }

  if(!application)return <main className="wrap" style={{padding:40}}><p>{message||'Loading candidate...'}</p>{id&&<Link href={`/admin/applications/${encodeURIComponent(id)}`}>Back to candidate</Link>}</main>;
  return <main className="wrap" style={{padding:'34px 0 80px',maxWidth:1000}}>
    <Link href={`/admin/applications/${id}`} style={{color:'var(--muted)',textDecoration:'none'}}>← Candidate file</Link>
    <header style={{margin:'18px 0 24px'}}><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em'}}>CONAGS EMPLOYMENT CONTRACT</p><h1>{application.full_name}</h1><p style={{color:'var(--muted)'}}>{application.role_applied} · {application.email}</p></header>
    {message&&<div role="alert" className="card" style={{padding:14,marginBottom:16}}>{message}</div>}
    {result?.contract?.contract_content && (
      <section className="card" style={{padding:22,marginBottom:16}}>
        <div style={{marginBottom:14}}>
          <h2 style={{margin:'0 0 6px'}}>Contract document</h2>
          <p style={{color:'var(--muted)',lineHeight:1.6,margin:0}}>
            This preview uses the permanent CONAGS letterhead and current document typography, including for contracts issued before the letterhead redesign.
          </p>
        </div>
        <LauremContractDocument
          content={result.contract.contract_content}
          employeeName={application.full_name}
          jobTitle={result.contract.job_title || application.role_applied}
          status={result.contract.status}
          version={result.contract.version}
          acceptedByName={result.contract.accepted_by_name}
          acceptedAt={result.contract.accepted_at}
        />
      </section>
    )}

    <section className="card" style={{padding:22,marginBottom:16}}><h2>Employment terms</h2><div style={grid}>
       <Field label="Employment start date (minimum 23 November 2026)" value={form.startDate} onChange={(v)=>{const safe=enforceMinimumLauremContractStartDate(v);setForm((current)=>({...current,startDate:safe,contractEndDate:calculateThreeYearContractEndDate(safe)||current.contractEndDate}));}} type="date" min={LAUREM_MINIMUM_CONTRACT_START_DATE} />
      <Field label="Contract end date (three-year sponsored term)" value={form.contractEndDate} onChange={(v)=>setField('contractEndDate',v)} type="date" readOnly />
      <Field label="Weekly contracted hours" value={form.weeklyHours} onChange={(v)=>setField('weeklyHours',v)} type="number" />
      <Field label="Annual salary (£, where applicable)" value={form.annualSalary} onChange={(v)=>setField('annualSalary',v)} type="number" />
      <Field label="Hourly rate (£, where applicable)" value={form.hourlyRate} onChange={(v)=>setField('hourlyRate',v)} type="number" />
      <Field label="Probation" value={form.probation} onChange={(v)=>setField('probation',v)} />
      <Field label="Sponsorship occupation code (role-derived)" value={form.sponsorshipOccupationCode} onChange={(v)=>setField('sponsorshipOccupationCode',v)} readOnly />
      {isInternationalNurse && <>
        <Field label="Post-registration salary (£)" value={form.postRegistrationSalary} onChange={(v)=>setField('postRegistrationSalary',v)} type="number" />
        <Field label="Pre-registration salary (£, if applicable)" value={form.preRegistrationSalary} onChange={(v)=>setField('preRegistrationSalary',v)} type="number" />
        <Field label="Visa route" value={form.visaRoute} onChange={(v)=>setField('visaRoute',v)} />
        <Field label="NMC status" value={form.nmcStatus} onChange={(v)=>setField('nmcStatus',v)} />
        <Field label="Registration deadline" value={form.registrationDeadline} onChange={(v)=>setField('registrationDeadline',v)} />
      </>}
      <Field label="Work locations" value={form.workLocations} onChange={(v)=>setField('workLocations',v)} />
    </div></section>
    <section className="card" style={{padding:22,marginBottom:16}}><h2>Leave, pension and notice</h2><div style={grid}>
      <Field label="Employee notice" value={form.noticePeriodEmployee} onChange={(v)=>setField('noticePeriodEmployee',v)} />
      <Field label="Employer notice" value={form.noticePeriodEmployer} onChange={(v)=>setField('noticePeriodEmployer',v)} />
      <Field label="Holiday entitlement" value={form.holidayEntitlement} onChange={(v)=>setField('holidayEntitlement',v)} />
      <Field label="Pension" value={form.pensionScheme} onChange={(v)=>setField('pensionScheme',v)} />
    </div></section>
    <section className="card" style={{padding:22,marginBottom:16}}><h2>Additional role terms</h2><Field label="Relocation support" value={form.relocationSupport} onChange={(v)=>setField('relocationSupport',v)} multiline /><Field label="Potentially repayable employer-funded expenses" value={form.repayableCosts} onChange={(v)=>setField('repayableCosts',v)} multiline /><Field label="Repayment schedule" value={form.repaymentSchedule} onChange={(v)=>setField('repaymentSchedule',v)} multiline /><p style={{color:'var(--muted)',fontSize:13,lineHeight:1.6,marginTop:14}}>Do not include recruitment fees, sponsor licence fees, Immigration Skills Charge, Certificate of Sponsorship costs or interview costs as employee-repayable expenses. Any repayment term must be supported by genuine, evidenced and auditable employer-funded expenses and must be reviewed for proportionality and individual circumstances.</p></section>
    <section className="card" style={{padding:22}}><h2>Issue complete offer package</h2><p style={{color:'var(--muted)',lineHeight:1.65}}>Generate a draft first. After reviewing the terms, issue one CONAGS offer package containing the Employment Contract, Job Description, Handbook and onboarding preparation checklist. The candidate signs the three employment documents online exactly once.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button disabled={busy} onClick={generate} style={{...primaryButton,opacity:busy?.6:1}}>{busy?'Generating…':result?.status==='draft'?'Regenerate draft':'Generate draft contract'}</button>{result?.id&&result.status==='draft'&&<button disabled={busy} onClick={issue} style={{...primaryButton,opacity:busy?.6:1}}>{busy?'Issuing…':'Issue complete offer package and email candidate'}</button>}</div>{result?.id&&<div style={{marginTop:18,padding:15,background:'var(--soft)',borderRadius:10}}><strong>Contract status: {result.status||'draft'}</strong>{result.status==='draft'&&<p style={{margin:'7px 0 0',color:'var(--muted)'}}>This draft is saved against the candidate. Review the terms above, then use <strong>Issue complete offer package and email candidate</strong>. No candidate email is sent until you explicitly issue it.</p>}{result.acceptanceLink&&<><div style={{marginTop:12,fontSize:12,color:'var(--muted)'}}>Acceptance link</div><div style={{marginTop:5,wordBreak:'break-all'}}>{result.acceptanceLink}</div>{result.documentPackLink&&<><div style={{marginTop:12,fontSize:12,color:'var(--muted)'}}>Job Description & Handbook link</div><div style={{marginTop:5,wordBreak:'break-all'}}>{result.documentPackLink}</div></>}</>}</div>}</section>
  </main>;
}

function Field({label,value,onChange,type='text',multiline=false,min,readOnly=false}:{label:string;value:string;onChange:(value:string)=>void;type?:string;multiline?:boolean;min?:string;readOnly?:boolean}){return <label style={{display:'block',marginBottom:13}}><span style={{display:'block',fontSize:12,fontWeight:800,marginBottom:6}}>{label}</span>{multiline?<textarea value={value} onChange={e=>onChange(e.target.value)} rows={3} style={inputStyle}/>:<input type={type} value={value} onChange={e=>onChange(e.target.value)} min={min} readOnly={readOnly} style={inputStyle}/>}</label>}
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:14};
const inputStyle={width:'100%',padding:11,border:'1px solid var(--line)',borderRadius:9,font:'inherit'};
const primaryButton={marginTop:10,background:'var(--ink)',color:'white',border:0,padding:'12px 18px',borderRadius:9,fontWeight:800,cursor:'pointer' as const};
