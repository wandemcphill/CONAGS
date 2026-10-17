import fs from 'node:fs';
import path from 'node:path';
import { lauremCompany } from '@/lib/laurem-company-config';

function readTemplate(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function renderTemplate(relativePath: string, role: string, staffName: string) {
  return readTemplate(relativePath)
    .replace(/\{\{JOB_TITLE\}\}/g, role.trim())
    .replace(/\{\{EMPLOYEE_NAME\}\}/g, staffName.trim())
    .replace(/\{\{ISSUER_NAME\}\}/g, lauremCompany.documentIssuer.name)
    .replace(/\{\{ISSUER_TITLE\}\}/g, lauremCompany.documentIssuer.title);
}

export function renderLauremJobDescription(role: string, staffName: string) {
  const normal = role.trim().toLowerCase();

  if (normal.includes('registered nurse')) {
    return renderTemplate(
      'docs/job-descriptions/laurem-registered-nurse.md',
      role,
      staffName,
    );
  }

  if (normal.includes('healthcare assistant')) {
    return renderTemplate(
      'docs/job-descriptions/laurem-healthcare-assistant.md',
      role,
      staffName,
    );
  }

  if (normal.includes('support worker')) {
    return renderTemplate(
      'docs/job-descriptions/laurem-support-worker.md',
      role,
      staffName,
    );
  }

  return renderTemplate(
    'docs/job-descriptions/laurem-standard.md',
    role,
    staffName,
  );
}

export const LAUREM_DOCUMENT_SIGNATURE_ATTESTATION =
  'I confirm that I have read this document, understand it, and agree to sign it electronically.';
