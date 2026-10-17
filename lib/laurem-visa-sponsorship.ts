export const LAUREM_VISA_SUPPORT_FEE_GBP_PENCE = 200000;

export type LauremVisaPathway = 'visa_switch' | 'international_sponsorship';

export function normaliseCountry(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export function determineLauremVisaPathway(input: {
  livingInUk?: string | null;
  currentCountry?: string | null;
}): { pathway: LauremVisaPathway; basis: string } {
  const livingInUk = normaliseCountry(input.livingInUk);
  const currentCountry = normaliseCountry(input.currentCountry);
  const inUk = ['yes', 'true', 'currently in the uk'].includes(livingInUk)
    || /(united kingdom|^uk$|england|scotland|wales|northern ireland)/.test(currentCountry);

  return inUk
    ? { pathway: 'visa_switch', basis: 'Existing recruitment records indicate the candidate is in the UK.' }
    : { pathway: 'international_sponsorship', basis: 'Existing recruitment records indicate the candidate is outside the UK.' };
}

export function visaPathwayLabel(pathway: LauremVisaPathway) {
  return pathway === 'visa_switch' ? 'UK visa switch support' : 'International visa sponsorship support';
}

export function moneyGbp(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}
