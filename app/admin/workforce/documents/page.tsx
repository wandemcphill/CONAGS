'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Staff = { id: string; laurem_id: string | null; employee_number: string; full_name: string; email: string; job_title: string; employment_status: string };

type WorkforceDocument = {
  id: string;
  staff_id: string;
  category: string;
  title: string;
  description: string | null;
  mime_type: string | null;
  source_type: string;
  status: string;
  requires_signature: boolean;
  signature_status: string;
  signature_name: string | null;
  signed_at: string | null;
  issuer_name: string;
  issued_at: string;
  superseded_at: string | null;
  superseded_by: string | null;
  displayStatus: string;
  staff: { id: string; full_name: string; employee_number: string; job_title: string } | null;
};

export default function EmploymentDocumentsAdminPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState('');
  const [allDocuments, setAllDocuments] = useState<WorkforceDocument[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [form, setForm] = useState({ title: '', category: 'compliance', description: '', content: '', requiresSignature: true, template: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadStaff() {
    const r = await fetch('/api/admin/workforce/staff?limit=100', { cache: 'no-store' });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'Unable to load staff.');
    setStaff(b.staff || []);
  }

  async function loadDocuments() {
    try {
      const params = new URLSearchParams();
      if (staffId) params.set('staffId', staffId);
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);

      const r = await fetch(`/api/admin/workforce/documents?${params.toString()}`, { cache: 'no-store' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Unable to load documents.');
      setAllDocuments(b.documents || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load documents.');
    }
  }

  useEffect(() => {
    loadStaff().catch((e) => setError(e instanceof Error ? e.message : 'Unable to load staff.'));
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [staffId, statusFilter, categoryFilter]);

  const selected = useMemo(() => staff.find((s) => s.id === staffId) || null, [staff, staffId]);

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = new FormData();
      data.set('title', form.title);
      data.set('category', form.category);
      data.set('description', form.description);
      data.set('content', form.content);
      data.set('requiresSignature', String(form.requiresSignature));
      data.set('template', form.template);
      if (file) data.set('file', file);

      const r = await fetch(`/api/admin/workforce/staff/${encodeURIComponent(selected.id)}/documents`, { method: 'POST', body: data });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Unable to issue document.');

      setNotice('Document successfully issued to staff member.');
      setForm({ title: '', category: 'compliance', description: '', content: '', requiresSignature: true, template: '' });
      setFile(null);
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to issue document.');
    } finally {
      setBusy(false);
    }
  }

  function useJobDescription() {
    if (!selected) return;
    setForm((f) => ({
      ...f,
      title: `${selected.job_title} Job Description`,
      category: 'job_description',
      description: 'Role-specific job description issued by CONAGS Care Group.',
      content: '',
      requiresSignature: true,
      template: 'job_description',
    }));
    setFile(null);
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f4f7fb', fontFamily: 'system-ui', padding: '28px 18px 70px', color: '#102a43' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <Link href="/admin/workforce" style={{ color: '#0f766e', fontWeight: 800, textDecoration: 'none' }}>← Workforce administration</Link>
        <header style={{ margin: '18px 0 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>CONAGS CARE GROUP · WORKFORCE ADMINISTRATION</div>
          <h1 style={{ margin: '6px 0' }}>Authoritative Document Administration</h1>
          <p style={{ color: '#627d98', margin: 0 }}>Issue official workforce documents, track signature completion, and preserve document history.</p>
        </header>

        {error && <div style={{ background: '#fff4f4', border: '1px solid #f3cccc', padding: 14, borderRadius: 12, color: '#8a2323', marginBottom: 14 }}>{error}</div>}
        {notice && <div style={{ background: '#eefaf4', border: '1px solid #c9ead8', padding: 14, borderRadius: 12, color: '#176b4f', marginBottom: 14 }}>{notice}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,.75fr) minmax(0,1.25fr)', gap: 16 }}>
          <article style={{ background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Issue Official Document</h2>
            <label style={{ display: 'block', fontWeight: 800, fontSize: 13 }}>
              Select Employee
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: 11, border: '1px solid #cbd5e1', borderRadius: 9 }}>
                <option value="">-- All Workforce / Select Specific Employee --</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} · {s.job_title} ({s.employee_number})</option>
                ))}
              </select>
            </label>

            {selected && (
              <div style={{ padding: 12, background: '#f7fafc', borderRadius: 10, marginTop: 12, fontSize: 13, color: '#486581' }}>
                <strong>{selected.full_name}</strong> ({selected.email})<br />
                Status: {selected.employment_status} · Role: {selected.job_title}
              </div>
            )}

            <button type="button" onClick={useJobDescription} disabled={!selected} style={{ marginTop: 12, border: '1px solid #dbe5ea', background: '#fff', padding: '9px 12px', borderRadius: 9, fontWeight: 800, cursor: 'pointer' }}>
              Use Job Description Template
            </button>

            <form onSubmit={issue} style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <input required placeholder="Document Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ padding: 11, border: '1px solid #cbd5e1', borderRadius: 9 }} />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ padding: 11, border: '1px solid #cbd5e1', borderRadius: 9 }}>
                {['contract', 'job_description', 'offer_letter', 'policy', 'handbook', 'payslip', 'compliance', 'other'].map((v) => (
                  <option key={v} value={v}>{v.replaceAll('_', ' ').toUpperCase()}</option>
                ))}
              </select>
              <textarea placeholder="Description / Notes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ padding: 11, border: '1px solid #cbd5e1', borderRadius: 9, fontFamily: 'inherit' }} />
              <textarea placeholder="Document Body Text..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} style={{ padding: 11, border: '1px solid #cbd5e1', borderRadius: 9, fontFamily: 'inherit' }} />
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
              <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13, fontWeight: 800 }}>
                <input type="checkbox" checked={form.requiresSignature} onChange={(e) => setForm({ ...form, requiresSignature: e.target.checked })} />
                Require employee electronic signature
              </label>

              <button disabled={busy || !selected} style={{ background: '#102a43', color: '#fff', border: 0, padding: '12px 16px', borderRadius: 9, fontWeight: 900, cursor: 'pointer' }}>
                {busy ? 'Issuing Document…' : 'Issue Document to Employee'}
              </button>
            </form>
          </article>

          <article style={{ background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ margin: '0 0 4px' }}>Workforce Document Directory</h2>
                <div style={{ color: '#627d98', fontSize: 13 }}>Authoritative log of all issued workforce documents.</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 9, border: '1px solid #cbd5e1', borderRadius: 8 }}>
                <option value="">All Display Statuses</option>
                <option value="issued">Issued / Active</option>
                <option value="pending">Awaiting Signature</option>
                <option value="signed">Signed</option>
                <option value="superseded">Superseded</option>
                <option value="revoked">Withdrawn</option>
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: 9, border: '1px solid #cbd5e1', borderRadius: 8 }}>
                <option value="">All Categories</option>
                <option value="contract">Contract</option>
                <option value="job_description">Job Description</option>
                <option value="policy">Policy</option>
                <option value="handbook">Handbook</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 15 }}>
              {allDocuments.map((d) => (
                <div key={d.id} style={{ padding: 14, border: '1px solid #edf2f7', borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{d.title}</strong>
                      <div style={{ fontSize: 12, color: '#627d98', marginTop: 3 }}>
                        {d.staff ? `${d.staff.full_name} (${d.staff.employee_number})` : 'Employee'} · {d.category.replaceAll('_', ' ')} · Issued {new Date(d.issued_at).toLocaleString('en-GB')}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 900,
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: d.displayStatus === 'Signed' ? '#e8f7ee' : d.displayStatus === 'Awaiting signature' ? '#fff4e5' : '#f1f5f9',
                      color: d.displayStatus === 'Signed' ? '#166534' : d.displayStatus === 'Awaiting signature' ? '#9a3412' : '#334155',
                    }}>
                      {d.displayStatus.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#627d98', marginTop: 8 }}>
                    Issuer: {d.issuer_name} {d.signed_at ? `· Signed by ${d.signature_name} on ${new Date(d.signed_at).toLocaleString('en-GB')}` : ''}
                  </div>
                </div>
              ))}

              {!allDocuments.length && <div style={{ color: '#627d98', padding: '16px 0', textAlign: 'center' }}>No documents match the current criteria.</div>}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
