import { describe, expect, it } from 'vitest';
import { renderLauremDocumentBody, renderLauremPrintableHtml } from '@/lib/laurem-document-renderer';

const sample = [
  '# CONAGS CARE LTD',
  '',
  '## Job Description',
  '',
  '**Job title:** Healthcare Assistant',
  '**Employee:** Alul Dominic',
  '**Employer:** Conags Care Ltd',
  '---',
  '',
  '## 1. Job purpose',
  '',
  'The Healthcare Assistant supports service users to live safely, comfortably and with dignity.',
  '',
  '### Person-centred care',
  '',
  '1. Provide respectful support.',
  '2. Promote dignity and privacy.',
  '',
  '## 4. Person specification',
  '',
  '- Reliability and professionalism.',
].join('\n');

describe('CONAGS branded employment documents', () => {
  it('renders controlled Markdown as structured branded HTML rather than raw preformatted text', () => {
    const html = renderLauremDocumentBody({
      documentType: 'job_description',
      title: 'Healthcare Assistant Job Description',
      content: sample,
    });

    expect(html).toContain('class="laurem-letterhead"');
    expect(html).toContain('CONAGS CARE');
    expect(html).toContain('CONAGS CARE GROUP LIMITED');
    expect(html).toContain('Company No. SC490520');
    expect(html).toContain('557 Parkhouse Road, Barrhead, Glasgow, Scotland, G78 1TE');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('images.pexels.com');
    expect(html).not.toContain('laurem-professional-practice.svg');
    expect(html).toContain('<h2>Job purpose</h2>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<span>Job title</span><strong>Healthcare Assistant</strong>');
    expect(html).not.toContain('<pre>');
  });

  it('escapes document content before rendering it into HTML', () => {
    const html = renderLauremDocumentBody({
      documentType: 'handbook',
      title: '<Unsafe>',
      content: '# Title\n\n---\n\nHello <script>alert("x")</script>',
    });

    expect(html).toContain('&lt;Unsafe&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('provides a print-ready signed document with signature record', () => {
    const html = renderLauremPrintableHtml({
      documentType: 'handbook',
      title: 'Conags Staff Handbook',
      content: sample,
      assetBaseUrl: 'https://recruitment.conagscare.com',
      signature: { name: 'Alul Dominic', signedAt: '2026-09-23T21:00:00.000Z' },
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('CONAGS CARE GROUP LIMITED');
    expect(html).toContain('Company No. SC490520');
    expect(html).toContain('<strong>Signed</strong>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('images.pexels.com');
    expect(html).not.toContain('document-media/laurem-');
    expect(html).toContain('@page{size:A4');
  });
});
