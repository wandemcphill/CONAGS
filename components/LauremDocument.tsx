'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { PRINT_CSS, renderLauremDocumentBody, renderLauremPrintableHtml } from '@/lib/laurem-document-renderer';

type DocumentType = 'job_description' | 'handbook';

export default function LauremDocument({
  documentType,
  title,
  content,
  signature,
  signaturePanel,
}: {
  documentType: DocumentType;
  title: string;
  content: string;
  signature?: { name?: string | null; signedAt?: string | null } | null;
  signaturePanel?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    node.appendChild(style);
    return () => style.remove();
  }, []);

  const html = useMemo(
    () =>
      renderLauremDocumentBody({
        documentType,
        title,
        content,
        assetBaseUrl: '',
        signature,
      }),
    [content, documentType, signature, title],
  );

  function printDocument() {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=900');
    if (!printWindow) return;
    printWindow.document.write(
      renderLauremPrintableHtml({
        documentType,
        title,
        content,
        assetBaseUrl: window.location.origin,
        signature,
      }),
    );
    printWindow.document.close();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  }

  return (
    <div className="laurem-document-view" ref={containerRef}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {signaturePanel ? <div className="laurem-document-signing">{signaturePanel}</div> : null}
      <div className="laurem-document-actions">
        <button type="button" className="laurem-doc-print" onClick={printDocument}>
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
