'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { LAUREM_LETTERHEAD_CSS } from '@/lib/laurem-letterhead';
import {
  LAUREM_CONTRACT_PRINT_CSS,
  renderLauremContractDocument,
  type LauremContractDocumentInput,
} from '@/lib/laurem-contract-document-renderer';

export default function LauremContractDocument(input: LauremContractDocumentInput & { signaturePanel?: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const style = document.createElement('style');
    style.textContent = contractScreenCss;
    node.appendChild(style);
    return () => style.remove();
  }, []);

  function printDocument() {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return;
    popup.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>CONAGS Employment Contract</title><style>' +
        LAUREM_CONTRACT_PRINT_CSS +
        '</style></head><body>' +
        renderLauremContractDocument(input) +
        '</body></html>',
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="laurem-contract-view" ref={ref}>
      <div className="laurem-contract-actions">
        <button type="button" onClick={printDocument}>
          Print / Save as PDF
        </button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: renderLauremContractDocument(input) }} />
      {input.signaturePanel ? <div className="laurem-contract-signing">{input.signaturePanel}</div> : null}
    </div>
  );
}

const contractScreenCss = [
  LAUREM_LETTERHEAD_CSS,
  LAUREM_CONTRACT_PRINT_CSS,
  '.laurem-contract-view{background:#edf2f4;border:1px solid #d8e1e5;border-radius:16px;padding:14px}',
  '.laurem-contract-actions{display:flex;justify-content:flex-end;padding:0 0 10px}',
  '.laurem-contract-actions button{border:1px solid #d8e1e5;border-radius:10px;background:#fff;color:#16394a;padding:10px 14px;font-weight:800;cursor:pointer}',
  '.laurem-contract-view .laurem-contract-document{width:min(190mm,100%);margin:0 auto;background:#fff;box-shadow:0 14px 36px rgba(22,57,74,.10);overflow:hidden}',
  '@media (max-width:760px){.laurem-contract-view .laurem-contract-document{width:100%}}',
].join('');
