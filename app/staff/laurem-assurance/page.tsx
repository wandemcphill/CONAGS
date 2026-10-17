'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  StaffAction,
  StaffBadge,
  StaffLoading,
  StaffNotice,
  StaffPage,
  StaffPageHeader,
  StaffPageInner,
  StaffPanel,
  StaffSectionHeader,
} from '@/components/StaffPortalUI';

type Snapshot = {
  generatedAt:string;
  company:{legalName:string;companyNumber:string;registeredOffice:string;companiesHouseUrl:string};
  cqc:{
    regulator:string;
    jurisdiction:string;
    searchUrl:string;
    homeUrl:string;
    status:string;
    summary:string;
    pendingActions:any[];
    history:any[];
  };
  careInspectorate:{
    regulator:string;
    jurisdiction:string;
    registryUrl:string;
    reportUrl:string;
    followUpReportUrl:string;
    liveRegistryConfirmed:boolean;
    details:{serviceName:string;providerName:string;providerNumber:string;serviceNumber:string;address:string};
    latestInspection:{completedOn:string;type:string;keyQuestionGrades:{key:string;label:string;score:number;labelValue:string}[];improvementItems:{kind:string;text:string;status:string}[];priorRequirements:{made:string;status:string}[]};
    history:{date:string;type:string;result:string}[];
    sourceNote:string;
  };
  sponsorship:{
    officialRegisterPage:string;
    csvSource:string|null;
    checkedAt:string;
    status:string;
    matches:{organisationName:string;townCity:string;county:string;typeAndRating:string;route:string}[];
    summary:string;
    error?:string;
  };
};

function tone(value:string):'live'|'attention'|'danger'|'neutral' {
  if(value==='active'||value==='confirmed'||value==='good') return 'live';
  if(value==='online_check_failed'||value==='manual_verification_required') return 'attention';
  if(value==='not_found') return 'danger';
  return 'neutral';
}

