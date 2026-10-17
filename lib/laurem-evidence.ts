import type { SupabaseClient } from '@supabase/supabase-js';

export const EVIDENCE_STATUS_VALUES = ['pending', 'approved', 'rejected', 'waived', 'expired', 'superseded'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS_VALUES)[number];

const READINESS_ALIASES: Record<string, string> = {
  identity: 'identity_verified', identity_document: 'identity_verified', passport: 'identity_verified', proof_of_identity: 'identity_verified',
  qualification: 'qualification_evidence_verified', qualification_evidence: 'qualification_evidence_verified', training: 'qualification_evidence_verified', certificate: 'qualification_evidence_verified',
  reference: 'references_verified', references: 'references_verified', reference_letter: 'references_verified',
  right_to_work: 'right_to_work_verified', right_to_work_document: 'right_to_work_verified',
  work_permission: 'international_work_permission_verified', international_work_permission: 'international_work_permission_verified', visa: 'international_work_permission_verified',
  nmc_registration: 'professional_registration_verified', professional_registration: 'professional_registration_verified', nmc: 'professional_registration_verified',
};

export function normalizeEvidenceType(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
export function readinessKeyForEvidenceType(value: string) { return READINESS_ALIASES[normalizeEvidenceType(value)] || null; }
export function evidenceStatusToChecklistStatus(status: EvidenceStatus) { if (status === 'approved') return 'completed' as const; if (status === 'waived') return 'waived' as const; return 'pending' as const; }

export async function getCurrentEvidenceReviews(client: SupabaseClient, applicationId: string) {
  const { data, error } = await client.from('recruitment_evidence_reviews')
    .select('id,application_id,evidence_type,document_id,status,reviewed_by,reviewed_at,review_note,metadata,created_at,updated_at')
    .eq('application_id', applicationId).in('status', ['pending', 'approved', 'waived']).order('created_at', { ascending: false });
  if (error) throw error;

  const current = new Map<string, (typeof data)[number]>();
  for (const row of data || []) {
    const key = readinessKeyForEvidenceType(row.evidence_type);
    if (!current.has(row.evidence_type)) current.set(row.evidence_type, row);
    if (key && !current.has(key)) current.set(key, row);
  }
  return [...current.values()];
}
