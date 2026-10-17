'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import StaffCommandPalette from '@/components/StaffCommandPalette';
import StaffTeamMessageQuickAction from '@/components/StaffTeamMessageQuickAction';

type NavItem = { href:string; label:string; short:string; badge?:'messages'|'notifications'|'documents'|'timesheets' };
type NavSummary = { unreadNotifications:number; unreadMessages:number; pendingSignatures:number; timesheetActionNeeded:number; upcomingShifts:number };

const primary:NavItem[]=[
 {href:'/staff',label:'Home',short:'Home'},
 {href:'/staff/week',label:'My Week',short:'Week'},
 {href:'/staff/shifts',label:'My Shifts',short:'Shifts'},
 {href:'/staff/timesheets',label:'Timesheets',short:'Time',badge:'timesheets'},
 {href:'/staff/messages',label:'Messages',short:'Chat',badge:'messages'},
 {href:'/staff/documents',label:'Documents',short:'Docs',badge:'documents'},
];
const secondary:NavItem[]=[
 {href:'/staff/requests',label:'My Requests',short:'Cases'},
 {href:'/staff/attendance',label:'Attendance',short:'Attend'},
 {href:'/staff/leave',label:'Leave',short:'Leave'},
 {href:'/staff/training',label:'Training',short:'Train'},
 {href:'/staff/payroll',label:'Payroll',short:'Pay'},
 {href:'/staff/availability',label:'Work Preferences',short:'Rota'},
 {href:'/staff/compliance',label:'DBS & PVG',short:'Checks'},
 {href:'/staff/laurem-assurance',label:'CONAGS Assurance',short:'Trust'},
 {href:'/staff/visa-help',label:'Visa Help',short:'Help'},
 {href:'/staff/visa-sponsorship',label:'Visa & Sponsorship',short:'Visa'},
];
function isActive(pathname:string,href:string){return href==='/staff'?pathname==='/staff':pathname.startsWith(href);}
function badgeValue(kind:NavItem['badge'],summary:NavSummary|null){if(!kind||!summary)return 0;if(kind==='messages')return summary.unreadMessages;if(kind==='notifications')return summary.unreadNotifications;if(kind==='documents')return summary.pendingSignatures;if(kind==='timesheets')return summary.timesheetActionNeeded;return 0;}

export default function StaffShell({children}:{children:React.ReactNode}){
 const pathname=usePathname();const[summary,setSummary]=useState<NavSummary|null>(null);
 const publicStaffPaths=['/staff/login','/staff/activate','/staff/password-reset'];
 const publicPath=publicStaffPaths.some(path=>pathname===path||pathname.startsWith(path+'/'));
 useEffect(()=>{if(publicPath)return;let live=true;fetch('/api/staff/navigation-summary',{cache:'no-store'}).then(async r=>r.ok?r.json():null).then(b=>{if(live&&b)setSummary(b);}).catch(()=>undefined);return()=>{live=false;};},[publicPath]);
 if(publicPath)return <>{children}</>;
 const renderItem=(item:NavItem)=>{const active=isActive(pathname,item.href);const count=badgeValue(item.badge,summary);return <Link key={item.href} href={item.href} prefetch className={'staff-nav-link'+(active?' is-active':'')} aria-current={active?'page':undefined}><span className="staff-nav-dot" aria-hidden="true"/><span className="staff-nav-link-label">{item.label}</span>{count>0&&<span className="staff-nav-badge">{count>99?'99+':count}</span>}</Link>;};
 return <div className="staff-app"><StaffCommandPalette/><a className="staff-skip-link" href="#staff-main-content">Skip to content</a><aside className="staff-sidebar" aria-label="Staff portal navigation"><div className="staff-brand"><div className="staff-brand-mark" aria-hidden="true">L</div><div><strong>CONAGS</strong><span>Staff Portal</span></div></div><nav className="staff-nav" aria-label="Workspace"><div className="staff-nav-label">Workspace</div>{primary.concat(secondary).map(renderItem)}</nav><div className="staff-sidebar-footer"><StaffTeamMessageQuickAction /><Link href="/staff/profile" className={'staff-nav-link'+(isActive(pathname,'/staff/profile')?' is-active':'')}><span className="staff-nav-dot" aria-hidden="true"/>My Profile</Link><Link href="/staff/change-password" className={'staff-nav-link'+(isActive(pathname,'/staff/change-password')?' is-active':'')}><span className="staff-nav-dot" aria-hidden="true"/>Security</Link></div></aside><div className="staff-main"><div className="staff-mobile-header"><Link href="/staff" className="staff-mobile-brand"><span className="staff-brand-mark" aria-hidden="true">L</span><span>CONAGS</span></Link><div className="staff-mobile-header-actions"><StaffTeamMessageQuickAction compact /><Link href="/staff/week" className="staff-mobile-week">My Week</Link><Link href="/staff/profile" className="staff-mobile-profile">Profile</Link></div></div><div id="staff-main-content" className="staff-content">{children}</div><nav className="staff-bottom-nav" aria-label="Mobile staff navigation">{primary.map(item=>{const active=isActive(pathname,item.href);const count=badgeValue(item.badge,summary);return <Link key={item.href} href={item.href} prefetch className={'staff-bottom-link'+(active?' is-active':'')} aria-current={active?'page':undefined}><span className="staff-bottom-icon" aria-hidden="true">{item.short.slice(0,1)}</span><span>{item.short}</span>{count>0&&<span className="staff-bottom-badge">{count>99?'99+':count}</span>}</Link>;})}<Link href="/staff/profile" className={'staff-bottom-link'+(isActive(pathname,'/staff/profile')?' is-active':'')}><span className="staff-bottom-icon" aria-hidden="true">P</span><span>More</span></Link></nav></div></div>;
}
