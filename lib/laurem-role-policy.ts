export const LAUREM_DEFAULT_START_DATE = '2027-01-11';
export const LAUREM_MINIMUM_CONTRACT_START_DATE = '2026-11-23';
export const LAUREM_DEFAULT_PROBATION = '3 months';
export const LAUREM_DEFAULT_PAY_FREQUENCY = 'monthly';

export const LAUREM_CANONICAL_ROLES = [
  'Healthcare Assistant',
  'Support Worker',
  'Senior Support Worker',
  'Registered Nurse',
  'Physiotherapist',
] as const;

export type LauremCanonicalRole = (typeof LAUREM_CANONICAL_ROLES)[number];
export type LauremRoleSlug =
  | 'healthcare-assistant'
  | 'support-worker'
  | 'senior-support-worker'
  | 'registered-nurse'
  | 'physiotherapist';

const ROLE_ALIASES: Record<string, LauremCanonicalRole> = {
  'healthcare worker': 'Healthcare Assistant',
  'healthcare assistant - international': 'Healthcare Assistant',
  'registered nurse - international recruitment': 'Registered Nurse',
  'international registered nurse': 'Registered Nurse',
};

const ROLE_SLUGS: Record<LauremCanonicalRole, LauremRoleSlug> = {
  'Healthcare Assistant': 'healthcare-assistant',
  'Support Worker': 'support-worker',
  'Senior Support Worker': 'senior-support-worker',
  'Registered Nurse': 'registered-nurse',
  'Physiotherapist': 'physiotherapist',
};

export function normalizeLauremRole(value: string | null | undefined): LauremCanonicalRole | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  const direct = LAUREM_CANONICAL_ROLES.find((role) => role.toLowerCase() === normalized);
  return direct ?? ROLE_ALIASES[normalized] ?? null;
}

export function lauremRoleSlug(value: string | null | undefined): LauremRoleSlug | null {
  const role = normalizeLauremRole(value);
  return role ? ROLE_SLUGS[role] : null;
}
