import { lauremCompany } from '@/lib/laurem-company-config';

export const LAUREM_LETTERHEAD = {
  legalName: lauremCompany.legalName.toUpperCase(),
  tradingName: lauremCompany.tradingName.toUpperCase(),
  strapline: 'Care & Support Services',
  companyNumber: lauremCompany.companyNumber,
  registration: lauremCompany.registration,
  registeredOffice: lauremCompany.registeredOffice,
  email: lauremCompany.publicEmails.recruitment,
  website: lauremCompany.website.replace('https://', '').replace('http://', ''),
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderLauremLetterhead(input?: {
  documentLabel?: string;
  title?: string;
  status?: string;
}): string {
  const label = input?.documentLabel || 'OFFICIAL DOCUMENT';
  const title = input?.title || '';
  const status = input?.status || '';

  return (
    '<header class="laurem-letterhead">' +
      '<div class="laurem-letterhead-top">' +
        '<div class="laurem-letterhead-brand">' +
          '<span class="laurem-letterhead-mark" aria-hidden="true">CC</span>' +
          '<div>' +
            '<div class="laurem-letterhead-wordmark">CONAGS CARE</div>' +
            '<div class="laurem-letterhead-strapline">' + escapeHtml(LAUREM_LETTERHEAD.strapline) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="laurem-letterhead-contact">' +
          '<strong>' + escapeHtml(LAUREM_LETTERHEAD.legalName) + '</strong>' +
          '<span>' + escapeHtml(LAUREM_LETTERHEAD.registeredOffice) + '</span>' +
          '<span>' + escapeHtml(LAUREM_LETTERHEAD.registration) + '&nbsp;·&nbsp;Company No. ' + escapeHtml(LAUREM_LETTERHEAD.companyNumber) + '</span>' +
          '<span>' + escapeHtml(LAUREM_LETTERHEAD.email) + '</span><span>&nbsp;·&nbsp;</span><span>' + escapeHtml(LAUREM_LETTERHEAD.website) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="laurem-letterhead-rule"></div>' +
      (title
        ? '<div class="laurem-letterhead-document-heading">' +
            '<div><span>' + escapeHtml(label) + '</span><h1>' + escapeHtml(title) + '</h1></div>' +
            (status ? '<strong class="laurem-letterhead-status">' + escapeHtml(status) + '</strong>' : '') +
          '</div>'
        : '') +
    '</header>'
  );
}

export function renderLauremLetterheadFooter(): string {
  return (
    '<footer class="laurem-letterhead-footer">' +
      '<div><strong>' + escapeHtml(LAUREM_LETTERHEAD.legalName) + '</strong><span>' +
      escapeHtml(LAUREM_LETTERHEAD.registration) + '&nbsp;·&nbsp;Company No. ' + escapeHtml(LAUREM_LETTERHEAD.companyNumber) + '</span></div>' +
      '<div><span>Registered Office</span><span>' + escapeHtml(LAUREM_LETTERHEAD.registeredOffice) + '</span></div>' +
      '<div><span>' + escapeHtml(LAUREM_LETTERHEAD.email) + '</span><span>&nbsp;·&nbsp;</span><span>' + escapeHtml(LAUREM_LETTERHEAD.website) + '</span></div>' +
    '</footer>'
  );
}

export const LAUREM_LETTERHEAD_CSS = [
  ':root{--lh-navy:#183b36;--lh-green:#2f7765;--lh-mint:#91cdbd;--lh-ink:#233a35;--lh-muted:#64766f;--lh-line:#d7e4df;--lh-soft:#f3f8f6;--lh-font:Arial,Helvetica,sans-serif}',
  '.laurem-letterhead{background:#fff;color:var(--lh-ink);font-family:var(--lh-font)}',
  '.laurem-letterhead-top{display:flex;justify-content:space-between;gap:12mm;align-items:center;padding:8mm 12mm 7mm}',
  '.laurem-letterhead-brand{display:flex;align-items:center;gap:4mm;min-width:70mm}',
  '.laurem-letterhead-mark{width:13mm;height:13mm;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--lh-navy);color:#fff;font-size:7.5pt;font-weight:900;letter-spacing:.04em}',
  '.laurem-letterhead-wordmark{font-size:17pt;font-weight:900;letter-spacing:.10em;color:var(--lh-navy)}',
  '.laurem-letterhead-wordmark span{font-weight:600}',
  '.laurem-letterhead-strapline{margin-top:1mm;color:var(--lh-green);font-size:7.5pt;font-weight:800;letter-spacing:.11em;text-transform:uppercase}',
  '.laurem-letterhead-contact{display:flex;flex-direction:column;align-items:flex-end;gap:1mm;max-width:110mm;color:var(--lh-muted);font-size:7pt;line-height:1.35;text-align:right}',
  '.laurem-letterhead-contact strong{color:var(--lh-navy);font-size:7.8pt}',
  '.laurem-letterhead-rule{height:2.1mm;background:linear-gradient(90deg,var(--lh-navy),var(--lh-green) 60%,var(--lh-mint))}',
  '.laurem-letterhead-document-heading{display:flex;justify-content:space-between;gap:8mm;align-items:flex-end;padding:7mm 12mm 6mm;border-bottom:1px solid var(--lh-line)}',
  '.laurem-letterhead-document-heading span{display:block;color:var(--lh-green);font-size:6.8pt;font-weight:900;letter-spacing:.15em}',
  '.laurem-letterhead-document-heading h1{margin:1.5mm 0 0;color:var(--lh-navy);font-size:18.5pt;line-height:1.16;font-weight:800}',
  '.laurem-letterhead-status{padding:2mm 3mm;border:1px solid #b9d8ce;border-radius:999px;color:var(--lh-green);font-size:6.8pt;letter-spacing:.10em;white-space:nowrap}',
  '.laurem-letterhead-footer{display:grid;grid-template-columns:1.2fr 1.5fr .9fr;gap:8mm;padding:4mm 12mm;color:var(--lh-muted);font-size:6.4pt;line-height:1.4;border-top:1px solid var(--lh-line);background:#fbfcfc}',
  '.laurem-letterhead-footer div{display:flex;flex-direction:column;gap:1mm}',
  '.laurem-letterhead-footer strong{color:var(--lh-navy);font-size:6.8pt}',
  '.laurem-letterhead-footer span:first-child{font-weight:700}',
  '@media screen and (max-width:760px){.laurem-letterhead-top{display:block;padding:7mm}.laurem-letterhead-brand{min-width:0}.laurem-letterhead-contact{align-items:flex-start;text-align:left;margin-top:5mm;max-width:none}.laurem-letterhead-document-heading{display:block;padding:6mm 7mm}.laurem-letterhead-status{display:inline-block;margin-top:4mm}.laurem-letterhead-footer{grid-template-columns:1fr;padding:4mm 7mm}}',
].join('');

export const LAUREM_LETTERHEAD_PRINT_CSS = [
  LAUREM_LETTERHEAD_CSS,
  '@page{size:A4;margin:15mm 14mm 17mm}',
  '@media print{body{background:#fff}.laurem-letterhead{position:fixed;left:0;right:0;top:0;background:#fff}.laurem-letterhead-footer{position:fixed;left:0;right:0;bottom:0;background:#fff}.laurem-document,.laurem-contract-document{padding-top:43mm;padding-bottom:18mm}}',
].join('');
