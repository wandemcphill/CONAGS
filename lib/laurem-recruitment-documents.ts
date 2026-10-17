import fs from 'node:fs';
import path from 'node:path';
import { renderLauremJobDescription } from '@/lib/laurem-job-description';
import { lauremRoleSlug } from '@/lib/laurem-role-policy';

function readHandbook(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

export function getLauremRecruitmentDocumentPack(input: {
  role: string;
  staffName: string;
  livingInUk?: string | null;
}) {
  const roleSlug = lauremRoleSlug(input.role);
  const jobDescription = renderLauremJobDescription(input.role, input.staffName);

  let handbookTitle = 'Conags Staff Handbook';
  let handbookContent = readHandbook('docs/handbooks/laurem-staff-handbook.md');

  if (roleSlug === 'healthcare-assistant' && input.livingInUk === 'No') {
    handbookTitle = 'Conags Sponsored Healthcare Assistant Handbook';
    handbookContent = readHandbook('docs/handbooks/laurem-sponsored-hca-handbook.md');
  } else if (roleSlug === 'registered-nurse' && input.livingInUk === 'No') {
    handbookTitle = 'Conags Overseas Registered Nurse Handbook';
    handbookContent = readHandbook('docs/handbooks/laurem-overseas-nurse-handbook.md');
  }

  return {
    jobDescriptionTitle: input.role.trim() + ' Job Description',
    jobDescription,
    handbookTitle,
    handbookContent,
  };
}

export const LAUREM_RECRUITMENT_DOCUMENT_ATTESTATION =
  'I confirm that I have read this document, understand it, and agree to sign it electronically.';
