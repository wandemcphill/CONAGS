import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

async function read(relativePath: string) {
  return fs.readFile(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('CONAGS electronic signing across the three employment documents', () => {
  it('uses the shared electronic-signature component for Contract, Job Description and Handbook', async () => {
    const signature = await read('components/LauremElectronicSignature.tsx');
    const contractViewer = await read('components/LauremContractDocument.tsx');
    const letterhead = await read('lib/laurem-letterhead.ts');
    const contractPage = await read('app/contracts/accept/[token]/page.tsx');
    const candidateDocuments = await read('app/candidate-documents/[token]/page.tsx');

    expect(signature).toContain('Sign this document online');
    expect(signature).toContain('Electronic acceptance');
    expect(signature).toContain('I confirm that I have read this document, understand it, and agree to sign it electronically.');
    expect(contractViewer).toContain('signaturePanel');
    expect(contractViewer).toContain("import { LAUREM_LETTERHEAD_CSS } from '@/lib/laurem-letterhead';");
    expect(contractViewer).toContain('LAUREM_LETTERHEAD_CSS,');
    expect(letterhead).toContain('.laurem-letterhead{background:#fff');
    expect(contractPage).toContain('<LauremElectronicSignature');
    expect(contractPage).toContain('Sign contract electronically');
    expect(candidateDocuments).toContain('<LauremElectronicSignature');
    expect(candidateDocuments).toContain('document_type === \'job_description\'');
    expect(candidateDocuments).toContain('document_type === \'handbook\'');
    expect(candidateDocuments).toContain('Sign document electronically');
  });

  it('renders an electronic signature record on signed Job Description and Handbook copies', async () => {
    const renderer = await read('lib/laurem-document-renderer.ts');
    const contractRenderer = await read('lib/laurem-contract-document-renderer.ts');

    expect(renderer).toContain('SIGNATURE RECORD');
    expect(renderer).toContain('SIGNED ELECTRONICALLY');
    expect(renderer).toContain('This copy records the electronic signature attached to the document.');
    expect(contractRenderer).toContain('ELECTRONIC SIGNATURE RECORD');
    expect(contractRenderer).toContain('SIGNED ELECTRONICALLY');
  });

  it('keeps the letterhead contact separators explicit for printed and extracted copies', async () => {
    const letterhead = await read('lib/laurem-letterhead.ts');

    expect(letterhead).toContain('&nbsp;·&nbsp;');
    expect(letterhead).toContain("'<span>' + escapeHtml(LAUREM_LETTERHEAD.email) + '</span><span>&nbsp;·&nbsp;</span><span>'");
    expect(letterhead).not.toContain("LAUREM_LETTERHEAD.email) + ' · ' + escapeHtml(LAUREM_LETTERHEAD.website)");
  });
});
