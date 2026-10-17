'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type StaffCommand={href:string;label:string;keywords?:string[];section?:string};

const commands:StaffCommand[]=[
 {href:'/staff/requests',label:'My Requests',keywords:['requests','cases','pending','action'],section:'Workspace'},
 {href:'/staff',label:'Staff Home',keywords:['dashboard','overview'],section:'Workspace'},
 {href:'/staff/week',label:'My Week',keywords:['week','schedule','overview','timesheets','leave'],section:'Workspace'},
 {href:'/staff/shifts',label:'My Shifts',keywords:['schedule','calendar','rota'],section:'Work'},
 {href:'/staff/attendance',label:'Attendance',keywords:['clock in','clock out','break'],section:'Work'},
 {href:'/staff/timesheets',label:'Timesheets',keywords:['hours','submit','resubmit'],section:'Work'},
 {href:'/staff/leave',label:'My Leave',keywords:['holiday','time off','absence'],section:'Work'},
 {href:'/staff/availability',label:'Work Preferences',keywords:['rota','availability','regions','training'],section:'Work'},
 {href:'/staff/messages',label:'Messages',keywords:['chat','admin','hr'],section:'Communication'},
 {href:'/staff/notifications',label:'Notifications',keywords:['alerts','updates'],section:'Communication'},
 {href:'/staff/documents',label:'Documents',keywords:['contract','handbook','sign'],section:'Records'},
 {href:'/staff/onboarding',label:'Onboarding',keywords:['induction','acknowledge'],section:'Records'},
 {href:'/staff/payroll',label:'Payroll',keywords:['salary','pay','hours'],section:'Records'},
 {href:'/staff/training',label:'Training',keywords:['mandatory','course','week'],section:'Records'},
 {href:'/staff/compliance',label:'DBS & PVG',keywords:['disclosure','check','compliance'],section:'Compliance'},
 {href:'/staff/visa-sponsorship',label:'Visa & Sponsorship',keywords:['cos','certificate','immigration'],section:'Compliance'},
 {href:'/staff/profile',label:'My Profile',keywords:['contact','address','photo'],section:'Account'},
 {href:'/staff/change-password',label:'Security',keywords:['password','account'],section:'Account'},
];

export default function StaffCommandPalette(){
 const router=useRouter();const[open,setOpen]=useState(false);const[query,setQuery]=useState('');const[index,setIndex]=useState(0);const inputRef=useRef<HTMLInputElement|null>(null);
 const results=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return commands;return commands.filter(c=>[c.label,...(c.keywords||[]),c.section||''].join(' ').toLowerCase().includes(q));},[query]);
 useEffect(()=>{function onKey(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(true);}if(e.key==='Escape')setOpen(false);}window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 useEffect(()=>{if(open){setIndex(0);window.setTimeout(()=>inputRef.current?.focus(),0);}},[open]);
 useEffect(()=>{if(!open)return;function onNav(e:KeyboardEvent){if(e.key==='ArrowDown'){e.preventDefault();setIndex(v=>Math.min(v+1,Math.max(0,results.length-1)));}if(e.key==='ArrowUp'){e.preventDefault();setIndex(v=>Math.max(0,v-1));}if(e.key==='Enter'&&results[index]){e.preventDefault();router.push(results[index].href);setOpen(false);setQuery('');}}window.addEventListener('keydown',onNav);return()=>window.removeEventListener('keydown',onNav);},[open,index,results,router]);
 if(!open)return null;
 return <div className="staff-command-overlay" role="presentation" onMouseDown={()=>setOpen(false)}>
  <section className="staff-command-dialog" role="dialog" aria-modal="true" aria-label="Staff Portal quick navigation" onMouseDown={e=>e.stopPropagation()}>
   <div className="staff-command-search"><span aria-hidden="true">⌕</span><input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Jump to a staff workspace…" aria-label="Search staff workspaces"/><kbd>Esc</kbd></div>
   <div className="staff-command-hint">Use <kbd>Ctrl</kbd><span>+</span><kbd>K</kbd> anytime to open quick navigation.</div>
   <div className="staff-command-results" role="listbox" aria-label="Staff workspaces">
    {results.map((item,i)=><button key={item.href} className={'staff-command-item'+(i===index?' is-active':'')} role="option" aria-selected={i===index} onClick={()=>{router.push(item.href);setOpen(false);setQuery('');}}><span><strong>{item.label}</strong><small>{item.section}</small></span><span aria-hidden="true">↵</span></button>)}
    {!results.length&&<div className="staff-command-empty">No staff workspace matches “{query}”.</div>}
   </div>
  </section>
 </div>;
}
