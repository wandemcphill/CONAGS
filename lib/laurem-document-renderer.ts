import { renderLauremLetterhead, renderLauremLetterheadFooter, LAUREM_LETTERHEAD_PRINT_CSS } from '@/lib/laurem-letterhead';

export type LauremDocumentType = 'job_description' | 'handbook';

type MetadataEntry = { label: string; value: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineMarkdown(value: string): string {
  let html = escapeHtml(value);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

function parseMetadata(lines: string[]) {
  const metadata: MetadataEntry[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (line === '---') break;

    const match = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (match) metadata.push({ label: match[1].trim(), value: match[2].trim() });
    index += 1;
  }

  while (index < lines.length && lines[index].trim() !== '---') index += 1;
  while (index < lines.length && lines[index].trim() === '---') index += 1;

  return { metadata, contentStart: index };
}

function documentKindLabel(documentType: LauremDocumentType) {
  return documentType === 'handbook' ? 'EMPLOYEE HANDBOOK' : 'ROLE DOCUMENT';
}

export function renderLauremDocumentBody(input: {
  documentType: LauremDocumentType;
  title: string;
  content: string;
  assetBaseUrl?: string;
  signature?: { name?: string | null; signedAt?: string | null } | null;
}): string {
  const lines = input.content.replace(/\r\n?/g, '\n').split('\n');
  const parsed = parseMetadata(lines);
  const metadata = parsed.metadata;
  const body: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];
  let sectionOpen = false;

  const closeList = () => {
    if (listType) {
      body.push('</' + listType + '>');
      listType = null;
    }
  };

  const closeParagraph = () => {
    if (paragraph.length) {
      body.push('<p>' + inlineMarkdown(paragraph.join(' ')) + '</p>');
      paragraph = [];
    }
  };

  for (let index = parsed.contentStart; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }

    if (line === '---') {
      closeParagraph();
      closeList();
      body.push('<hr />');
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      closeParagraph();
      closeList();
      body.push('<h3>' + inlineMarkdown(h3[1]) + '</h3>');
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      closeParagraph();
      closeList();
      if (sectionOpen) body.push('</section>');

      const heading = h2[1].trim();
      const number = heading.match(/^(\d+\.)/)?.[1] || '';
      const cleanHeading = heading.replace(/^\d+\.\s*/, '');
      body.push(
        '<section class="laurem-doc-section">' +
        '<div class="laurem-doc-section-heading">' +
        '<span class="laurem-doc-section-number">' + escapeHtml(number) + '</span>' +
        '<h2>' + inlineMarkdown(cleanHeading) + '</h2>' +
        '</div>',
      );
      sectionOpen = true;
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      closeParagraph();
      if (listType !== 'ul') {
        closeList();
        body.push('<ul>');
        listType = 'ul';
      }
      body.push('<li>' + inlineMarkdown(unordered[1]) + '</li>');
      continue;
    }

    const ordered = line.match(/^(\d+)\.\s+(.+)$/);
    if (ordered) {
      closeParagraph();
      if (listType !== 'ol') {
        closeList();
        body.push('<ol>');
        listType = 'ol';
      }
      body.push('<li>' + inlineMarkdown(ordered[2]) + '</li>');
      continue;
    }

    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  if (sectionOpen) body.push('</section>');

  const metaHtml = metadata.length
    ? '<div class="laurem-doc-meta-grid">' +
      metadata.map((item) =>
        '<div class="laurem-doc-meta"><span>' +
        inlineMarkdown(item.label) +
        '</span><strong>' +
        inlineMarkdown(item.value) +
        '</strong></div>',
      ).join('') +
      '</div>'
    : '';

  const signatureHtml = input.signature
    ? '<section class="laurem-doc-signature">' +
      '<div><span class="laurem-doc-kicker">SIGNATURE RECORD</span><h2>Electronic signature</h2><p>This copy records the electronic signature attached to the document.</p></div>' +
      '<div class="laurem-doc-signature-grid">' +
      '<div><span>Signed by</span><strong>' + escapeHtml(input.signature.name || 'Not recorded') + '</strong></div>' +
      '<div><span>Signed at</span><strong>' + escapeHtml(input.signature.signedAt || 'Not recorded') + '</strong></div>' +
      '<div><span>Status</span><strong>Signed</strong></div>' +
      '</div></section>'
    : '';

  return (
    '<article class="laurem-document" data-document-type="' + escapeHtml(input.documentType) + '">' +
      renderLauremLetterhead({
        documentLabel: documentKindLabel(input.documentType),
        title: input.title,
        status: input.signature ? 'SIGNED ELECTRONICALLY' : 'ISSUED FOR REVIEW',
      }) +
      metaHtml +
      '<div class="laurem-doc-content">' + body.join('') + '</div>' +
      signatureHtml +
      renderLauremLetterheadFooter() +
    '</article>'
  );
}

export function renderLauremPrintableHtml(input: {
  documentType: LauremDocumentType;
  title: string;
  content: string;
  assetBaseUrl: string;
  signature?: { name?: string | null; signedAt?: string | null } | null;
}): string {
  const body = renderLauremDocumentBody(input);
  return '<!doctype html>' +
    '<html lang="en"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<meta name="description" content="Print-ready signed employment document from CONAGS Care Ltd" />' +
    '<title>' + escapeHtml(input.title) + ' | CONAGS Care</title>' +
    '<style>' + PRINT_CSS + '</style></head><body>' + body + '</body></html>';
}

export const PRINT_CSS = [
  LAUREM_LETTERHEAD_PRINT_CSS,
  '*{box-sizing:border-box}',
  'body{margin:0;background:#eef4f1;color:var(--lh-ink);font-family:var(--lh-font);font-size:10pt;line-height:1.58}',
  '.laurem-document{width:190mm;margin:12mm auto;background:#fff;box-shadow:0 18px 45px rgba(24,55,47,.10);overflow:hidden}',
  '.laurem-doc-kicker{font-family:var(--lh-font);font-size:7pt;font-weight:800;letter-spacing:.15em;color:var(--lh-green)}',
  '.laurem-doc-meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--lh-line);border:1px solid var(--lh-line)}',
  '.laurem-doc-meta{background:#fff;padding:5mm 6mm;min-height:19mm}',
  '.laurem-doc-meta span{display:block;color:var(--lh-muted);font-size:7.5pt;text-transform:uppercase;letter-spacing:.08em;margin-bottom:1.5mm}',
  '.laurem-doc-meta strong{display:block;font-size:9.1pt;color:var(--lh-ink)}',
  '.laurem-doc-content{padding:11mm 13mm 8mm}',
  '.laurem-doc-section{margin:0 0 8mm}',
  '.laurem-doc-section-heading{display:flex;gap:3.5mm;align-items:flex-start;border-bottom:1px solid var(--lh-line);padding-bottom:2.5mm;margin-bottom:4mm}',
  '.laurem-doc-section-number{display:inline-flex;align-items:center;justify-content:center;min-width:9mm;height:9mm;border-radius:999px;background:#e1f2eb;color:var(--lh-green);font-weight:800;font-size:8pt}',
  '.laurem-doc-section h2{margin:0;color:var(--lh-ink);font-size:13.5pt;line-height:1.22;font-weight:800}',
  '.laurem-doc-content h3{margin:5mm 0 2mm;font-size:10.5pt;line-height:1.3;color:var(--lh-green);font-weight:800}',
  '.laurem-doc-content p{margin:0 0 3.2mm;color:#253a34}',
  '.laurem-doc-content ul,.laurem-doc-content ol{margin:1mm 0 4mm 5mm;padding-left:5mm}',
  '.laurem-doc-content li{margin-bottom:1.6mm;padding-left:1mm}',
  '.laurem-doc-content li::marker{color:var(--lh-green);font-weight:700}',
  '.laurem-doc-content strong{color:var(--lh-ink)}',
  '.laurem-doc-content hr{border:0;border-top:1px solid var(--lh-line);margin:7mm 0}',
  '.laurem-doc-signature{margin:7mm 13mm 10mm;padding:6mm;border:1px solid #bfdacf;border-radius:5mm;background:var(--lh-soft);break-inside:avoid}',
  '.laurem-doc-signature h2{margin:1mm 0;font-size:13pt;line-height:1.2;color:var(--lh-ink)}',
  '.laurem-doc-signature p{margin:0;color:var(--lh-muted)}',
  '.laurem-doc-signature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-top:5mm}',
  '.laurem-doc-signature-grid div{background:#fff;border:1px solid var(--lh-line);border-radius:3mm;padding:3mm}',
  '.laurem-doc-signature-grid span{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:.08em;color:var(--lh-muted)}',
  '.laurem-doc-signature-grid strong{display:block;margin-top:1mm;font-size:8.5pt;color:var(--lh-ink)}',
  '@media print{body{background:#fff}.laurem-document{width:100%;margin:0;box-shadow:none}.laurem-doc-content{padding-bottom:5mm}}',
].join('');
