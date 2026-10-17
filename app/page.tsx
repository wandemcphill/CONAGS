import Link from 'next/link';
import { lauremCompany } from '@/lib/laurem-company-config';

const buttonBase = {
  padding: '13px 18px',
  borderRadius: 10,
  textDecoration: 'none',
  fontWeight: 700,
};

export default function HomePage() {
  return (
    <main className="wrap" style={{ padding: '56px 0 80px' }}>
      <section className="card" style={{ padding: 40 }}>
        <div style={{ maxWidth: 800 }}>
          <p style={{ letterSpacing: '.12em', fontWeight: 700, fontSize: 12, color: 'var(--accent)' }}>CONAGS CARE</p>
          <h1 style={{ fontSize: 'clamp(38px, 6vw, 68px)', lineHeight: 1.02, margin: '12px 0 18px' }}>
            Recruitment, onboarding and workforce management in one place.
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 19, lineHeight: 1.65, marginBottom: 28 }}>
            Recruitment with structured screening, private candidate applications, interviews, compliance, documents and onboarding.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/jobs" style={{ ...buttonBase, background: 'var(--ink)', color: 'white' }}>View vacancies</Link>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginTop: 18 }}>
        {[
          ['Private candidate access', 'Applications are opened only through a secure recruitment invitation sent by Conags.'],
          ['UK & international nurses', 'Different recruitment pathways are presented according to the candidate invitation and role.'],
          ['Structured interviews', 'Complete recruitment interviews and assessments through your private candidate link when requested.'],
          ['Documents & onboarding', 'Submit required evidence and move through the recruitment and onboarding workflow securely.'],
        ].map(([title, description]) => (
          <div className="card" key={title} style={{ padding: 22 }}>
            <strong>{title}</strong>
            <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{description}</p>
          </div>
        ))}
      </section>

      <section className="card" style={{ marginTop: 18, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <strong>Already invited?</strong>
            <p style={{ color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 0' }}>
              Use the secure link in the email from {lauremCompany.publicEmails.recruitment} to access your application.
            </p>
          </div>
          <Link href="/staff/login" style={{ ...buttonBase, border: '1px solid var(--line)', display: 'inline-block' }}>
            Staff login
          </Link>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18, padding: 22 }} aria-label="Recruiter access">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <strong>Recruiter access</strong>
            <p style={{ color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 0' }}>
              Authorised CONAGS recruiters use the secure admin workspace to invite candidates and manage the hiring pipeline.
            </p>
          </div>
          <Link href="/admin/login" style={{ ...buttonBase, background: 'var(--ink)', color: 'white', display: 'inline-block' }}>
            Recruiter login
          </Link>
        </div>
      </section>
    </main>
  );
}
