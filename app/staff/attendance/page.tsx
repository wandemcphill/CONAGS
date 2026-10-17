'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Shift = { id:string; client_name:string|null; location:string; scheduled_start:string; scheduled_end:string; status:string; notes:string|null };
type Attendance = { id:string; assignment_id:string|null; work_date:string; clock_in:string|null; clock_out:string|null; break_minutes:number; total_hours:number|null; status:string; notes:string|null };

function fmtDate(value:string){return new Date(value).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});}
function fmtDateTime(value:string|null){return value?new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Not recorded';}
function duration(row:Attendance){if(!row.clock_in||!row.clock_out)return 'In progress';const mins=Math.max(0,Math.round((new Date(row.clock_out).getTime()-new Date(row.clock_in).getTime())/60000)-Number(row.break_minutes||0));return Math.floor(mins/60)+'h '+(mins%60)+'m';}
function statusClass(status:string){if(['submitted','approved','paid'].includes(status))return 'staff-badge staff-badge--live';if(status==='rejected')return 'staff-badge staff-badge--danger';return 'staff-badge staff-badge--attention';}

export default function StaffAttendancePage(){
  const router=useRouter();
  const [shifts,setShifts]=useState<Shift[]>([]);
  const [rows,setRows]=useState<Attendance[]>([]);
  const [breakMinutes,setBreakMinutes]=useState('30');
  const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState('');
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');

  async function load(showSpinner=true){
    if(showSpinner)setLoading(true);else setRefreshing(true);
    setError('');
    try{
      const response=await fetch('/api/staff/attendance',{cache:'no-store'});
      if(response.status===401){router.replace('/staff/login');return;}
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Unable to load attendance.');
      setShifts(body.shifts||[]);
      setRows(body.attendance||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load attendance.');}
    finally{setLoading(false);setRefreshing(false);}
  }

  useEffect(()=>{void load();},[router]);

  async function act(assignmentId:string,action:'clock_in'|'clock_out'){
    setBusy(action+assignmentId);setError('');
    try{
      const response=await fetch('/api/staff/attendance',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          action,
          assignmentId,
          breakMinutes:action==='clock_out'?Number(breakMinutes||0):undefined,
          notes:action==='clock_out'?notes:undefined
        })
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Attendance action failed.');
      setNotes('');
      await load(false);
    }catch(e){setError(e instanceof Error?e.message:'Attendance action failed.');}
    finally{setBusy('');}
  }

  const open=useMemo(()=>rows.find(r=>r.clock_in&&!r.clock_out),[rows]);
  const nextShift=shifts[0]||null;
  const submitted=rows.filter(r=>['submitted','approved','paid'].includes(r.status)).length;

  return <main className="staff-page--workforce">
    <div className="staff-page-inner">
      <header className="staff-workforce-header">
        <div>
          <p className="staff-eyebrow">Time & Attendance</p>
          <h1 className="staff-page-title">Attendance</h1>
          <p className="staff-page-subtitle">Clock in against an assigned shift, record your break, and clock out when your work is complete.</p>
        </div>
        <div className="staff-workforce-actions">
          <button className="staff-action" onClick={()=>void load(false)} disabled={refreshing}>{refreshing?'Refreshing...':'Refresh'}</button>
          <button className="staff-action" onClick={()=>router.push('/staff/timesheets')}>My Timesheets</button>
        </div>
      </header>

      {error&&<div role="alert" className="staff-workforce-card" style={{marginBottom:14,color:'#991b1b',borderColor:'#f3cccc'}}>{error}</div>}

      <section className="staff-workforce-grid">
        <article className="staff-workforce-card staff-workforce-card--hero">
          <p className="staff-eyebrow" style={{color:'#b9e1d2'}}>Current status</p>
          {open ? <>
            <h2 className="staff-card-heading">You are currently working</h2>
            <div className="staff-live-number">{fmtDateTime(open.clock_in)}</div>
            <p className="staff-card-copy">Keep this page available during your shift. When your assignment is complete, clock out and the attendance record will be submitted for payroll review.</p>
            <div className="staff-shift-actions" style={{marginTop:18}}>
              <button className="staff-action-primary" style={{background:'#fff',color:'#173a31'}} onClick={()=>document.getElementById('clockout-controls')?.scrollIntoView({behavior:'smooth'})}>Clock out when finished</button>
            </div>
          </> : <>
            <h2 className="staff-card-heading">Not clocked in</h2>
            <div style={{fontSize:15,fontWeight:850,marginTop:8}}>Your eligible assignments appear below when their attendance window is open.</div>
            <p className="staff-card-copy">Clock-in is available from 2 hours before an assignment until its scheduled finish.</p>
          </>}
        </article>

        <aside className="staff-workforce-card">
          <p className="staff-eyebrow">Overview</p>
          <div className="staff-stat-grid" style={{gridTemplateColumns:'1fr'}}>
            <div className="staff-stat"><div className="staff-stat-value">{nextShift?'1':'0'}</div><div className="staff-stat-label">Next eligible shift</div></div>
            <div className="staff-stat"><div className="staff-stat-value">{submitted}</div><div className="staff-stat-label">Submitted attendance records</div></div>
          </div>
          {nextShift&&<div style={{marginTop:13,padding:13,borderRadius:13,background:'#f7fafc'}}><strong>{nextShift.client_name||'CONAGS Assignment'}</strong><div style={{color:'var(--muted)',fontSize:13,marginTop:4}}>{fmtDateTime(nextShift.scheduled_start)}</div></div>}
        </aside>
      </section>

      <section className="staff-workforce-card" style={{marginTop:14}}>
        <div className="staff-workforce-header" style={{marginBottom:12}}>
          <div>
            <p className="staff-eyebrow">Assignments</p>
            <h2 className="staff-card-heading">Clock in for a shift</h2>
            <p className="staff-card-copy">Only assignments linked to your CONAGS staff record can be used for attendance.</p>
          </div>
        </div>
        {loading?<div className="staff-empty">Loading eligible shifts...</div>:!shifts.length?<div className="staff-empty">No current or upcoming assignments are eligible for attendance.</div>:<div>
          {shifts.map(shift=>{
            const row=rows.find(item=>item.assignment_id===shift.id);
            const canIn=!row?.clock_in;
            const canOut=Boolean(row?.clock_in&&!row?.clock_out);
            return <article key={shift.id} className="staff-shift-item">
              <div className="staff-shift-topline">
                <div>
                  <div className="staff-shift-client">{shift.client_name||'CONAGS Assignment'}</div>
                  <div className="staff-shift-meta">{shift.location} · {fmtDate(shift.scheduled_start)} · {fmtDateTime(shift.scheduled_start)} to {fmtDateTime(shift.scheduled_end)}</div>
                </div>
                <span className={row?.status?statusClass(row.status):'staff-badge'}>{row?.status?.replaceAll('_',' ')||'Not started'}</span>
              </div>
              {row?.clock_in&&<div className="staff-shift-meta" style={{marginTop:9}}>Clocked in at {fmtDateTime(row.clock_in)}</div>}
              {shift.notes&&<p className="staff-shift-meta" style={{whiteSpace:'pre-wrap'}}>{shift.notes}</p>}
              <div className="staff-shift-actions" style={{marginTop:12}}>
                {canIn&&<button className="staff-action-primary" onClick={()=>void act(shift.id,'clock_in')} disabled={busy==='clock_in'+shift.id} aria-busy={busy==='clock_in'+shift.id}>{busy==='clock_in'+shift.id?'Clocking in...':'Clock in'}</button>}
                {canOut&&<div id={open?.assignment_id===shift.id?'clockout-controls':undefined} className="staff-form-grid staff-clockout-grid" style={{width:'100%',alignItems:'end'}}>
                  <label className="staff-form-field"><span className="staff-form-label">Break minutes</span><input className="staff-form-input" type="number" min="0" max="480" value={breakMinutes} onChange={e=>setBreakMinutes(e.target.value)} /></label>
                  <label className="staff-form-field"><span className="staff-form-label">Attendance note</span><input className="staff-form-input" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} placeholder="Optional" /></label>
                  <button className="staff-action-primary" onClick={()=>void act(shift.id,'clock_out')} disabled={busy==='clock_out'+shift.id} aria-busy={busy==='clock_out'+shift.id}>{busy==='clock_out'+shift.id?'Clocking out...':'Clock out'}</button>
                </div>}
              </div>
            </article>;
          })}
        </div>}
      </section>

      <section className="staff-workforce-card" style={{marginTop:14}}>
        <div className="staff-workforce-header" style={{marginBottom:12}}>
          <div><p className="staff-eyebrow">History</p><h2 className="staff-card-heading">Attendance history</h2></div>
          <span className="staff-badge">Latest 100 records</span>
        </div>
        {!rows.length?<div className="staff-empty">No attendance records yet.</div>:<div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Duration</th><th>Status</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{fmtDate(row.work_date+'T12:00:00')}</td><td>{fmtDateTime(row.clock_in)}</td><td>{fmtDateTime(row.clock_out)}</td><td><strong>{duration(row)}</strong></td><td><span className={statusClass(row.status)}>{row.status.replaceAll('_',' ')}</span></td></tr>)}</tbody></table></div>}
        <p className="staff-mobile-hint">On a phone, swipe the history table horizontally to view all columns.</p>
      </section>
    </div>
  </main>;
}
