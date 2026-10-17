'use client';
import type { ReactNode } from 'react';

export function StaffPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={'staff-page staff-page--workforce ' + className.trim()}>{children}</main>;
}
export function StaffPageInner({ children }: { children: ReactNode }) { return <div className="staff-page-inner">{children}</div>; }
export function StaffPageHeader({ eyebrow, title, subtitle, actions }: { eyebrow:string; title:string; subtitle?:string; actions?:ReactNode }) {
  return <header className="staff-workforce-header"><div><p className="staff-eyebrow">{eyebrow}</p><h1 className="staff-page-title">{title}</h1>{subtitle && <p className="staff-page-subtitle">{subtitle}</p>}</div>{actions && <div className="staff-workforce-actions">{actions}</div>}</header>;
}
export function StaffPanel({ children, className = '' }: { children:ReactNode; className?:string }) { return <section className={'staff-workforce-card ' + className.trim()}>{children}</section>; }
export function StaffAction({ href, children, primary=false, onClick, disabled, type='button' }: { href?:string; children:ReactNode; primary?:boolean; onClick?:()=>void; disabled?:boolean; type?:'button'|'submit' }) {
  const className = primary ? 'staff-action-primary' : 'staff-action';
  if (href) return <a className={className} href={href}>{children}</a>;
  return <button className={className} type={type} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function StaffBadge({ children, tone='neutral' }: { children:ReactNode; tone?:'neutral'|'live'|'attention'|'danger' }) { return <span className={'staff-badge staff-badge--' + tone}>{children}</span>; }
export function StaffMetric({ label, value, detail }: { label:string; value:ReactNode; detail?:ReactNode }) { return <article className="staff-stat"><div className="staff-stat-value">{value}</div><div className="staff-stat-label">{label}</div>{detail && <div className="staff-stat-detail">{detail}</div>}</article>; }
export function StaffNotice({ children, tone='info' }: { children:ReactNode; tone?:'info'|'success'|'warning'|'danger' }) { return <div className={'staff-notice staff-notice--' + tone}>{children}</div>; }
export function StaffLoading({ label='Loading your workspace…' }: { label?:string }) {
  return <StaffPage><StaffPageInner><div className="staff-skeleton-card"><div className="staff-skeleton staff-skeleton-eyebrow"/><div className="staff-skeleton staff-skeleton-title"/><div className="staff-skeleton staff-skeleton-line"/><div className="staff-skeleton staff-skeleton-line short"/><div className="staff-skeleton staff-skeleton-block"/><span className="staff-sr-only">{label}</span></div></StaffPageInner></StaffPage>;
}
export function StaffSectionHeader({ title, copy, actions }: { title:string; copy?:ReactNode; actions?:ReactNode }) {
  return <div className="staff-section-heading"><div><h2 className="staff-card-heading">{title}</h2>{copy && <p className="staff-card-copy">{copy}</p>}</div>{actions && <div className="staff-workforce-actions">{actions}</div>}</div>;
}
