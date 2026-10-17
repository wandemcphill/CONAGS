import { describe, expect, it } from 'vitest';
import { renderLauremContractDocument, renderLauremPrintableContractHtml } from '@/lib/laurem-contract-document-renderer';

const standard = `CONTRACT OF EMPLOYMENT (GUARANTEED MINIMUM HOURS)

Employer: Conags Care Ltd
Employee: Alul Dominic
Job title: Healthcare Assistant

1. COMMENCEMENT OF EMPLOYMENT
Employment begins on 1 January 2027.

2. JOB TITLE AND DESCRIPTION OF WORK
Your job title is Healthcare Assistant.

EMPLOYER AUTHORITY
For and on behalf of Conags Care Ltd
Name: Dezou Maurice
Title: Manager

EMPLOYEE ACCEPTANCE
Employee name: Alul Dominic
Employee acceptance: To be completed electronically
`;

describe('CONAGS employment contract letterhead', () => {
  it('renders a formal UK company letterhead and preserves contract clauses', () => {
    const html = renderLauremContractDocument({
      content: standard,
      employeeName: 'Alul Dominic',
      jobTitle: 'Healthcare Assistant',
      status: 'issued',
      version: 1,
    });

    expect(html).toContain('CONAGS CARE');
    expect(html).toContain('CONAGS CARE GROUP LIMITED');
    expect(html).toContain('Company No. SC490520');
    expect(html).toContain('557 Parkhouse Road, Barrhead, Glasgow, Scotland, G78 1TE');
    expect(html).toContain('<span class="laurem-contract-number">1</span>'); 
    expect(html).toContain('COMMENCEMENT OF EMPLOYMENT');
    expect(html).not.toContain('<pre>');
    expect(html).toContain('</div></section>');
  });


  it('re-renders legacy issued contracts through the current permanent letterhead', () => {
    const legacy = `CONAGS CARE GROUP LIMITED

CONTRACT OF EMPLOYMENT (GUARANTEED MINIMUM HOURS)

Employer: Conags Care Ltd
Employee: Alul Dominic
Job title: Healthcare Assistant

1. COMMENCEMENT OF EMPLOYMENT
Employment begins on 1 January 2027.
`;

    const html = renderLauremContractDocument({
      content: legacy,
      employeeName: 'Alul Dominic',
      jobTitle: 'Healthcare Assistant',
      status: 'accepted',
      version: 1,
      acceptedByName: 'Alul Dominic',
      acceptedAt: '2026-09-23T21:00:00.000Z',
    });

    expect(html).toContain('CONAGS CARE');
    expect(html).toContain('CONAGS CARE GROUP LIMITED');
    expect(html).toContain('Company No. SC490520');
    expect(html).not.toContain('<div class="legacy-letterhead">');
    expect(html.match(/CONAGS CARE GROUP LIMITED/g)?.length).toBe(2);
    expect(html).toContain('CONTRACT OF EMPLOYMENT (GUARANTEED MINIMUM HOURS)');
    expect(html).toContain('SIGNED ELECTRONICALLY');
  });

  it('renders an electronic signature record for an accepted contract', () => {
    const html = renderLauremContractDocument({
      content: standard,
      employeeName: 'Alul Dominic',
      jobTitle: 'Healthcare Assistant',
      status: 'accepted',
      acceptedByName: 'Alul Dominic',
      acceptedAt: '2026-09-23T21:00:00.000Z',
    });

    expect(html).toContain('ELECTRONIC SIGNATURE RECORD');
    expect(html).toContain('Contract accepted electronically');
    expect(html).toContain('Alul Dominic');
  });

  it('provides print-ready HTML', () => {
    const html = renderLauremPrintableContractHtml({
      content: standard,
      employeeName: 'Alul Dominic',
      jobTitle: 'Healthcare Assistant',
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('@page{size:A4');
  });
});
