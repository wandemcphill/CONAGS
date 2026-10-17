import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLauremJob } from '@/lib/laurem-jobs';
import { lauremCompany } from '@/lib/laurem-company-config';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getLauremJob(id);
  if (!job) notFound();

  return (
    <main className="wrap" style={{ padding: '48px 0 80px' }}>
      <Link href="/jobs" style={{ textDecoration: 'none', color: 'var(--muted)' }}>← Current opportunities</Link>
      <section className="card" style={{ marginTop: 20, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div><div style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 800, letterSpacing: '.06em' }}>{job.category.toUpperCase()}</div><h1 style={{ fontSize: 'clamp(36px,6vw,58px)', margin: '8px 0 12px' }}>{job.title}</h1><p style={{ color: 'var(--muted)', fontSize: 18, lineHeight: 1.6 }}>{job.summary}</p></div>
          {job.visaSponsorship === 'overseas-and-in-country' && <span style={{ alignSelf: 'flex-start', padding: '9px 12px', borderRadius: 999, background: 'var(--soft)', color: 'var(--accent)', fontSize: 12, fontWeight: 800 }}>SPONSORSHIP PATHWAY</span>}
          {job.visaSponsorship === 'in-country-switch-only' && <span style={{ alignSelf: 'flex-start', padding: '9px 12px', borderRadius: 999, background: 'var(--soft)', color: 'var(--ink)', fontSize: 12, fontWeight: 800 }}>UK VISA SWITCH ONLY</span>}
        </div>

        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginTop: 28 }}>
          <div><h2>Locations</h2><p style={{ color: 'var(--muted)' }}>{job.locations.join(' · ')}</p></div>
          <div><h2>Recruitment pathway</h2><p style={{ color: 'var(--muted)' }}>{job.pathway.map((pathway) => pathway === 'international' ? 'International' : 'UK').join(' + ')}</p></div>
          <div><h2>Sponsorship</h2><p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{job.visaSponsorship === 'in-country-switch-only' ? 'Applicants must already be in the UK. Any sponsorship consideration is limited to an eligible in-country visa switch or extension route.' : job.visaSponsorship === 'overseas-and-in-country' ? 'International sponsorship may be considered subject to eligibility, professional registration, verification and the applicable UK immigration requirements.' : 'No sponsorship pathway is advertised for this vacancy.'}</p></div>
        </div>

        <div style={{ marginTop: 22 }}><h2>About the role</h2><p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>{job.description}</p></div>
        <div style={{ marginTop: 22 }}><h2>Essential criteria</h2><ul style={{ color: 'var(--muted)', lineHeight: 1.8, paddingLeft: 20 }}>{job.essentialCriteria.map((item) => <li key={item}>{item}</li>)}</ul></div>

        {job.visaSponsorship === 'in-country-switch-only' && <div style={{ marginTop: 24, padding: 18, borderRadius: 14, background: 'var(--soft)' }}><strong>Visa sponsorship note</strong><p style={{ marginBottom: 0, color: 'var(--muted)', lineHeight: 1.6 }}>Applicants must already be in the UK. Conags Care does not offer overseas entry-clearance sponsorship for this care role. Eligibility depends on the actual occupation, current immigration permission, lawful work history and other applicable Home Office requirements.</p></div>}
        {job.visaSponsorship === 'overseas-and-in-country' && <div style={{ marginTop: 24, padding: 18, borderRadius: 14, background: 'var(--soft)' }}><strong>International recruitment</strong><p style={{ marginBottom: 0, color: 'var(--muted)', lineHeight: 1.6 }}>This role may be considered through an international recruitment pathway. Sponsorship, registration, relocation and immigration eligibility are assessed individually against the applicable UK requirements.</p></div>}

        <div style={{ marginTop: 30, padding: 18, border: '1px solid var(--line)', borderRadius: 12 }}><strong>Applications are by invitation only</strong><p style={{ marginBottom: 0, color: 'var(--muted)', lineHeight: 1.6 }}>Conags Care does not accept open applications through this careers page. Selected candidates receive a secure application link by email from the recruitment team.</p></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}><a href={`mailto:${lauremCompany.publicEmails.recruitment}`} style={{ border: '1px solid var(--line)', padding: '13px 18px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>Contact recruitment</a><Link href="/jobs" style={{ border: '1px solid var(--line)', padding: '13px 18px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>View other roles</Link></div>
      </section>
    </main>
  );
}
