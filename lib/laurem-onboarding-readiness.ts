import type { SupabaseClient } from '@supabase/supabase-js';
import { lauremRoleSlug } from './laurem-role-policy';
import { readinessKeyForEvidenceType } from './laurem-evidence';

export type LauremChecklistStatus = 'pending' | 'completed' | 'waived';

type ApplicationForReadiness = {
  id: string;
  role_applied?: string | null;
  living_in_uk?: string | null;
};

type ChecklistSeed = {
  item_key: string;
  title: string;
  description: string;
  required: boolean;
};

export const LAUREM_STAFF_LIFECYCLE_READINESS_KEYS = new Set([
  'identity_verified',
  'qualification_evidence_verified',
  'references_verified',
  'right_to_work_verified',
  'international_work_permission_verified',
  'professional_registration_verified',
]);

const BASE_ITEMS: ChecklistSeed[] = [
  { item_key: 'identity_verified', title: 'Identity verified', description: 'Identity evidence has been reviewed and verified.', required: true },
  { item_key: 'qualification_evidence_verified', title: 'Qualification evidence verified', description: 'Required qualification and training evidence has been reviewed for the applied role.', required: true },
  { item_key: 'references_verified', title: 'References verified', description: 'Required professional or employment references have been checked and accepted.', required: true },
  { item_key: 'right_to_work_verified', title: 'Right to work verified', description: 'The candidate has been cleared to work in the UK under the applicable pathway.', required: true },
];

function isInternational(application: ApplicationForReadiness) {
  return application.living_in_uk === 'No';
}

export function lauremOnboardingChecklistForApplication(application: ApplicationForReadiness): ChecklistSeed[] {
  const items = [...BASE_ITEMS];
  if (isInternational(application)) {
    items.push({ item_key: 'international_work_permission_verified', title: 'International work permission verified', description: 'Required visa, sponsorship or work-permission evidence has been reviewed and accepted for this overseas candidate.', required: true });
  }
  if (lauremRoleSlug(application.role_applied) === 'registered-nurse') {
    items.push({ item_key: 'professional_registration_verified', title: 'Professional registration verified', description: 'NMC registration status or the approved registration pathway has been reviewed and recorded for the registered nurse role.', required: true });
  }
  return items;
}

export async function ensureLauremOnboardingReadiness(client: SupabaseClient, application: ApplicationForReadiness) {
  const rows = lauremOnboardingChecklistForApplication(application).map((item) => ({ application_id: application.id, ...item }));
  const { error } = await client
    .from('recruitment_onboarding_checklist')
    .upsert(rows, { onConflict: 'application_id,item_key', ignoreDuplicates: true });
  if (error) throw error;
}

export async function getLauremOnboardingReadiness(client: SupabaseClient, application: ApplicationForReadiness) {
  await ensureLauremOnboardingReadiness(client, application);
  const [{ data: checklist, error: checklistError }, { data: reviews, error: reviewError }] = await Promise.all([
    client
      .from('recruitment_onboarding_checklist')
      .select('id,application_id,item_key,title,description,required,status,completed_at,completed_by,notes,created_at,updated_at')
      .eq('application_id', application.id)
      .order('created_at', { ascending: true }),
    client
      .from('recruitment_evidence_reviews')
      .select('id,evidence_type,status,document_id,reviewed_by,reviewed_at,review_note,metadata,created_at,updated_at')
      .eq('application_id', application.id)
      .in('status', ['pending', 'approved', 'waived'])
      .order('created_at', { ascending: false }),
  ]);
  if (checklistError) throw checklistError;
  if (reviewError) throw reviewError;

  const authoritative = new Map<string, { status: LauremChecklistStatus; source: string; reviewId: string }>();
  for (const review of reviews || []) {
    const key = readinessKeyForEvidenceType(review.evidence_type);
    if (!key || authoritative.has(key)) continue;
    authoritative.set(key, {
      status: review.status === 'approved' ? 'completed' : review.status === 'waived' ? 'waived' : 'pending',
      source: 'evidence',
      reviewId: review.id,
    });
  }

  const items = (checklist || []).map((item) => {
    const override = authoritative.get(item.item_key);
    if (!override) return item;
    return {
      ...item,
      status: override.status,
      completed_at: override.status === 'completed' || override.status === 'waived' ? item.completed_at : null,
      completed_by: override.status === 'completed' || override.status === 'waived' ? item.completed_by : null,
      notes: `${item.notes || ''}${item.notes ? ' ' : ''}Evidence review ${override.reviewId} is authoritative for this readiness item.`.trim(),
    };
  });

  const lifecycleItems = items.map((item) => {
    if (!LAUREM_STAFF_LIFECYCLE_READINESS_KEYS.has(item.item_key)) {
      return {
        ...item,
        required: false,
        notes: `${item.notes || ''}${item.notes ? ' ' : ''}This checklist item is informational and does not block the staff lifecycle.`.trim(),
      };
    }
    return item;
  });
  const required = lifecycleItems.filter((item) => item.required);
  const incomplete = required.filter((item) => item.status !== 'completed' && item.status !== 'waived');
  return {
    ready: incomplete.length === 0,
    items: lifecycleItems,
    missing: incomplete.map((item) => ({ item_key: item.item_key, title: item.title })),
  };
}
