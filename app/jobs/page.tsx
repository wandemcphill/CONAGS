import Link from 'next/link';
import { lauremCompany } from '@/lib/laurem-company-config';
import { getActiveLauremJobs } from '@/lib/laurem-jobs';

export default function JobsPage() {
  const jobs = getActiveLauremJobs();

  return (
    <main className="wrap" style={{ padding: '48px 0 80px' }}>
      <Link href="/" style={{ textDecoration: 'none', color: 'var(--muted)' }}>← Recruitment portal</Link>
      <h1 style={{ fontSize: 48, marginBottom: 10 }}>Current opportunities</h1>
      <p style={{ color: 'var(--muted)', fontSize: 18, maxWidth: 760, lineHeight: 1.6 }}>
        Explore opportunities with {lauremCompany.tradingName}. Applications are by recruitment invitation only. Sponsorship and right-to-work requirements are assessed as part of the recruitment process.
      </p>
      <div style={{ display: 'grid', gap: 16, marginTop: 28 }}>
        {jobs.map((job) => (
          <article className="card" key={job.id} style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 800, letterSpacing: '.07em' }}>{job.category.toUpperCase()}</div>
                <h2 style={{ margin: '6px 0 0' }}>{job.title}</h2>
                <p style={{ color: 'var(--muted)', marginBottom: 0 }}>{job.locations.join(' · ')}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {job.visaSponsorship === 'overseas-and-in-country' && <span style={{ padding: '7px 10px', borderRadius: 999, background: '#eaf5f0', color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>SPONSORSHIP PATHWAY</span>}
                {job.visaSponsorship === 'in-country-switch-only' && <span style={{ padding: '7px 10px', borderRadius: 999, background: '#f4f1e8', color: 'var(--ink)', fontSize: 12, fontWeight: 700 }}>UK VISA SWITCH ONLY</span>}
                <Link href={`/jobs/${job.id}`} style={{ border: '1px solid var(--line)', padding: '11px 14px', borderRadius: 9, textDecoration: 'none', fontWeight: 700 }}>Explore role</Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      <section className="card" style={{ marginTop: 24, padding: 20, background: 'var(--soft)' }}>
        <strong>Important visa note</strong>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 0 }}>
          Senior Support Worker and Care Worker / Healthcare Assistant opportunities that may qualify for sponsorship are available on an in-country switch basis only. Conags Care does not offer overseas entry-clearance sponsorship for these care roles. Eligibility depends on the actual occupation, your current UK immigration permission, lawful work history and all applicable Home Office requirements.
        </p>
      </section>
    </main>
  );
}
