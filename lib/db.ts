import { createClient } from '@supabase/supabase-js';

const LAUREM_TABLES = new Set([
  'recruitment_invites',
  'recruitment_applications',
  'recruitment_interviews',
  'recruitment_second_interviews',
  'recruitment_nurse_interview_responses',
  'recruitment_status_history',
  'recruitment_document_requests',
  'recruitment_documents',
  'recruitment_contracts',
  'recruitment_contract_tokens',
  'recruitment_evidence_reviews',
  'recruitment_evidence_audit',
  'recruitment_admin_actions',
  'interview_attempts',
  'laurem_interview_attempts',
  'recruitment_onboarding_checklist',
  'legacy_contract_signatures',
  'staff_profiles',
  'staff_availability',
  'staff_assignments',
  'staff_timesheets',
  'staff_onboarding_packages',
  'staff_onboarding_tasks',
  'staff_portal_sessions',
  'staff_portal_auth_limits',
  'staff_security_events',
  'staff_password_reset_tokens',
  'staff_internal_mailboxes',
  'staff_message_conversations',
  'staff_message_participants',
  'staff_messages',
  'staff_leave_requests',
  'payroll_periods',
  'payroll_entries',
  'notification_deliveries',
  'staff_notifications',
  'workforce_audit_events',
  'staff_documents',
  'staff_document_events',
  'staff_visa_cases',
  'staff_visa_invoices',
  'staff_visa_case_events',
]);

const LAUREM_RPC_NAMES = new Set([
  'create_recruitment_application',
  'consume_recruitment_contract_token',
  'laurem_record_evidence_review',
  'laurem_transition_application_status',
  'laurem_consume_staff_auth_attempt',
  'laurem_consume_recruitment_contract_token_v2',
  'laurem_activate_staff_account',
  'create_international_nurse_contract_template_meta',
  'laurem_create_second_interview_invitation',
  'laurem_complete_round1',
  'laurem_complete_round2',
  'laurem_sign_staff_document',
  'laurem_attach_accepted_contract_document',
  'laurem_request_staff_visa_sponsorship',
  'laurem_verify_release_schema',
]);

function mapTableName(name: string) {
  if (name.startsWith('laurem_')) return name;
  if (LAUREM_TABLES.has(name)) return `laurem_${name}`;
  throw new Error(`CONAGS database namespace violation: table "${name}" is outside the CONAGS namespace.`);
}

function mapRpcName(name: string) {
  if (name.startsWith('laurem_')) return name;
  if (LAUREM_RPC_NAMES.has(name)) return `laurem_${name}`;
  throw new Error(`CONAGS database namespace violation: RPC "${name}" is outside the CONAGS namespace.`);
}

let client: ReturnType<typeof createClient<any>> | null = null;

export function db() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment is not configured.');

  const rawClient = createClient<any>(url, key, { auth: { persistSession: false } });
  client = new Proxy(rawClient, {
    get(target, property, receiver) {
      if (property === 'from') return (table: string) => target.from(mapTableName(table));
      if (property === 'rpc') return (fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>) => target.rpc(mapRpcName(fn), args, options);
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return client;
}
