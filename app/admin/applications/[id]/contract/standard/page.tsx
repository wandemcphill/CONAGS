'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function StandardContractPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || '';
  return (
    <main className="wrap" style={{ padding: '70px 0 80px', maxWidth: 800 }}>
      <section className="card" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.08em' }}>CONAGS EMPLOYMENT CONTRACT</p>
        <h1>Use the unified CONAGS contract workflow</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
          Standard and international employment contracts are now prepared from the same CONAGS contract workspace. The candidate journey remains the same: issue contract, candidate signs, then Job Description and Handbook follow in the secure document pack.
        </p>
        {id && (
          <Link
            href={'/admin/applications/' + encodeURIComponent(id) + '/contract'}
            style={{ display: 'inline-block', marginTop: 12, padding: '12px 16px', border: '1px solid var(--line)', borderRadius: 9, textDecoration: 'none', fontWeight: 800 }}
          >
            Open contract workspace
          </Link>
        )}
      </section>
    </main>
  );
}
