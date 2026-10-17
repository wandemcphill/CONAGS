import { LAUREM_LETTERHEAD, renderLauremLetterhead, renderLauremLetterheadFooter, LAUREM_LETTERHEAD_PRINT_CSS } from '@/lib/laurem-letterhead';

export type LauremContractDocumentInput = {
  content: string;
  employeeName?: string | null;
  jobTitle?: string | null;
  status?: string | null;
  version?: number | null;
  acceptedByName?: string | null;
  acceptedAt?: string | null;
};

type MetadataEntry = { label: string; value: string };


function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineText(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>');
}

function isNumberedHeading(line: string): boolean {
  return /^\d+\.\s+\S+/.test(line);
}

function isSpecialHeading(line: string): boolean {
  return (
    line === 'EMPLOYER AUTHORITY' ||
    line === 'EMPLOYEE ACCEPTANCE' ||
    line === 'Employer representative' ||
    line === 'Employee name and acceptance'
  );
}

function extractMetadata(lines: string[]): { titleLines: string[]; metadata: MetadataEntry[]; bodyStart: number } {
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;

  if (index < lines.length && lines[index].trim().toUpperCase().startsWith('CONAGS CARE')) {
    index += 1;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }

  const titleLines: string[] = [];
  while (index < lines.length && lines[index].trim()) {
    const line = lines[index].trim();
    if (line.match(/^Employer:\s*/i)) break;
    titleLines.push(line);
    index += 1;
  }

  const metadata: MetadataEntry[] = [];
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (isNumberedHeading(line)) break;
    const match = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (match) {
      metadata.push({ label: match[1].trim(), value: match[2].trim() });
    }
    index += 1;
  }

  return { titleLines, metadata, bodyStart: index };
}

function renderSections(lines: string[], start: number): string {
  const html: string[] = [];
  let openSection: 'clause' | 'special' | null = null;
  let paragraph: string[] = [];

  const closeParagraph = () => {
    if (!paragraph.length) return;
    html.push('<p>' + inlineText(paragraph.join(' ')) + '</p>');
    paragraph = [];
  };

  const closeSection = () => {
    closeParagraph();
    if (openSection === 'special') {
      html.push('</div></section>');
    } else if (openSection === 'clause') {
      html.push('</section>');
    }
    openSection = null;
  };

  for (let index = start; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();

    if (!line) {
      closeParagraph();
      continue;
    }

    if (isNumberedHeading(line)) {
      closeSection();
      const match = line.match(/^(\d+)\.\s+(.+)$/);
      const number = match?.[1] || '';
      const heading = match?.[2] || line;
      html.push(
        '<section class="laurem-contract-section">' +
        '<div class="laurem-contract-section-heading">' +
        '<span class="laurem-contract-number">' + escapeHtml(number) + '</span>' +
        '<h2>' + inlineText(heading) + '</h2>' +
        '</div>',
      );
      openSection = 'clause';
      continue;
    }

    if (isSpecialHeading(line)) {
      closeSection();
      html.push(
        '<section class="laurem-contract-special">' +
        '<div class="laurem-contract-special-kicker">' + escapeHtml(line.toUpperCase()) + '</div>' +
        '<div class="laurem-contract-special-body">',
      );
      openSection = 'special';
      continue;
    }

    paragraph.push(line);
  }

  closeSection();
  return html.join('');
}

export function renderLauremContractDocument(input: LauremContractDocumentInput): string {
  const lines = input.content.replace(/\r\n?/g, '\n').split('\n');
  const parsed = extractMetadata(lines);
  const primaryTitle = parsed.titleLines.filter(Boolean).join(' ');
  const metadata = parsed.metadata;
  const role = input.jobTitle || metadata.find((item) => item.label.toLowerCase() === 'job title')?.value || 'Employment role';
  const employee = input.employeeName || metadata.find((item) => item.label.toLowerCase() === 'employee')?.value || 'Employee';
  const status = String(input.status || '').toLowerCase();
  const statusLabel = status === 'accepted' || input.acceptedAt ? 'SIGNED ELECTRONICALLY' : status === 'declined' ? 'DECLINED' : 'ISSUED FOR ACCEPTANCE';

  const metaHtml = metadata.length
    ? '<div class="laurem-contract-meta">' +
      metadata.map((item) =>
        '<div class="laurem-contract-meta-item"><span>' +
        escapeHtml(item.label) +
        '</span><strong>' +
        inlineText(item.value) +
        '</strong></div>',
      ).join('') +
      '</div>'
    : '';

  const signatureHtml = input.acceptedAt || input.acceptedByName || status === 'accepted'
    ? '<section class="laurem-contract-signature-record">' +
      '<div class="laurem-contract-signature-kicker">ELECTRONIC SIGNATURE RECORD</div>' +
      '<h2>Contract accepted electronically</h2>' +
      '<div class="laurem-contract-signature-grid">' +
      '<div><span>Signed by</span><strong>' + escapeHtml(input.acceptedByName || employee) + '</strong></div>' +
      '<div><span>Signed at</span><strong>' + escapeHtml(input.acceptedAt || 'Recorded by the CONAGS platform') + '</strong></div>' +
      '<div><span>Contract status</span><strong>Accepted</strong></div>' +
      '</div>' +
      '<p>The electronic acceptance record is retained with the contract and related audit trail.</p>' +
      '</section>'
    : '';

  return (
    '<article class="laurem-contract-document">' +
      renderLauremLetterhead({
        documentLabel: 'EMPLOYMENT CONTRACT',
        title: primaryTitle || 'Contract of Employment',
        status: statusLabel,
      }) +
      metaHtml +
      '<div class="laurem-contract-intro">' +
        '<div><span>Employee</span><strong>' + escapeHtml(employee) + '</strong></div>' +
        '<div><span>Position</span><strong>' + escapeHtml(role) + '</strong></div>' +
        '<div><span>Document version</span><strong>' + escapeHtml(String(input.version ?? 'Current issue')) + '</strong></div>' +
      '</div>' +
      '<div class="laurem-contract-body">' +
        renderSections(lines, parsed.bodyStart) +
      '</div>' +
      signatureHtml +
      renderLauremLetterheadFooter() +
    '</article>'
  );
}

