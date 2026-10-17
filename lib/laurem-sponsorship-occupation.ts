import { normalizeLauremRole, type LauremCanonicalRole } from '@/lib/laurem-role-policy';

export type LauremSponsorshipOccupation = {
  role: LauremCanonicalRole;
  code: string;
  title: string;
  sourceUrl: string;
};

/**
 * Current role-to-SOC mapping used by CONAGS's sponsorship and contract workflows.
 * The code must reflect the actual sponsored duties and work environment.
 *
 * Source: GOV.UK Immigration Rules, Appendix Skilled Occupations:
 * https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations
 */
const LAUREM_SPONSORSHIP_OCCUPATIONS: Record<LauremCanonicalRole, LauremSponsorshipOccupation> = {
  'Healthcare Assistant': {
    role: 'Healthcare Assistant',
    code: '6131',
    title: 'Nursing auxiliaries and assistants',
    sourceUrl: 'https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations',
  },
  'Support Worker': {
    role: 'Support Worker',
    code: '6135',
    title: 'Care workers and home carers',
    sourceUrl: 'https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations',
  },
  'Senior Support Worker': {
    role: 'Senior Support Worker',
    code: '6136',
    title: 'Senior care workers',
    sourceUrl: 'https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations',
  },
  'Registered Nurse': {
    role: 'Registered Nurse',
    code: '2237',
    title: 'Other registered nursing professionals',
    sourceUrl: 'https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations',
  },
  'Physiotherapist': {
    role: 'Physiotherapist',
    code: '2221',
    title: 'Physiotherapists',
    sourceUrl: 'https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations',
  },
};

export function getLauremSponsorshipOccupation(
  role: string | null | undefined,
): LauremSponsorshipOccupation | null {
  const canonicalRole = normalizeLauremRole(role);
  return canonicalRole ? LAUREM_SPONSORSHIP_OCCUPATIONS[canonicalRole] : null;
}

export function getLauremSponsorshipOccupationCode(role: string | null | undefined): string | null {
  return getLauremSponsorshipOccupation(role)?.code ?? null;
}
