'use client';

import { useEffect, useState } from 'react';
import LauremCandidateJourney from '@/components/LauremCandidateJourney';
import LauremContractDocument from '@/components/LauremContractDocument';
import LauremDocument from '@/components/LauremDocument';
import LauremElectronicSignature from '@/components/LauremElectronicSignature';

type DocumentRow = {
  id: string;
  document_type: 'job_description' | 'handbook';
  title: string;
  content: string;
  signature_status: 'pending' | 'signed';
  signed_name?: string | null;
  signed_at?: string | null;
};

type PageData = {
  application: { full_name: string; role_applied: string };
  pack: { id: string; status: string; expires_at: string };
  contract: { status: string; accepted_at?: string | null; job_title?: string | null; version?: number | null; contract_content?: string | null; accepted_by_name?: string | null } | null;
  readiness: Array<{ id: string; item_key: string; title: string; description: string; required: boolean; status: 'pending' | 'completed' | 'waived' }>;
  documents: DocumentRow[];
};

const attestation =
  'I confirm that I have read this document, understand it, and agree to sign it electronically.';

export default function CandidateDocumentsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState('');
  const [data, setData] = useState<PageData | null>(null);
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const [showAcceptedContract, setShowAcceptedContract] = useState(false);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [signatureData, setSignatureData] = useState('');
  const [onboardingLink, setOnboardingLink] = useState('');
  const [waitingForReadiness, setWaitingForReadiness] = useState(false);
  const [waitingForContract, setWaitingForContract] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    params.then((value) => setToken(value.token));
  }, [params]);

  async function load() {
    if (!token) return;
    setError('');
    try {
      const response = await fetch('/api/candidate-documents?token=' + encodeURIComponent(token), {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load your documents.');
      setData(body);
      if (body.onboardingLink) setOnboardingLink(body.onboardingLink);
      setWaitingForReadiness(Boolean(body.waitingForReadiness));
      setWaitingForContract(Boolean(body.waitingForContract));
      if (!name && body.application?.full_name) setName(body.application.full_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your documents.');
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function signSelected() {
    if (!selected || busy) return;
    if (!name.trim() || !agree) {
      setError('Enter your full legal name and confirm the electronic-signature attestation.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/candidate-documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          documentId: selected.id,
          signedName: name.trim(),
          signatureData,
          attestation,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to sign the document.');

      setSelected(null);
      setAgree(false);
      setSignatureData('');
      if (body.onboardingLink) setOnboardingLink(body.onboardingLink);
      setWaitingForReadiness(Boolean(body.waitingForReadiness));
      setWaitingForContract(Boolean(body.waitingForContract));
      setMessage(
        body.packStatus === 'completed'
          ? 'Your employment documents are complete. Your contract, Job Description and Handbook will not be requested again.'
          : 'Document signed successfully.',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign the document.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <main className="wrap" style={{ padding: '70px 0', maxWidth: 860 }}>
        <section className="card" style={{ padding: 30, textAlign: 'center' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 900, letterSpacing: '.08em' }}>
            CONAGS CARE
          </p>
          <h1>We could not open your employment documents</h1>
          <p style={{ color: 'var(--muted)', lineHeight: 1.65 }}>{error}</p>
        </section>
      </main>
    );
  }

  const signedCount = data?.documents.filter((item) => item.signature_status === 'signed').length || 0;
  const complete = data?.pack.status === 'completed';

  return (
    <main className="wrap" style={{ padding: '38px 0 90px', maxWidth: 980 }}>
      <LauremCandidateJourney current="documents" />
      <section className="card" style={{ padding: 30 }}>
        <p style={{ color: 'var(--accent)', fontWeight: 900, letterSpacing: '.08em', fontSize: 12 }}>
          CONAGS CARE · OFFER & DOCUMENTS
        </p>
        <h1>Review and sign your employment documents</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.65 }}>
          Hello {data?.application.full_name || 'there'}. Your CONAGS employment offer package contains your Employment Contract, Job Description, Handbook and onboarding preparation checklist. Review each document online and complete the required preparation steps.
        </p>

        {error && (
          <div role="alert" className="card" style={{ margin: '16px 0', padding: 14, color: '#8a2323', background: '#fff8f8' }}>
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="card" style={{ margin: '16px 0', padding: 14, background: 'var(--soft)' }}>
            {message}
          </div>
        )}

        <section style={{ marginTop: 18, padding: 16, borderRadius: 12, background: 'var(--soft)' }}>
          <strong>Onboarding preparation</strong>
          <p style={{ color: 'var(--muted)', lineHeight: 1.55, margin: '6px 0 12px' }}>
            These are the recruitment checks that must be complete before CONAGS opens your formal onboarding and Staff Portal activation. Completing them here does not require you to sign your Contract, Job Description or Handbook again.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {data?.readiness.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 10, borderRadius: 9, background: 'white', border: '1px solid var(--line)' }}>
                <div>
                  <strong>{item.title}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>{item.description}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>
                  {item.status === 'completed' || item.status === 'waived' ? 'READY' : 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: 'var(--soft)' }}>
          <strong>{signedCount} of {data?.documents.length || 0} documents signed</strong>
          <div style={{ color: 'var(--muted)', marginTop: 5 }}>
            Employment Contract {data?.contract?.status === 'accepted' ? '✓' : 'awaiting signature'} · Job Description {data?.documents.some((item) => item.document_type === 'job_description' && item.signature_status === 'signed') ? '✓' : 'awaiting signature'} · Handbook {data?.documents.some((item) => item.document_type === 'handbook' && item.signature_status === 'signed') ? '✓' : 'awaiting signature'}
          </div>
        </div>

        {data?.contract?.status === 'accepted' && data.contract.contract_content && (
          <article className="card" style={{ padding: 18, marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', letterSpacing: '.08em' }}>EMPLOYMENT CONTRACT</div>
                <h2 style={{ fontSize: 20, margin: '6px 0' }}>{data.contract.job_title || 'Employment Contract'}</h2>
                <p style={{ color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Accepted electronically{data.contract.accepted_by_name ? ` by ${data.contract.accepted_by_name}` : ''}. This copy is read-only and does not request a second signature.
                </p>
              </div>
              <span style={{ padding: '6px 9px', borderRadius: 999, background: '#e7f8ef', fontSize: 12, fontWeight: 900 }}>SIGNED</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <button type="button" onClick={() => setShowAcceptedContract(true)} style={buttonPrimary}>Open accepted contract</button>
            </div>
          </article>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          {data?.documents.map((document) => (
            <article key={document.id} className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', letterSpacing: '.08em' }}>
                    {document.document_type === 'job_description' ? 'ROLE DOCUMENT' : 'EMPLOYMENT HANDBOOK'}
                  </div>
                  <h2 style={{ fontSize: 20, margin: '6px 0' }}>{document.title}</h2>
                  <p style={{ color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                    {document.signature_status === 'signed' ? 'Signed and permanently recorded.' : 'Read online. No download is required before signing.'}
                  </p>
                </div>
                <span style={{ padding: '6px 9px', borderRadius: 999, background: document.signature_status === 'signed' ? '#e7f8ef' : '#fff4d8', fontSize: 12, fontWeight: 900 }}>
                  {document.signature_status === 'signed' ? 'SIGNED' : 'SIGNATURE REQUIRED'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(document);
                    setAgree(false);
                    setSignatureData('');
                  }}
                  style={buttonPrimary}
                >
                  {document.signature_status === 'signed' ? 'Open signed document' : 'Read & sign online'}
                </button>
                {document.signature_status === 'signed' && (
                  <a
                    href={'/api/candidate-documents/download?token=' + encodeURIComponent(token) + '&documentId=' + encodeURIComponent(document.id)}
                    style={buttonSecondary}
                  >
                    Download designed signed copy
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        {complete && waitingForContract && (
          <section style={{ marginTop: 22, padding: 18, border: '1px solid var(--line)', borderRadius: 12, background: '#fffaf0' }}>
            <strong>Employment contract signature still required</strong>
            <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              Your Job Description and Handbook are recorded as signed. The employment contract is still awaiting signature, so CONAGS will not open formal Staff Portal onboarding yet. Please use your employment-contract link to complete the contract signature first.
            </p>
          </section>
        )}

        {complete && !waitingForContract && (
          <section style={{ marginTop: 22, padding: 18, border: '1px solid var(--line)', borderRadius: 12, background: '#f7fcf9' }}>
            <strong>Employment documents complete</strong>
            <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              Your contract, Job Description and Handbook are now recorded as signed. CONAGS will not ask you to sign those three documents again during onboarding.
            </p>
            {onboardingLink ? (
              <a href={onboardingLink} style={buttonPrimary}>Continue to onboarding</a>
            ) : (
              <p style={{ marginBottom: 0, color: 'var(--muted)' }}>
                {waitingForReadiness
                  ? 'Your documents are complete. CONAGS is finishing the required recruitment checks before opening onboarding.'
                  : 'CONAGS will open your onboarding link once the remaining recruitment checks are ready.'}
              </p>
            )}
          </section>
        )}
      </section>

      {showAcceptedContract && data?.contract?.contract_content && (
        <div
          role="dialog"
          aria-modal="true"
          style={overlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowAcceptedContract(false);
          }}
        >
          <section className="card" style={{ width: 'min(1040px, 100%)', maxHeight: '94vh', overflow: 'auto', padding: 18, background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '4px 8px 8px' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', letterSpacing: '.08em' }}>ACCEPTED EMPLOYMENT CONTRACT</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>Read-only copy · CONAGS Care Ltd</div>
              </div>
              <button type="button" onClick={() => setShowAcceptedContract(false)} style={buttonSecondary}>Close</button>
            </div>
            <LauremContractDocument
              content={data.contract.contract_content}
              employeeName={data.application.full_name}
              jobTitle={data.contract.job_title || data.application.role_applied}
              status={data.contract.status}
              version={data.contract.version}
              acceptedByName={data.contract.accepted_by_name}
              acceptedAt={data.contract.accepted_at}
            />
          </section>
        </div>
      )}

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          style={overlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section className="card" style={{ width: 'min(1040px, 100%)', maxHeight: '94vh', overflow: 'auto', padding: 18, background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '4px 8px 8px' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', letterSpacing: '.08em' }}>{selected.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>CONAGS Care Ltd</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={buttonSecondary}>Close</button>
            </div>

            <LauremDocument
              documentType={selected.document_type}
              title={selected.title}
              content={selected.content}
              signature={selected.signature_status === 'signed' ? { name: selected.signed_name, signedAt: selected.signed_at } : null}
              signaturePanel={selected.signature_status !== 'signed' ? (
                <LauremElectronicSignature
                  name={name}
                  onNameChange={setName}
                  agree={agree}
                  onAgreeChange={setAgree}
                  onSignatureChange={setSignatureData}
                  onSign={() => void signSelected()}
                  busy={busy}
                  attestation={attestation}
                  buttonLabel="Sign document electronically"
                />
              ) : null}
            />

          </section>
        </div>
      )}
    </main>
  );
}

const buttonPrimary: React.CSSProperties = {
  display: 'inline-block',
  padding: '11px 14px',
  borderRadius: 9,
  background: 'var(--ink)',
  color: 'white',
  textDecoration: 'none',
  border: 0,
  fontWeight: 900,
  cursor: 'pointer',
};

const buttonSecondary: React.CSSProperties = {
  display: 'inline-block',
  padding: '11px 14px',
  borderRadius: 9,
  background: 'white',
  color: 'var(--ink)',
  textDecoration: 'none',
  border: '1px solid var(--line)',
  fontWeight: 800,
  cursor: 'pointer',
};

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: 11,
  marginTop: 7,
  border: '1px solid var(--line)',
  borderRadius: 9,
  font: 'inherit',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(14,28,23,.68)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 18,
  zIndex: 50,
};

