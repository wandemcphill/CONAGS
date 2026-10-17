'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Notification={id:string;category:string;title:string;body:string;action_url:string|null;read_at:string|null;created_at:string};

function formatDate(value:string){return new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});}
function categoryLabel(value:string){return value.replaceAll('_',' ');}
function categoryClass(value:string){return value==='message'?'staff-badge staff-badge--live':value==='compliance'?'staff-badge staff-badge--attention':'staff-badge';}

export default function StaffNotificationsPage(){
  const router=useRouter();
  const [items,setItems]=useState<Notification[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [filter,setFilter]=useState<'all'|'unread'>('all');

  async function load(showSpinner=true){
    if(showSpinner)setLoading(true);else setRefreshing(true);
    setError('');
    try{
      const response=await fetch('/api/staff/notifications',{cache:'no-store'});
      if(response.status===401){router.replace('/staff/login');return;}
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Unable to load notifications.');
      setItems(body.notifications||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load notifications.');}
    finally{setLoading(false);setRefreshing(false);}
  }

  useEffect(()=>{void load();},[router]);

  async function markRead(id:string){
    setBusy(id);setError('');
    try{
      const response=await fetch('/api/staff/notifications',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Unable to mark notification as read.');
      setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item));
    }catch(e){setError(e instanceof Error?e.message:'Unable to mark notification as read.');}
    finally{setBusy('');}
  }

  async function markAllRead(){
    setBusy('all');setError('');
    try{
      const response=await fetch('/api/staff/notifications',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({all:true})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Unable to mark notifications as read.');
      const now=new Date().toISOString();
      setItems(current=>current.map(item=>({...item,read_at:now})));
    }catch(e){setError(e instanceof Error?e.message:'Unable to mark notifications as read.');}
    finally{setBusy('');}
  }

  const unread=useMemo(()=>items.filter(item=>!item.read_at),[items]);
  const visible=filter==='unread'?unread:items;

  return <main className="staff-page--workforce">
    <div className="staff-page-inner">
      <header className="staff-workforce-header">
        <div>
          <p className="staff-eyebrow">Staff updates</p>
          <h1 className="staff-page-title">Notifications</h1>
          <p className="staff-page-subtitle">{unread.length?unread.length+' unread notification'+(unread.length===1?'':'s')+'.':'You are all caught up.'} Important updates, decisions and action requests stay here.</p>
        </div>
        <div className="staff-workforce-actions">
          <button className={'staff-action'+(filter==='all'?' is-selected':'')} onClick={()=>setFilter('all')}>All {items.length?'('+items.length+')':''}</button>
          <button className={'staff-action'+(filter==='unread'?' is-selected':'')} onClick={()=>setFilter('unread')}>Unread {unread.length?'('+unread.length+')':''}</button>
          <button className="staff-action" onClick={()=>void load(false)} disabled={refreshing}>{refreshing?'Refreshing...':'Refresh'}</button>
          {unread.length>0&&<button className="staff-action-primary" onClick={()=>void markAllRead()} disabled={busy==='all'}>{busy==='all'?'Saving...':'Mark all as read'}</button>}
        </div>
      </header>

      {error&&<div role="alert" className="staff-workforce-card" style={{marginBottom:14,color:'#991b1b',borderColor:'#f3cccc'}}>{error}</div>}

      {loading?<section className="staff-workforce-card" aria-label="Loading notifications"><div className="staff-skeleton staff-skeleton-title small"/><div className="staff-skeleton staff-skeleton-line"/><div className="staff-skeleton staff-skeleton-block"/></section>
      :!visible.length?<section className="staff-workforce-card"><p className="staff-eyebrow">{filter==='unread'?'Unread':'Updates'}</p><h2 className="staff-card-heading">{filter==='unread'?'No unread notifications':'No notifications yet'}</h2><p className="staff-card-copy">Important staff updates, document notices, leave decisions and sponsorship milestones will appear here.</p></section>
      :<section className="staff-notification-list">
        {visible.map(item=><article key={item.id} className={'staff-notification-card'+(!item.read_at?' is-unread':'')}>
          <div className="staff-notification-layout">
            <div className="staff-notification-content">
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span className={categoryClass(item.category)}>{categoryLabel(item.category)}</span>
                {!item.read_at&&<span className="staff-badge staff-badge--attention">Unread</span>}
              </div>
              <h2 className="staff-notification-title">{item.title}</h2>
              <p className="staff-notification-body">{item.body}</p>
              <div style={{marginTop:8,color:'#829ab1',fontSize:11}}>{formatDate(item.created_at)}</div>
            </div>
            <div className="staff-notification-actions">
              {!item.read_at&&<button className="staff-action" disabled={busy===item.id} onClick={()=>void markRead(item.id)}>{busy===item.id?'Saving...':'Mark read'}</button>}
              {item.action_url&&<button className="staff-action-primary" onClick={()=>router.push(item.action_url as string)}>Open</button>}
            </div>
          </div>
        </article>)}
      </section>}
    </div>
  </main>;
}