export const LAUREM_CONTRACT_PRINT_CSS = [
  LAUREM_LETTERHEAD_PRINT_CSS,
  ':root{--paper:#fff;--navy:var(--lh-navy);--teal:var(--lh-green);--mint:var(--lh-mint);--ink:var(--lh-ink);--muted:var(--lh-muted);--line:var(--lh-line);--soft:var(--lh-soft)}',
  '*{box-sizing:border-box}',
  'body{margin:0;background:#edf2f4;color:var(--ink);font-family:var(--lh-font);font-size:10pt;line-height:1.58}',
  '.laurem-contract-document{width:190mm;max-width:100%;margin:12mm auto;background:var(--paper);box-shadow:0 12px 38px rgba(22,57,74,.10);overflow:hidden}',

  '.laurem-contract-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0 13mm;border:1px solid var(--line);background:var(--line);gap:1px}',
  '.laurem-contract-meta-item{padding:4mm 4.5mm;background:#fff}',
  '.laurem-contract-meta-item span,.laurem-contract-intro span,.laurem-contract-signature-grid span{display:block;color:var(--muted);font-size:7pt;font-weight:800;text-transform:uppercase;letter-spacing:.08em}',
  '.laurem-contract-meta-item strong{display:block;margin-top:1mm;font-size:8.9pt}',
  '.laurem-contract-intro{display:grid;grid-template-columns:1.2fr 1.2fr .7fr;gap:5mm;margin:7mm 13mm 0;padding:5mm;background:var(--soft);border-left:3px solid var(--teal)}',
  '.laurem-contract-intro strong{display:block;margin-top:1mm;color:var(--navy);font-size:9pt;font-weight:800}',
  '.laurem-contract-body{padding:8mm 13mm 2mm}',
  '.laurem-contract-section{margin:0 0 7mm;break-inside:avoid}',
  '.laurem-contract-section-heading{display:grid;grid-template-columns:9mm 1fr;gap:3.5mm;align-items:start;border-bottom:1px solid var(--line);padding-bottom:2.5mm;margin-bottom:3.5mm}',
  '.laurem-contract-number{display:flex;width:9mm;height:9mm;align-items:center;justify-content:center;border-radius:50%;background:#e4f2ee;color:var(--teal);font-size:8pt;font-weight:900}',
  '.laurem-contract-section h2{margin:0;color:var(--navy);font-size:12.5pt;line-height:1.28;font-weight:800}',
  '.laurem-contract-section p{margin:0 0 3.4mm;color:#2f4249}',
  '.laurem-contract-special{margin:8mm 0;padding:5mm;border:1px solid var(--line);border-radius:3mm;background:#fafcfc;break-inside:avoid}',
  '.laurem-contract-special-kicker{color:var(--teal);font-size:7pt;font-weight:900;letter-spacing:.14em}',
  '.laurem-contract-special-body{margin-top:3mm}',
  '.laurem-contract-special-body p{margin:0 0 2.5mm}',
  '.laurem-contract-signature-record{margin:6mm 13mm 9mm;padding:6mm;border:1px solid #b9d9ce;border-radius:3mm;background:#f3faf7;break-inside:avoid}',
  '.laurem-contract-signature-kicker{color:var(--teal);font-size:7pt;font-weight:900;letter-spacing:.14em}',
  '.laurem-contract-signature-record h2{margin:1.5mm 0 4mm;color:var(--navy);font-size:13.5pt;line-height:1.2}',
  '.laurem-contract-signature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}',
  '.laurem-contract-signature-grid div{padding:3.5mm;background:#fff;border:1px solid var(--line);border-radius:2mm}',
  '.laurem-contract-signature-grid strong{display:block;margin-top:1mm;font-size:8.4pt}',
  '.laurem-contract-signature-record p{margin:4mm 0 0;color:var(--muted);font-size:8pt}',

  '@media screen and (max-width:760px){.laurem-contract-document{width:calc(100vw - 24px);margin:0 auto 24px}.laurem-contract-meta,.laurem-contract-intro{grid-template-columns:1fr}.laurem-contract-meta{margin-left:8mm;margin-right:8mm}.laurem-contract-intro{margin-left:8mm;margin-right:8mm}.laurem-contract-body{padding-left:8mm;padding-right:8mm}.laurem-contract-signature-record{margin-left:8mm;margin-right:8mm}}',
  '@media print{body{background:#fff}.laurem-contract-document{width:100%;margin:0;box-shadow:none}.laurem-letterhead{break-inside:avoid}.laurem-letterhead-footer{break-inside:avoid}}',
].join('');

export function renderLauremPrintableContractHtml(input: LauremContractDocumentInput & { assetBaseUrl?: string }): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<meta name="description" content="CONAGS Care employment contract" />' +
    '<title>' + escapeHtml(input.jobTitle || 'Employment Contract') + ' | ' + LAUREM_LETTERHEAD.tradingName + '</title>' +
    '<style>' + LAUREM_CONTRACT_PRINT_CSS + '</style></head><body>' +
    renderLauremContractDocument(input) +
    '</body></html>';
}
