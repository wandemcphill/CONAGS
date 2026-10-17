'use client';

import { useRef } from 'react';

type Props = {
  name: string;
  onNameChange: (value: string) => void;
  agree: boolean;
  onAgreeChange: (value: boolean) => void;
  onSignatureChange: (value: string) => void;
  onSign: () => void;
  busy: boolean;
  attestation: string;
  buttonLabel: string;
};

export default function LauremElectronicSignature({
  name,
  onNameChange,
  agree,
  onAgreeChange,
  onSignatureChange,
  onSign,
  busy,
  attestation,
  buttonLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const position = point(event);
    if (!canvas || !context || !position) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const position = point(event);
    if (!canvas || !context || !position) return;
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.strokeStyle = '#173a31';
    context.lineTo(position.x, position.y);
    context.stroke();
    onSignatureChange(canvas.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange('');
  }

  return (
    <section
      className="laurem-electronic-signature"
      aria-label="Electronic signature"
      style={{
        marginTop: 20,
        padding: 20,
        borderTop: '1px solid var(--line)',
        background: '#fbfdfc',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            padding: '5px 9px',
            borderRadius: 999,
            background: '#e7f5ef',
            color: 'var(--accent)',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '.08em',
          }}
        >
          ELECTRONIC SIGNATURE
        </span>
        <strong>Sign this document online</strong>
      </div>

      <p style={{ color: 'var(--muted)', lineHeight: 1.6, margin: '8px 0 16px' }}>
        Enter your full legal name and optionally draw your signature. CONAGS will record the electronic acceptance against this document.
      </p>

      <div style={{ marginTop: 10, fontWeight: 800, fontSize: 13 }}>Electronic acceptance</div>

      <label style={{ display: 'block', fontWeight: 800, fontSize: 13 }}>
        Full legal name
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          autoComplete="name"
          style={input}
        />
      </label>

      <div style={{ marginTop: 14, fontWeight: 800, fontSize: 13 }}>Optional handwritten signature</div>
      <canvas
        ref={canvasRef}
        width={900}
        height={180}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
        style={{
          display: 'block',
          width: '100%',
          height: 180,
          border: '1px solid var(--line)',
          borderRadius: 10,
          marginTop: 7,
          touchAction: 'none',
          background: '#fff',
        }}
      />
      <button type="button" onClick={clear} disabled={busy} style={{ ...buttonSecondary, marginTop: 7 }}>
        Clear signature
      </button>

      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 16, fontSize: 13, lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={agree}
          onChange={(event) => onAgreeChange(event.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>{attestation || 'I confirm that I have read this document, understand it, and agree to sign it electronically.'}</span>
      </label>

      <button
        type="button"
        disabled={busy || !name.trim() || !agree}
        onClick={onSign}
        style={{
          ...buttonPrimary,
          opacity: busy || !name.trim() || !agree ? .55 : 1,
          marginTop: 14,
        }}
      >
        {busy ? 'Signing…' : buttonLabel}
      </button>
    </section>
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
  padding: '9px 12px',
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
