'use client';

import { useEffect, useState } from 'react';
import LauremCandidateJourney from '@/components/LauremCandidateJourney';
import LauremContractDocument from '@/components/LauremContractDocument';
import LauremElectronicSignature from '@/components/LauremElectronicSignature';

export default function ContractAcceptancePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('');
  const [contract, setContract] = useState<any>(null);
  const [name, setName] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [documentPackUrl, setDocumentPackUrl] = useState('');
  const [signatureData, setSignatureData] = useState('');

  const attestation = 'I confirm that I have read and understood this employment contract and agree to sign it electronically.';

  useEffect(() => {
    params.then((value) => setToken(value.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/contracts/accept?token=' + encodeURIComponent(token), { headers: { 'x-contract-token': token } })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load contract.');
        return body;
      })
      .then((body) => setContract(body.contract))
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load contract.'));
  }, [token]);

  async function respond(accepted: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const signedSignatureData = signatureData || null;
      const response = await fetch('/api/contracts/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-contract-token': token,
        },
        body: JSON.stringify({
          accepted,
          acceptedByName: name,
          declineReason,
          signatureData: signedSignatureData,
          attestation,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to process your response.');
      setDocumentPackUrl(body.documentPackUrl || '');
      setMessage(
        accepted
          ? 'Your employment contract has been signed. Your Job Description, Handbook and onboarding preparation checklist are already included in your CONAGS offer package.'
          : 'Your response has been recorded. CONAGS will contact you regarding the next steps.',
      );
      setContract((current: any) => current ? { ...current, status: accepted ? 'accepted' : 'declined' } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to process your response.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ padding: '38px 0 80px', maxWidth: 1000 }}>
      <LauremCandidateJourney current="documents" />
      <section className="card" style={{ padding: 28 }}>
        <p style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.08em' }}>CONAGS CARE</p>
        <h1>Employment contract</h1>
        <p style={{ color: 'var(--muted)' }}>Review and sign your contract online. You do not need to download or print it.</p>

        {message && (
          <div role="status" style={{ padding: 14, margin: '16px 0', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--soft)' }}>
            {message}
          </div>
        )}

        {contract?.contract_content && (
          <LauremContractDocument
            content={contract.contract_content}
            employeeName={contract.employeeName || contract.employee_name || contract.accepted_by_name || undefined}
            jobTitle={contract.job_title}
            status={contract.status}
            version={contract.version}
            acceptedByName={contract.accepted_by_name}
            acceptedAt={contract.accepted_at}
            signaturePanel={contract.status === 'accepted' ? null : (
              <LauremElectronicSignature
                name={name}
                onNameChange={setName}
                agree={agree}
                onAgreeChange={setAgree}
                onSignatureChange={setSignatureData}
                onSign={() => void respond(true)}
                busy={busy}
                attestation={attestation}
                buttonLabel="Sign contract electronically"
              />
            )}
          />
        )}

        {contract?.status === 'accepted' && (
          <section style={{ marginTop: 22, padding: 18, borderRadius: 12, background: '#f7fcf9' }}>
            <strong>Contract signed successfully</strong>
            <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              Next, open the Job Description and Handbook from the offer-package email and sign each online. Your onboarding preparation checklist is available in the same package.
            </p>
            {documentPackUrl ? (
              <a href={documentPackUrl} style={buttonPrimary}>Continue to Job Description & Handbook</a>
            ) : (
              <p style={{ color: 'var(--muted)' }}>Use the Job Description & Handbook link in your original CONAGS offer-package email.</p>
            )}
          </section>
        )}

        {contract?.status === 'declined' ? (
          <div style={{ marginTop: 22, padding: 16, borderRadius: 10, background: '#fff8f8' }}>
            Your response has been recorded. CONAGS will contact you regarding the next steps.
          </div>
        ) : contract?.status === 'accepted' ? null : (
          <>
            <div style={{ marginTop: 20 }}>
              <label>
                Reason for declining (optional)
                <textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} rows={3} style={input} />
              </label>
            </div>

            <div style={{ marginTop: 18 }}>
              <button disabled={busy} onClick={() => void respond(false)} style={buttonSecondary}>
                Decline
              </button>
            </div>
          </>
        )}
      </section>
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
};

const buttonSecondary: React.CSSProperties = {
  display: 'inline-block',
  padding: '9px 12px',
  borderRadius: 9,
  background: 'white',
  color: 'var(--ink)',
  textDecoration: 'none',
  border: '1px solid var(--line)',
  fontWeight: 800,
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
