'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  StaffAction, StaffBadge, StaffLoading, StaffMetric, StaffNotice, StaffPage,
  StaffPageHeader, StaffPageInner, StaffPanel, StaffSectionHeader,
} from '@/components/StaffPortalUI';

type Shift={id:string;client_name:string|null;location:string;scheduled_start:string;scheduled_end:string;status:string;notes:string|null};
const UK_TIME_ZONE='Europe/London';
const dateKey=(value:string|Date)=>{
  const d=typeof value==='string'?new Date(value):value;
  return new Intl.DateTimeFormat('en-CA',{timeZone:UK_TIME_ZONE}).format(d);
};
const dateLabel=(key:string)=>new Date(key+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const longDate=(key:string)=>new Date(key+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
const time=(value:string)=>new Date(value).toLocaleTimeString('en-GB',{timeZone:UK_TIME_ZONE,hour:'2-digit',minute:'2-digit'});
const shiftDuration=(start:string,end:string)=>{const mins=Math.max(0,Math.round((new Date(end).getTime()-new Date(start).getTime())/60000));return Math.floor(mins/60)+'h '+(mins%60)+'m';};
const tone=(status:string)=>status==='confirmed'?'live':status==='cancelled'?'danger':'attention';
function addDays(key:string,n:number){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function monday(key:string){const d=new Date(key+'T12:00:00Z');const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-day+1);return d.toISOString().slice(0,10);}
function weekKeys(anchor:string){const start=monday(anchor);return Array.from({length:7},(_,i)=>addDays(start,i));}

export default function StaffShiftsPage(){
  const router=useRouter();const[shifts,setShifts]=useState<Shift[]>([]);const[history,setHistory]=useState<Shift[]>([]);const[loading,setLoading]=useState(true);const[refreshing,setRefreshing]=useState(false);const[error,setError]=useState('');const[today,setToday]=useState(dateKey(new Date()));const[weekAnchor,setWeekAnchor]=useState(dateKey(new Date()));const[selectedDay,setSelectedDay]=useState(dateKey(new Date()));

  async function load(showSpinner=true){if(showSpinner)setLoading(true);else setRefreshing(true);setError('');try{const r=await fetch('/api/staff/shifts',{cache:'no-store'});if(r.status===401){router.replace('/staff/login');return;}const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Unable to load shifts.');setShifts(b.shifts||[]);setHistory(b.history||[]);}catch(e){setError(e instanceof Error?e.message:'Unable to load shifts.');}finally{setLoading(false);setRefreshing(false);}}
  useEffect(()=>{void load();},[router]);

  const keys=useMemo(()=>weekKeys(weekAnchor),[weekAnchor]);
  const byDay=useMemo(()=>{const m=new Map<string,Shift[]>();for(const s of shifts){const k=dateKey(s.scheduled_start);const list=m.get(k)||[];list.push(s);m.set(k,list);}return m;},[shifts]);
  const weekShifts=useMemo(()=>keys.flatMap(k=>byDay.get(k)||[]),[keys,byDay]);
  const selectedShifts=byDay.get(selectedDay)||[];
  const upcomingHours=useMemo(()=>shifts.reduce((sum,s)=>sum+(new Date(s.scheduled_end).getTime()-new Date(s.scheduled_start).getTime())/3600000,0),[shifts]);
  const nextShift=shifts[0]||null;

  function moveWeek(delta:number){const next=addDays(monday(weekAnchor),delta*7);setWeekAnchor(next);setSelectedDay(next);}
  function goToday(){const k=dateKey(new Date());setToday(k);setWeekAnchor(k);setSelectedDay(k);}
  function statusLabel(status:string){return status.replaceAll('_',' ');}

  if(loading)return <StaffLoading label="Loading your shift calendar…"/>;
  return <StaffPage className="staff-page--workforce staff-page--shifts"><StaffPageInner>
    <StaffPageHeader eyebrow="Workforce schedule" title="My Shifts" subtitle="Your weekly schedule, assignment details and recent shift history." actions={<><StaffAction href="/staff/availability">Work preferences</StaffAction><StaffAction onClick={()=>void load(false)} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</StaffAction></>}/>
    {error&&<StaffNotice tone="danger"><strong>Shift schedule unavailable</strong><p>{error}</p><StaffAction onClick={()=>void load(false)}>Try again</StaffAction></StaffNotice>}

    <div className="staff-stat-grid"><StaffMetric label="Upcoming shifts" value={shifts.length}/><StaffMetric label="Scheduled hours" value={Math.round(upcomingHours*10)/10}/><StaffMetric label="This week" value={weekShifts.length}/><StaffMetric label="Recent records" value={history.length}/></div>

    <StaffPanel className="staff-next-shift-panel">
      <StaffSectionHeader title="Next shift" copy="Your nearest scheduled assignment."/>
      {!nextShift?<div className="staff-empty">No upcoming shift is currently visible in your portal.</div>:<article className="staff-next-shift-card"><div><StaffBadge tone={tone(nextShift.status)}>{statusLabel(nextShift.status)}</StaffBadge><h2>{nextShift.client_name||'CONAGS Assignment'}</h2><p>{nextShift.location}</p><div className="staff-next-shift-time"><strong>{dateLabel(dateKey(nextShift.scheduled_start))}</strong><span>{time(nextShift.scheduled_start)} to {time(nextShift.scheduled_end)}</span><small>{shiftDuration(nextShift.scheduled_start,nextShift.scheduled_end)} scheduled</small></div>{nextShift.notes&&<p className="staff-card-copy staff-preserve-whitespace">{nextShift.notes}</p>}</div><StaffAction href="/staff/attendance" primary>Open attendance</StaffAction></article>}
    </StaffPanel>

    <StaffPanel className="staff-shift-calendar-panel">
      <div className="staff-calendar-toolbar"><div><p className="staff-eyebrow">Weekly calendar</p><h2 className="staff-card-heading">Plan your week</h2><p className="staff-card-copy">Times are shown in UK local time. Select a day to see the assignments beneath it.</p></div><div className="staff-calendar-controls"><StaffAction onClick={()=>moveWeek(-1)}>Previous week</StaffAction><StaffAction onClick={goToday}>This week</StaffAction><StaffAction onClick={()=>moveWeek(1)}>Next week</StaffAction></div></div>
      <div className="staff-calendar-strip" role="tablist" aria-label="Shift calendar days">
        {keys.map(k=>{const active=k===selectedDay;const isToday=k===today;const count=(byDay.get(k)||[]).length;return <button key={k} className={'staff-calendar-day'+(active?' is-selected':'')+(isToday?' is-today':'')} role="tab" aria-selected={active} onClick={()=>setSelectedDay(k)}><span>{new Date(k+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:UK_TIME_ZONE,weekday:'short'})}</span><strong>{new Date(k+'T12:00:00Z').getUTCDate()}</strong><small>{count?count+' shift'+(count===1?'':'s'):'Free'}</small></button>;})}
      </div>
      <div className="staff-calendar-selected"><div className="staff-calendar-selected-head"><div><p className="staff-eyebrow">{selectedDay===today?'Today':''}</p><h3>{longDate(selectedDay)}</h3></div><StaffBadge tone={selectedShifts.length?'attention':'neutral'}>{selectedShifts.length?selectedShifts.length+' shift'+(selectedShifts.length===1?'':'s'):'No shifts'}</StaffBadge></div>
        {!selectedShifts.length?<div className="staff-empty">No scheduled assignments for this day.</div>:<div className="staff-calendar-day-list">{selectedShifts.map(shift=><article key={shift.id} className="staff-calendar-shift"><div className="staff-calendar-shift-time"><strong>{time(shift.scheduled_start)}</strong><span>{time(shift.scheduled_end)}</span></div><div><StaffBadge tone={tone(shift.status)}>{statusLabel(shift.status)}</StaffBadge><h4>{shift.client_name||'CONAGS Assignment'}</h4><p>{shift.location}</p><small>{shiftDuration(shift.scheduled_start,shift.scheduled_end)} · {dateKey(shift.scheduled_start)}</small>{shift.notes&&<div className="staff-card-copy staff-preserve-whitespace">{shift.notes}</div>}</div><StaffAction href="/staff/attendance">Attendance</StaffAction></article>)}</div>}
      </div>
    </StaffPanel>

    <StaffPanel><StaffSectionHeader title="Week at a glance" copy="Every assignment scheduled during the selected week."/><div className="staff-week-overview">{keys.map(k=><article key={k} className={k===today?'is-today':''}><div><span>{dateLabel(k)}</span><strong>{(byDay.get(k)||[]).length||'No'} shift{(byDay.get(k)||[]).length===1?'':'s'}</strong></div>{(byDay.get(k)||[]).slice(0,3).map(s=><button key={s.id} onClick={()=>{setSelectedDay(k);window.scrollTo({top:400,behavior:'smooth'});}}><strong>{time(s.scheduled_start)}</strong><span>{s.client_name||'CONAGS Assignment'}</span></button>)}</article>)}</div></StaffPanel>

    <StaffPanel><StaffSectionHeader title="Recent shifts" copy="Completed or past shift records remain available as reference."/><span className="staff-badge">Latest {Math.min(history.length,30)}</span>{!history.length?<div className="staff-empty">No completed or past shifts are recorded yet.</div>:<div className="staff-shift-history-list">{history.slice(0,30).map(shift=><article key={shift.id}><div><strong>{shift.client_name||'CONAGS Assignment'}</strong><span>{fmtPast(shift.scheduled_start,shift.scheduled_end)} · {shift.location}</span></div><StaffBadge tone={tone(shift.status)}>{statusLabel(shift.status)}</StaffBadge></article>)}</div>}</StaffPanel>
  </StaffPageInner></StaffPage>;
}
function fmtPast(start:string,end:string){const d=new Date(start).toLocaleDateString('en-GB',{timeZone:UK_TIME_ZONE,dateStyle:'medium'});return d+' · '+new Date(start).toLocaleTimeString('en-GB',{timeZone:UK_TIME_ZONE,hour:'2-digit',minute:'2-digit'})+' to '+new Date(end).toLocaleTimeString('en-GB',{timeZone:UK_TIME_ZONE,hour:'2-digit',minute:'2-digit'});}
