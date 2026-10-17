import type { SupabaseClient } from '@supabase/supabase-js';

export const REQUIRED_ENVIRONMENT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_SESSION_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
] as const;

export const EXPECTED_PORTAL_TABLES = [
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
  'recruitment_onboarding_checklist',
  'recruitment_evidence_reviews',
  'recruitment_evidence_audit',
  'recruitment_admin_actions',
  'legacy_contract_signatures',
  'staff_profiles',
  'staff_onboarding_packages',
  'staff_onboarding_tasks',
  'staff_portal_sessions',
  'staff_portal_auth_limits',
  'staff_security_events',
  'staff_internal_mailboxes',
  'staff_message_conversations',
  'staff_message_participants',
  'staff_messages',
  'staff_availability',
  'staff_assignments',
  'staff_timesheets',
  'staff_leave_requests',
  'payroll_periods',
  'payroll_entries',
  'notification_deliveries',
  'workforce_audit_events',
  'staff_documents',
  'staff_document_events',
  'staff_visa_cases',
  'staff_visa_invoices',
  'staff_visa_case_events',
] as const;

export const REQUIRED_PRIVATE_BUCKET = 'laurem-private-documents';
export const REQUIRED_PRIVATE_BUCKETS = [REQUIRED_PRIVATE_BUCKET, 'laurem-staff-photos', 'interview-recordings'] as const;

export type ReleaseHealth = {
  ok: boolean;
  timestamp: string;
  release: { commit: string | null; environment: string };
  dependencies: {
    environment: { ok: boolean; missing: string[] };
    database: { ok: boolean; latencyMs: number; error: string | null };
    schema: {
      ok: boolean;
      missing: string[];
      contract: {
        ok: boolean;
        contractVersion: number | null;
        expectedTableCount: number | null;
        missingTables: string[];
        rlsDisabledTables: string[];
        missingColumns: Array<{ table: string; column: string }>;
        missingIndexes: string[];
        baselineMigrationPresent: boolean;
        latestMigration: { version: string; name: string } | null;
        error: string | null;
      };
    };
    storage: { ok: boolean; bucketsPresent: string[]; missingBuckets: string[]; error: string | null };
    readiness: { ok: boolean; requiredFunctionCount: number; missingFunctions: string[]; error: string | null };
  };
};

function releaseCommit() {
  return process.env.RENDER_GIT_COMMIT
    || process.env.RENDER_GIT_COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GIT_COMMIT_SHA
    || null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown dependency error.';
}

export async function checkReleaseHealth(client: SupabaseClient): Promise<ReleaseHealth> {
  const timestamp = new Date().toISOString();
  const missingEnvironment = REQUIRED_ENVIRONMENT.filter((key) => !process.env[key]?.trim());
  const started = Date.now();
  const { error: databaseError } = await client.from('recruitment_applications').select('id', { head: true, count: 'exact' });
  const latencyMs = Date.now() - started;

  const { data: schemaContract, error: schemaContractError } = await client.rpc('laurem_verify_release_schema');
  const contract = schemaContract && typeof schemaContract === 'object'
    ? schemaContract as Record<string, unknown>
    : {};
  const missingTables = Array.isArray(contract.missing_tables)
    ? contract.missing_tables.filter((value): value is string => typeof value === 'string')
    : [];
  const rlsDisabledTables = Array.isArray(contract.rls_disabled_tables)
    ? contract.rls_disabled_tables.filter((value): value is string => typeof value === 'string')
    : [];
  const missingIndexes = Array.isArray(contract.missing_indexes)
    ? contract.missing_indexes.filter((value): value is string => typeof value === 'string')
    : [];
  const missingColumns = Array.isArray(contract.missing_columns)
    ? contract.missing_columns
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
        .map((value) => ({ table: typeof value.table === 'string' ? value.table : 'unknown', column: typeof value.column === 'string' ? value.column : 'unknown' }))
    : [];
  const latestMigration = contract.latest_migration && typeof contract.latest_migration === 'object'
    ? contract.latest_migration as Record<string, unknown>
    : null;
  const schemaContractOk = schemaContractError
    ? false
    : contract.ok === true;

  const { data: buckets, error: bucketError } = await client.storage.listBuckets();
  const presentBucketNames = Array.isArray(buckets) ? buckets.map((bucket) => bucket.name) : [];
  const bucketsPresent = REQUIRED_PRIVATE_BUCKETS.filter((bucket) => presentBucketNames.includes(bucket));
  const missingBuckets = REQUIRED_PRIVATE_BUCKETS.filter((bucket) => !presentBucketNames.includes(bucket));

  const { data: readinessContract, error: readinessError } = await client.rpc('laurem_verify_release_readiness');
  const readiness = readinessContract && typeof readinessContract === 'object'
    ? readinessContract as Record<string, unknown>
    : {};
  const missingFunctions = Array.isArray(readiness.missing_functions)
    ? readiness.missing_functions.filter((value): value is string => typeof value === 'string')
    : [];
  const requiredFunctionCount = typeof readiness.required_function_count === 'number' ? readiness.required_function_count : 0;
  const readinessOk = !readinessError && readiness.ok === true;

  const databaseOk = !databaseError;
  const schemaOk = schemaContractOk && missingTables.length === 0 && rlsDisabledTables.length === 0 && missingColumns.length === 0 && missingIndexes.length === 0;
  const storageOk = !bucketError && missingBuckets.length === 0;
  const environmentOk = missingEnvironment.length === 0;

  return {
    ok: environmentOk && databaseOk && schemaOk && storageOk && readinessOk,
    timestamp,
    release: { commit: releaseCommit(), environment: process.env.NODE_ENV || 'unknown' },
    dependencies: {
      environment: { ok: environmentOk, missing: missingEnvironment },
      database: { ok: databaseOk, latencyMs, error: databaseError ? errorMessage(databaseError) : null },
      schema: {
        ok: schemaOk,
        missing: missingTables,
        contract: {
          ok: schemaContractOk,
          contractVersion: typeof contract.contract_version === 'number' ? contract.contract_version : null,
          expectedTableCount: typeof contract.expected_table_count === 'number' ? contract.expected_table_count : null,
          missingTables,
          rlsDisabledTables,
          missingColumns,
          missingIndexes,
          baselineMigrationPresent: contract.baseline_migration_present === true,
          latestMigration: latestMigration && typeof latestMigration.version === 'string' && typeof latestMigration.name === 'string'
            ? { version: latestMigration.version, name: latestMigration.name }
            : null,
          error: schemaContractError ? errorMessage(schemaContractError) : null,
        },
      },
      storage: { ok: storageOk, bucketsPresent, missingBuckets, error: bucketError ? errorMessage(bucketError) : null },
      readiness: { ok: readinessOk, requiredFunctionCount, missingFunctions, error: readinessError ? errorMessage(readinessError) : null },
    },
  };
}
