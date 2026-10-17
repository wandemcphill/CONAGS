import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLauremJob } from '@/lib/laurem-jobs';

const jobs = readFileSync(resolve(process.cwd(), 'lib/laurem-jobs.ts'), 'utf8');
const jobPage = readFileSync(resolve(process.cwd(), 'app/jobs/[id]/page.tsx'), 'utf8');
const jobsPage = readFileSync(resolve(process.cwd(), 'app/jobs/page.tsx'), 'utf8');
const applicationRoute = readFileSync(resolve(process.cwd(), 'app/api/applications/route.ts'), 'utf8');
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910_care_roles_in_country_sponsorship.sql'),
  'utf8',
);

describe('recruitment visa sponsorship policy', () => {
  it('marks Senior Support Worker and Care Worker as in-country switch only', () => {
    expect(jobs).toContain("id: 'senior-support-worker'");
    expect(jobs).toContain("visaSponsorship: 'in-country-switch-only'");
    expect(getLauremJob('care-worker')?.visaSponsorship).toBe('in-country-switch-only');
    expect(getLauremJob('care-worker')?.id).toBe('healthcare-assistant');
  });

  it('keeps overseas sponsorship available only for the international nurse vacancy', () => {
    expect(getLauremJob('registered-nurse-international')?.visaSponsorship).toBe('overseas-and-in-country');
    expect(getLauremJob('registered-nurse-international')?.id).toBe('registered-nurse');
  });

  it('shows the in-country switch restriction on public vacancy pages', () => {
    expect(jobsPage).toContain('UK VISA SWITCH ONLY');
    expect(jobsPage).toContain('Care Worker / Healthcare Assistant');
    expect(jobPage).toContain('Applicants must already be in the UK');
    expect(jobPage).toContain('does not offer overseas entry-clearance sponsorship for this care role');
  });

  it('enforces the in-country rule at application persistence level', () => {
    expect(applicationRoute).toContain('CARE_ROLE_IN_COUNTRY_ONLY');
    expect(migration).toContain("lower(payload_role) in ('senior support worker', 'care worker', 'healthcare assistant')");
    expect(migration).toContain("payload_living_in_uk <> 'yes'");
  });

  it('keeps recruitment invite-only on the careers pages', () => {
    expect(jobsPage).toContain('Applications are by recruitment invitation only');
    expect(jobPage).toContain('Applications are by invitation only');
    expect(jobPage).not.toContain('/admin?inviteRole=');
  });
});
