'use client';

import Link from 'next/link';

export default function StaffError({ reset }:{ error:Error & { digest?:string }; reset:()=>void }) {
  return (
    <main className="staff-page">
      <div className="staff-page-inner">
        <section className="staff-skeleton-card" role="alert">
          <div className="staff-nav-label" style={{padding:0,color:'var(--accent)'}}>CONAGS STAFF PORTAL</div>
          <h1 style={{margin:'12px 0 7px'}}>We could not load this workspace.</h1>
          <p style={{color:'var(--muted)',lineHeight:1.6,maxWidth:620}}>
            The problem may be temporary. Try the page again before contacting CONAGS Admin / HR.
          </p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>
            <button onClick={reset} style={{border:0,borderRadius:10,padding:'11px 15px',background:'var(--ink)',color:'#fff',fontWeight:900,cursor:'pointer'}}>Try again</button>
            <Link href="/staff" style={{border:'1px solid var(--line)',borderRadius:10,padding:'11px 15px',background:'#fff',color:'var(--ink)',fontWeight:900,textDecoration:'none'}}>Staff home</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
