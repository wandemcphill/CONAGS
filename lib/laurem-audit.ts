import { db } from '@/lib/db';

type AuditMetadata = Record<string, unknown> | null | undefined;

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'private_key',
  'signed_url',
  'document_contents',
  'raw_file',
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    out[key] = sanitize(nested);
  }
  return out;
}

export function sanitizeAuditMetadata(metadata: AuditMetadata) {
  return sanitize(metadata || {}) as Record<string, unknown>;
}

export async function recordLauremAuditEvent(input: {
  lifecycleArea: string;
  entityType?: string | null;
  entityId?: string | null;
  applicationId?: string | null;
  staffId?: string | null;
  actorType?: string;
  actor: string;
  action: string;
  previousState?: string | null;
  newState?: string | null;
  reason?: string | null;
  sourceTable?: string | null;
  sourceEventId?: string | null;
  metadata?: AuditMetadata;
}) {
  const { data, error } = await db().rpc('laurem_record_audit_event', {
    p_lifecycle_area: input.lifecycleArea,
    p_entity_type: input.entityType || null,
    p_entity_id: input.entityId || null,
    p_application_id: input.applicationId || null,
    p_staff_id: input.staffId || null,
    p_actor_type: input.actorType || 'admin',
    p_actor: input.actor,
    p_action: input.action,
    p_previous_state: input.previousState || null,
    p_new_state: input.newState || null,
    p_reason: input.reason || null,
    p_source_table: input.sourceTable || null,
    p_source_event_id: input.sourceEventId || null,
    p_metadata: sanitizeAuditMetadata(input.metadata),
  });

  if (error) {
    throw new Error(error.message || 'Unable to record audit event.');
  }

  return data as string;
}