export default function LauremAssurancePage(){
  const router=useRouter();
  const [data,setData]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  async function load(){
    setLoading(true);
    setError('');
    try{
      const r=await fetch('/api/staff/laurem-assurance',{cache:'no-store'});
      if(r.status===401){router.replace('/staff/login');return;}
      const body=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(body.error||'Unable to load CONAGS assurance information.');
      setData(body);
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load CONAGS assurance information.');
    }finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[router]);

  if(loading) return <StaffLoading label="Checking CONAGS regulatory and sponsorship information…"/>;
  if(!data) return <StaffPage><StaffPageInner><StaffNotice tone="danger"><strong>Assurance information unavailable</strong><p>{error||'Unable to load the assurance workspace.'}</p><StaffAction onClick={()=>void load()}>Try again</StaffAction></StaffNotice></StaffPageInner></StaffPage>;

  const sponsorActive=data.sponsorship.status==='active';
  const grades=data.careInspectorate.latestInspection.keyQuestionGrades;

  return <StaffPage className="staff-page--assurance"><StaffPageInner>
    <StaffPageHeader
      eyebrow="CONAGS ORGANISATION ASSURANCE"
      title="CONAGS Assurance Centre"
      subtitle="Official-source information about CONAGS's company status, social-care regulation and UK worker sponsorship status."
      actions={<><StaffAction onClick={()=>void load()}>Refresh online checks</StaffAction><StaffAction href="/staff/messages">Ask CONAGS</StaffAction></>}
    />

    <StaffNotice>
      <strong>This page distinguishes verified regulatory information from items that require an exact service-level check.</strong>
      <p>Regulatory records can change. The portal links directly to the official sources and records when the online check was last attempted.</p>
    </StaffNotice>

    <div className="staff-stat-grid">
      <div className="staff-stat"><div className="staff-stat-value">{sponsorActive?'Active':'Review'}</div><div className="staff-stat-label">Home Office sponsor status</div></div>
      <div className="staff-stat"><div className="staff-stat-value">4 / 4</div><div className="staff-stat-label">Latest Scotland grade range</div></div>
      <div className="staff-stat"><div className="staff-stat-value">{grades.length}</div><div className="staff-stat-label">Scotland key questions graded</div></div>
      <div className="staff-stat"><div className="staff-stat-value">{data.company.companyNumber}</div><div className="staff-stat-label">Companies House number</div></div>
    </div>

    <StaffPanel>
      <StaffSectionHeader title="Company identity" copy="The legal entity used across CONAGS employment and sponsorship records."/>
      <div className="staff-visa-info-grid">
        <Info label="Legal entity" value={data.company.legalName}/>
        <Info label="Company number" value={data.company.companyNumber}/>
        <Info label="Registered office" value={data.company.registeredOffice}/>
      </div>
      <div className="staff-home-panel-actions"><StaffAction href={data.company.companiesHouseUrl}>Open Companies House</StaffAction></div>
    </StaffPanel>

    <div className="staff-workforce-grid">
      <StaffPanel>
        <div className="staff-visa-status-top"><div><p className="staff-eyebrow">England regulator</p><h2 className="staff-card-heading">Care Quality Commission (CQC)</h2><p className="staff-card-copy">CQC regulates health and social care in England. The portal does not invent a provider rating when an exact CQC provider/service profile has not been matched.</p></div><StaffBadge tone={tone(data.cqc.status)}>{data.cqc.status.replaceAll('_',' ')}</StaffBadge></div>
        <p className="staff-card-copy">{data.cqc.summary}</p>
        <StaffNotice tone="warning"><strong>England care-role check</strong><p>For care worker or senior care worker sponsored roles in England, current UK immigration guidance contains a CQC registration requirement. Confirm the exact CONAGS employer/service registration before relying on an England placement.</p></StaffNotice>
        <div className="staff-home-panel-actions"><StaffAction href={data.cqc.searchUrl} primary>Open CQC search</StaffAction><StaffAction href={data.cqc.homeUrl}>CQC information</StaffAction></div>
        <div className="staff-document-meta">Latest portal check: {new Date(data.generatedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</div>
      </StaffPanel>

      <StaffPanel>
        <div className="staff-visa-status-top"><div><p className="staff-eyebrow">Scotland regulator</p><h2 className="staff-card-heading">Care Inspectorate</h2><p className="staff-card-copy">This is the relevant Scottish social-care regulator for CONAGS's Scottish care service record.</p></div><StaffBadge tone={data.careInspectorate.liveRegistryConfirmed?'live':'attention'}>{data.careInspectorate.liveRegistryConfirmed?'Registry confirmed':'Online registry check needs refresh'}</StaffBadge></div>
        <div className="staff-visa-info-grid">
          <Info label="Service" value={data.careInspectorate.details.serviceName}/>
          <Info label="Provider number" value={data.careInspectorate.details.providerNumber}/>
          <Info label="Service number" value={data.careInspectorate.details.serviceNumber}/>
          <Info label="Service address" value={data.careInspectorate.details.address}/>
        </div>
        <div className="staff-home-panel-actions"><StaffAction href={data.careInspectorate.reportUrl} primary>Latest inspection report</StaffAction><StaffAction href={data.careInspectorate.followUpReportUrl}>Latest follow-up</StaffAction><StaffAction href={data.careInspectorate.registryUrl}>Scottish registry</StaffAction></div>
      </StaffPanel>
    </div>

    <StaffPanel>
      <StaffSectionHeader title="Latest Care Inspectorate result" copy={'Unannounced inspection completed '+data.careInspectorate.latestInspection.completedOn+'.'}/>
      <div className="staff-home-lane-grid">
        {grades.map(grade=><article key={grade.key} className="staff-home-lane"><StaffBadge tone="live">{grade.score} · {grade.labelValue}</StaffBadge><strong>{grade.label}</strong><span>Latest published grade</span></article>)}
      </div>
      <StaffNotice tone="warning"><strong>Improvement history</strong><p>{data.careInspectorate.latestInspection.improvementItems[0]?.text||'No improvement item recorded in the configured latest report.'}</p><p>Earlier requirements were recorded as met outwith timescales in the follow-up history.</p></StaffNotice>
    </StaffPanel>

    <StaffPanel>
      <StaffSectionHeader title="Scotland regulatory history" copy="The portal keeps the published inspection trail visible rather than showing only the latest rating."/>
      <div className="staff-document-list">
        {data.careInspectorate.history.map(item=><article className="staff-document-card" key={item.date+item.type}>
          <div className="staff-document-main"><div className="staff-document-icon" aria-hidden="true">R</div><div className="staff-document-copy"><span className="staff-document-category">{item.date}</span><h3>{item.type}</h3><p>{item.result}</p></div></div>
          <div className="staff-document-actions">{item.date==='3 July 2025'?<StaffAction href={data.careInspectorate.reportUrl}>Open report</StaffAction>:item.date==='29 January 2025'?<StaffAction href={data.careInspectorate.followUpReportUrl}>Open report</StaffAction>:null}</div>
        </article>)}
      </div>
    </StaffPanel>

    <StaffPanel>
      <div className="staff-visa-status-top"><div><p className="staff-eyebrow">UK immigration sponsorship</p><h2 className="staff-card-heading">Home Office Sponsor Licence</h2><p className="staff-card-copy">{data.sponsorship.summary}</p></div><StaffBadge tone={tone(data.sponsorship.status)}>{sponsorActive?'Active':'Check status'}</StaffBadge></div>
      {sponsorActive ? <div className="staff-workforce-grid"><div><div className="staff-visa-info-grid">{data.sponsorship.matches.map((match,index)=><Info key={index} label={match.route||'Route'} value={(match.typeAndRating||'Rating not returned')+' · '+(match.townCity||'Town/city not returned')}/>)}</div></div><div><StaffNotice><strong>What this means</strong><p>The Home Office register confirms the legal organisation is on the licensed sponsor register for the returned worker route(s). It does not by itself confirm that a particular job, salary or individual application is eligible.</p></StaffNotice></div></div> : <StaffNotice tone="warning"><strong>Online sponsor check did not return an active match.</strong><p>{data.sponsorship.error||'Open the official register and verify the legal entity before relying on sponsorship information.'}</p></StaffNotice>}
      <div className="staff-home-panel-actions"><StaffAction href={data.sponsorship.officialRegisterPage} primary>Open official sponsor register</StaffAction></div>
      <div className="staff-document-meta">Sponsor register check: {new Date(data.sponsorship.checkedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</div>
    </StaffPanel>

    <StaffNotice><strong>Important distinction</strong><p>A regulatory rating belongs to a registered service/location, while a sponsor licence belongs to the legal employer. CONAGS uses this page to keep those two records visible and separate.</p></StaffNotice>
  </StaffPageInner></StaffPage>;
}

function Info({label,value}:{label:string;value:any}){
  return <div className="staff-visa-info"><span>{label}</span><strong>{value||'Not recorded'}</strong></div>;
}
