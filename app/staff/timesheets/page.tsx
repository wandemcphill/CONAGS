'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Timesheet={id:string;assignment_id:string|null;work_date:string;clock_in:string|null;clock_out:string|null;break_minutes:number;total_hours:number|null;status:string;notes:string|null};
type Assignment={id:string;client_name:string|null;location:string;scheduled_start:string;scheduled_end:string;status:string};

function fmtDate(value:string){return new Date(value+'T12:00:00').toLocaleDateString('en-GB',{dateStyle:'medium'});}
function fmtDateTime(value:string|null){return value?new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Not recorded';}
function duration(row:Timesheet){if(row.total_hours!=null)return Number(row.total_hours).toFixed(2)+' hours';if(!row.clock_in||!row.clock_out)return 'Incomplete';const mins=Math.max(0,Math.round((new Date(row.clock_out).getTime()-new Date(row.clock_in).getTime())/60000)-Number(row.break_minutes||0));return (Math.floor(mins/60)+'h '+(mins%60)+'m');}
function badge(status:string){if(['submitted','approved','paid'].includes(status))return 'staff-badge staff-badge--live';if(status==='rejected')return 'staff-badge staff-badge--danger';return 'staff-badge staff-badge--attention';}

export default function StaffTimesheetsPage(){
  const router=useRouter();
  const [rows,setRows]=useState<Timesheet[]>([]);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [assignmentId,setAssignmentId]=useState('');
  const [workDate,setWorkDate]=useState('');
  const [clockIn,setClockIn]=useState('');
  const [clockOut,setClockOut]=useState('');
  const [breakMinutes,setBreakMinutes]=useState('0');
  const [notes,setNotes]=useState('');
  const [editingId,setEditingId]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');

  async function load(showSpinner=true){
    if(showSpinner)setLoading(true);else setRefreshing(true);
    setError('');
    try{
      const response=await fetch('/api/staff/timesheets',{cache:'no-store'});
      if(response.status===401){router.replace('/staff/login');return;}
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to load timesheets.');
      setRows(data.timesheets||[]);
      const shiftResponse=await fetch('/api/staff/shifts',{cache:'no-store'});
      if(shiftResponse.status===401){router.replace('/staff/login');return;}
      const shiftData=await shiftResponse.json().catch(()=>({}));
      if(!shiftResponse.ok)throw new Error(shiftData.error||'Unable to load your assignments.');
      const merged=[...(shiftData.shifts||[]),...(shiftData.history||[])];
      const unique=merged.filter((item:Assignment,index:number,list:Assignment[])=>index===list.findIndex(other=>other.id===item.id));
      setAssignments(unique);
      if(!assignmentId&&unique.length)setAssignmentId(unique[0].id);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load timesheets.');}
    finally{setLoading(false);setRefreshing(false);}
  }

  useEffect(()=>{void load();},[router]);

  function toDateTimeLocal(value:string|null){
    if(!value)return '';
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    const offset=date.getTimezoneOffset();
    return new Date(date.getTime()-offset*60000).toISOString().slice(0,16);
  }

  function beginEdit(row:Timesheet){
    setEditingId(row.id);
    setAssignmentId(row.assignment_id||'');
    setWorkDate(row.work_date||'');
    setClockIn(toDateTimeLocal(row.clock_in));
    setClockOut(toDateTimeLocal(row.clock_out));
    setBreakMinutes(String(Number(row.break_minutes||0)));
    setNotes(row.notes||'');
    setSaved('');
    setError('');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function cancelEdit(){
    setEditingId('');
    setClockIn('');
    setClockOut('');
    setBreakMinutes('0');
    setNotes('');
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    setBusy(true);setSaved('');setError('');
    try{
      const endpoint=editingId?'/api/staff/timesheets?id='+encodeURIComponent(editingId):'/api/staff/timesheets';
      const response=await fetch(endpoint,{
        method: editingId ? 'PATCH' : 'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          assignmentId,workDate,clockIn,clockOut,breakMinutes:Number(breakMinutes),notes,
          ...(editingId ? { submit: true } : {}),
        }),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||(editingId?'Unable to resubmit timesheet.':'Unable to submit timesheet.'));
      cancelEdit();
      setSaved(editingId?'Timesheet corrected and resubmitted for payroll review.':'Timesheet submitted for payroll review.');
      await load(false);
    }catch(e){setError(e instanceof Error?e.message:'Unable to save timesheet.');}
    finally{setBusy(false);}
  }

  const stats=useMemo(()=>({
    submitted:rows.filter(r=>r.status==='submitted').length,
    approved:rows.filter(r=>['approved','paid'].includes(r.status)).length,
    rejected:rows.filter(r=>r.status==='rejected').length,
    hours:rows.filter(r=>['approved','paid'].includes(r.status)).reduce((sum,r)=>sum+(Number(r.total_hours)||0),0),
  }),[rows]);

  return <main className="staff-page--workforce">
    <div className="staff-page-inner">
      <header className="staff-workforce-header">
        <div>
          <p className="staff-eyebrow">Payroll records</p>
          <h1 className="staff-page-title">My Timesheets</h1>
          <p className="staff-page-subtitle">Attendance records submitted against your CONAGS assignments. Approved and paid records cannot be changed.</p>
        </div>
        <div className="staff-workforce-actions">
          <button className="staff-action" onClick={()=>router.push('/staff/attendance')}>Open attendance</button>
          <button className="staff-action" onClick={()=>void load(false)} disabled={refreshing}>{refreshing?'Refreshing...':'Refresh'}</button>
        </div>
      </header>

      {error&&<div role="alert" className="staff-workforce-card" style={{marginBottom:14,color:'#991b1b',borderColor:'#f3cccc'}}>{error}</div>}
      {saved&&<div role="status" className="staff-workforce-card" style={{marginBottom:14,color:'#166534',borderColor:'#b7ead0',background:'#f8fffc'}}>{saved}</div>}

      <section className="staff-stat-grid" style={{marginBottom:14}}>
        <div className="staff-stat"><div className="staff-stat-value">{rows.length}</div><div className="staff-stat-label">Records</div></div>
        <div className="staff-stat"><div className="staff-stat-value">{stats.submitted}</div><div className="staff-stat-label">Awaiting review</div></div>
        <div className="staff-stat"><div className="staff-stat-value">{stats.approved}</div><div className="staff-stat-label">Approved / paid</div></div>
      </section>

      <section className="staff-workforce-grid">
        <form onSubmit={submit} className="staff-workforce-card">
          <div className="staff-workforce-header" style={{marginBottom:14}}>
            <div>
              <p className="staff-eyebrow">{editingId?'Correction':'Manual entry'}</p>
              <h2 className="staff-card-heading">{editingId?'Correct timesheet':'Submit a timesheet'}</h2>
              <p className="staff-card-copy">{editingId?'Correct the rejected timesheet below and resubmit it.':'Use this when an attendance record needs to be submitted manually. Every timesheet must reference a CONAGS assignment.'}</p>
            </div>
            {editingId&&<button type="button" className="staff-action" onClick={cancelEdit} disabled={busy}>Cancel</button>}
          </div>

          <div className="staff-form-grid">
            <label className="staff-form-field staff-form-field--full">
              <span className="staff-form-label">CONAGS assignment</span>
              <select required value={assignmentId} onChange={e=>setAssignmentId(e.target.value)} className="staff-form-input">
                <option value="" disabled>Select a CONAGS assignment</option>
                {assignments.map(assignment=><option key={assignment.id} value={assignment.id}>{assignment.client_name||'CONAGS Assignment'} · {new Date(assignment.scheduled_start).toLocaleString('en-GB')}</option>)}
              </select>
            </label>
            <label className="staff-form-field">
              <span className="staff-form-label">Work date</span>
              <input type="date" required value={workDate} onChange={e=>setWorkDate(e.target.value)} className="staff-form-input"/>
            </label>
            <label className="staff-form-field">
              <span className="staff-form-label">Break minutes</span>
              <input type="number" min="0" max="480" value={breakMinutes} onChange={e=>setBreakMinutes(e.target.value)} className="staff-form-input"/>
            </label>
            <label className="staff-form-field">
              <span className="staff-form-label">Clock in</span>
              <input type="datetime-local" required value={clockIn} onChange={e=>setClockIn(e.target.value)} className="staff-form-input"/>
            </label>
            <label className="staff-form-field">
              <span className="staff-form-label">Clock out</span>
              <input type="datetime-local" required value={clockOut} onChange={e=>setClockOut(e.target.value)} className="staff-form-input"/>
            </label>
            <label className="staff-form-field staff-form-field--full">
              <span className="staff-form-label">Notes</span>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4} maxLength={2000} className="staff-form-input" style={{resize:'vertical'}} placeholder="Optional note for payroll review"/>
            </label>
          </div>

          <div className="staff-form-actions" style={{marginTop:14,justifyContent:'flex-start'}}>
            <button disabled={busy||loading} className="staff-action-primary" aria-busy={busy}>{busy?(editingId?'Resubmitting...':'Submitting...'):(editingId?'Resubmit corrected timesheet':'Submit timesheet')}</button>
          </div>
          <p className="staff-mobile-hint">{editingId?'The CONAGS review note is shown with the rejected record below. Correct the details, then resubmit it.':'For ordinary shifts, use Attendance to clock in and clock out. That keeps your timesheet linked automatically to the assignment.'}</p>
        </form>

        <aside className="staff-workforce-card">
          <p className="staff-eyebrow">Payroll summary</p>
          <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.55}}>Approved hours currently visible in your timesheet history:</div>
          <div className="staff-live-number" style={{color:'var(--ink)'}}>{stats.hours.toFixed(2)} hours</div>
          <div style={{display:'grid',gap:9,marginTop:14}}>
            <div className="staff-stat"><div className="staff-stat-value">{stats.submitted}</div><div className="staff-stat-label">Submitted for review</div></div>
            <div className="staff-stat"><div className="staff-stat-value">{stats.rejected}</div><div className="staff-stat-label">Returned for correction</div></div>
          </div>
          <div style={{marginTop:14,padding:13,borderRadius:13,background:'#f7fafc',color:'var(--muted)',fontSize:12,lineHeight:1.5}}>Approved or paid records are locked. Rejected records can be corrected and resubmitted where the payroll period allows it.</div>
        </aside>
      </section>

      <section className="staff-workforce-card" style={{marginTop:14}}>
        <div className="staff-workforce-header" style={{marginBottom:10}}>
          <div><p className="staff-eyebrow">Timesheet history</p><h2 className="staff-card-heading">Recent records</h2></div>
          <span className="staff-badge">Latest 100 records</span>
        </div>
        {loading?<div className="staff-empty">Loading timesheets...</div>:!rows.length?<div className="staff-empty">No timesheets have been submitted yet. Your attendance records will appear here after clock-out.</div>:<div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Date</th><th>Hours</th><th>Clock in</th><th>Clock out</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{fmtDate(row.work_date)}</td><td><strong>{duration(row)}</strong></td><td>{fmtDateTime(row.clock_in)}</td><td>{fmtDateTime(row.clock_out)}</td><td><span className={badge(row.status)}>{row.status.replaceAll('_',' ')}</span></td><td>{row.status==='rejected'?<span style={{display:'inline-flex',gap:7,alignItems:'center'}}><span style={{color:'var(--muted)',fontSize:12}}>CONAGS review note:</span><button className="staff-action" onClick={()=>beginEdit(row)} style={{minHeight:34,padding:'7px 10px'}}>Edit & resubmit</button></span>:<span style={{color:'var(--muted)',fontSize:12}}>Locked after review</span>}</td></tr>)}</tbody></table></div>}
        <p className="staff-mobile-hint">On a phone, swipe the history table horizontally. Ordinary shifts should normally be recorded through Attendance.</p>
      </section>
    </div>
  </main>;
}
