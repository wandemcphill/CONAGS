'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type ReportRow={employeeNumber:string;fullName:string;jobTitle:string;employmentStatus:string;location:string|null;shifts:number;scheduledHours:number;completedShifts:number;cancelledShifts:number;noShowShifts:number;submittedTimesheets:number;approvedHours:number;rejectedTimesheets:number;approvedLeaveDays:number;pendingLeaveRequests:number;grossPayroll:number};
type Report={range:{start:string;end:string};generatedAt:string;summary:Record<string,number>;rows:ReportRow[]};
const card:React.CSSProperties={background:'#fff',border:'1px solid var(--line)',borderRadius:16,padding:18};
const muted:React.CSSProperties={color:'var(--muted)'};
const input:React.CSSProperties={padding:'10px 11px',border:'1px solid var(--line)',borderRadius:9,font:'inherit'};
function isoToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());}
function isoStart(){const d=new Date();d.setDate(d.getDate()-29);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(d);}
function money(value:number){return '£'+value.toFixed(2);}
function csv(value:unknown){const text=String(value??'');return '"'+text.replaceAll('"','""')+'"';}

export default function WorkforceReportsPage(){
  const [start,setStart]=useState(isoStart());
  const [end,setEnd]=useState(isoToday());
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function load(){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/workforce/reports?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end),{cache:'no-store'});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Unable to load workforce report.');
      setReport(body);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load workforce report.');}
    finally{setBusy(false);setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  const activeRows=useMemo(()=>report?.rows.filter(row=>row.employmentStatus==='active')||[],[report]);
  function downloadCsv(){
    if(!report)return;
    const headers=['Employee number','Full name','Job title','Status','Location','Shifts','Scheduled hours','Completed shifts','Cancelled shifts','No-show shifts','Submitted timesheets','Approved hours','Rejected timesheets','Approved leave days','Pending leave requests','Gross payroll'];
    const lines=[headers.map(csv).join(',')];
    for(const row of report.rows)lines.push([row.employeeNumber,row.fullName,row.jobTitle,row.employmentStatus,row.location||'',row.shifts,row.scheduledHours,row.completedShifts,row.cancelledShifts,row.noShowShifts,row.submittedTimesheets,row.approvedHours,row.rejectedTimesheets,row.approvedLeaveDays,row.pendingLeaveRequests,row.grossPayroll.toFixed(2)].map(csv).join(','));
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download='laurem-workforce-report-'+report.range.start+'-to-'+report.range.end+'.csv';anchor.click();
    URL.revokeObjectURL(url);
  }
  if(loading)return <main className='wrap' style={{padding:'36px 0 80px'}}><div className='card' style={{padding:20}}>Loading workforce report…</div></main>;
  return <main className='wrap' style={{padding:'30px 0 80px',maxWidth:1300}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-end',flexWrap:'wrap'}}><div><Link href='/admin/workforce' style={{color:'var(--muted)',textDecoration:'none'}}>← Workforce operations</Link><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em',margin:'18px 0 5px'}}>WORKFORCE REPORTING</p><h1 style={{fontSize:40,margin:'0 0 5px'}}>Staff & workforce report</h1><p style={{color:'var(--muted)',margin:0}}>Operational shifts, timesheets, leave and payroll coverage for a selected reporting period.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={downloadCsv} disabled={!report} style={{padding:'9px 12px',border:'1px solid var(--line)',background:'#fff',borderRadius:9,fontWeight:800}}>Download CSV</button><button onClick={()=>void load()} disabled={busy} style={{padding:'9px 12px',border:0,background:'var(--ink)',color:'#fff',borderRadius:9,fontWeight:800}}>{busy?'Refreshing…':'Refresh report'}</button></div></div>
    {error&&<div role='alert' className='card' style={{padding:14,marginTop:16,color:'#8a2323'}}>{error}</div>}
    <section className='card' style={{padding:16,marginTop:18,display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}><label style={{display:'grid',gap:5,fontSize:12,fontWeight:800}}>Start date<input type='date' value={start} onChange={e=>setStart(e.target.value)} style={input}/></label><label style={{display:'grid',gap:5,fontSize:12,fontWeight:800}}>End date<input type='date' value={end} onChange={e=>setEnd(e.target.value)} style={input}/></label><button onClick={()=>void load()} disabled={busy} style={{padding:'10px 13px',border:0,background:'var(--ink)',color:'#fff',borderRadius:9,fontWeight:800}}>Apply range</button><span style={{...muted,fontSize:12}}>Rows cover CONAGS workforce data only.</span></section>
    {report&&<><section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginTop:16}}><Metric label='Staff records' value={report.summary.staffCount}/><Metric label='Active staff' value={report.summary.activeStaff}/><Metric label='Shifts' value={report.summary.scheduledShifts}/><Metric label='Scheduled hours' value={report.summary.scheduledHours.toFixed(2)}/><Metric label='Approved hours' value={report.summary.approvedHours.toFixed(2)}/><Metric label='Pending timesheets' value={report.summary.pendingTimesheets}/><Metric label='Approved leave days' value={report.summary.approvedLeaveDays}/><Metric label='Gross payroll' value={money(report.summary.grossPayroll)}/></section>
    <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:10,marginTop:12}}><article style={card}><strong>Shift outcomes</strong><div style={muted}>{report.summary.completedShifts} completed · {report.summary.cancelledShifts} cancelled · {report.summary.noShowShifts} no-show</div></article><article style={card}><strong>Leave</strong><div style={muted}>{report.summary.approvedLeaveRequests} approved requests · {report.summary.pendingLeaveRequests} pending requests</div></article><article style={card}><strong>Payroll periods</strong><div style={muted}>{report.summary.payrollPeriods} periods represented in the selected range</div></article></section>
    <section style={{...card,padding:0,marginTop:18,overflowX:'auto'}}><div style={{padding:16,borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><h2 style={{margin:0}}>Staff detail</h2><div style={{...muted,fontSize:12,marginTop:4}}>{activeRows.length} active staff currently represented</div></div><span style={{...muted,fontSize:12}}>Generated {new Date(report.generatedAt).toLocaleString('en-GB')}</span></div><table style={{width:'100%',borderCollapse:'collapse',minWidth:1250}}><thead><tr>{['Employee','Role','Status','Shifts','Scheduled h','Approved h','Submitted TS','Rejected TS','Leave days','Pending leave','Gross'].map(label=><th key={label} style={{textAlign:'left',padding:'10px 12px',fontSize:11,borderBottom:'1px solid var(--line)',whiteSpace:'nowrap'}}>{label}</th>)}</tr></thead><tbody>{report.rows.map(row=><tr key={row.employeeNumber} style={{borderBottom:'1px solid var(--line)'}}><td style={{padding:'11px 12px'}}><strong>{row.fullName}</strong><div style={{...muted,fontSize:11}}>{row.employeeNumber} · {row.location||'Location not set'}</div></td><td style={{padding:'11px 12px'}}>{row.jobTitle}</td><td style={{padding:'11px 12px'}}>{row.employmentStatus}</td><td style={{padding:'11px 12px'}}>{row.shifts}</td><td style={{padding:'11px 12px'}}>{row.scheduledHours.toFixed(2)}</td><td style={{padding:'11px 12px'}}>{row.approvedHours.toFixed(2)}</td><td style={{padding:'11px 12px'}}>{row.submittedTimesheets}</td><td style={{padding:'11px 12px'}}>{row.rejectedTimesheets}</td><td style={{padding:'11px 12px'}}>{row.approvedLeaveDays}</td><td style={{padding:'11px 12px'}}>{row.pendingLeaveRequests}</td><td style={{padding:'11px 12px'}}>{money(row.grossPayroll)}</td></tr>)}</tbody></table></section></>}</main>;
}
function Metric({label,value}:{label:string;value:string|number}){return <article style={card}><div style={{fontSize:26,fontWeight:900}}>{value}</div><div style={{...muted,fontSize:12,marginTop:3}}>{label}</div></article>;}