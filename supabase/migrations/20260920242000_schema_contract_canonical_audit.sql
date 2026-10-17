create or replace function public.laurem_verify_release_schema()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_tables text[] := array[
    'laurem_recruitment_invites','laurem_recruitment_applications','laurem_recruitment_interviews','laurem_recruitment_second_interviews','laurem_recruitment_nurse_interview_responses','laurem_recruitment_status_history','laurem_recruitment_document_requests','laurem_recruitment_documents','laurem_recruitment_contracts','laurem_recruitment_contract_tokens','laurem_recruitment_onboarding_checklist','laurem_recruitment_evidence_reviews','laurem_recruitment_evidence_audit','laurem_recruitment_admin_actions','laurem_legacy_contract_signatures',
    'laurem_staff_profiles','laurem_staff_onboarding_packages','laurem_staff_onboarding_tasks','laurem_staff_portal_sessions','laurem_staff_portal_auth_limits','laurem_staff_security_events','laurem_staff_internal_mailboxes','laurem_staff_message_conversations','laurem_staff_message_participants','laurem_staff_messages','laurem_staff_availability','laurem_staff_assignments','laurem_staff_timesheets','laurem_staff_leave_requests','laurem_payroll_periods','laurem_payroll_entries','laurem_notification_deliveries','laurem_workforce_audit_events','laurem_staff_documents','laurem_staff_document_events','laurem_staff_visa_cases','laurem_staff_visa_invoices','laurem_staff_visa_case_events',
    'laurem_operational_exceptions','laurem_operational_exception_events','laurem_audit_events'
  ];
  expected_columns jsonb := '[
    ["laurem_staff_profiles","id"],["laurem_staff_profiles","application_id"],["laurem_staff_profiles","contract_id"],["laurem_staff_profiles","employment_status"],["laurem_staff_profiles","full_name"],
    ["laurem_staff_documents","id"],["laurem_staff_documents","staff_id"],["laurem_staff_documents","category"],["laurem_staff_documents","status"],["laurem_staff_documents","storage_path"],["laurem_staff_documents","document_sha256"],
    ["laurem_staff_document_events","id"],["laurem_staff_document_events","document_id"],["laurem_staff_document_events","staff_id"],["laurem_staff_document_events","event_type"],["laurem_staff_document_events","actor_type"],["laurem_staff_document_events","actor"],
    ["laurem_staff_visa_cases","id"],["laurem_staff_visa_cases","staff_id"],["laurem_staff_visa_cases","application_id"],["laurem_staff_visa_cases","pathway"],["laurem_staff_visa_cases","status"],["laurem_staff_visa_cases","case_snapshot"],
    ["laurem_staff_visa_invoices","id"],["laurem_staff_visa_invoices","visa_case_id"],["laurem_staff_visa_invoices","staff_id"],["laurem_staff_visa_invoices","invoice_number"],["laurem_staff_visa_invoices","status"],["laurem_staff_visa_invoices","currency"],["laurem_staff_visa_invoices","amount_pence"],
    ["laurem_staff_visa_case_events","id"],["laurem_staff_visa_case_events","visa_case_id"],["laurem_staff_visa_case_events","staff_id"],["laurem_staff_visa_case_events","event_type"],["laurem_staff_visa_case_events","actor_type"],["laurem_staff_visa_case_events","actor"],
    ["laurem_audit_events","id"],["laurem_audit_events","lifecycle_area"],["laurem_audit_events","actor"],["laurem_audit_events","action"],["laurem_audit_events","occurred_at"]
  ]'::jsonb;
  expected_indexes text[] := array[
    'laurem_staff_availability_staff_effective_idx','laurem_payroll_entries_staff_period_idx','laurem_staff_leave_requests_staff_start_idx','laurem_staff_timesheets_assignment_work_date_idx','laurem_staff_message_participants_staff_conversation_idx','laurem_staff_messages_conversation_created_idx','laurem_staff_messages_sender_created_idx','laurem_staff_portal_sessions_staff_expiry_idx',
    'laurem_recruitment_admin_actions_application_idx','laurem_recruitment_applications_invite_idx','laurem_recruitment_contract_tokens_contract_idx','laurem_recruitment_documents_application_idx','laurem_recruitment_documents_request_idx','laurem_recruitment_documents_superseded_idx','laurem_recruitment_evidence_audit_application_idx','laurem_recruitment_evidence_audit_review_idx','laurem_recruitment_evidence_reviews_application_idx','laurem_recruitment_evidence_reviews_document_idx','laurem_recruitment_interviews_application_idx','laurem_recruitment_nurse_interview_responses_application_idx','laurem_recruitment_second_interviews_application_idx','laurem_recruitment_status_history_application_idx','laurem_staff_documents_superseded_idx','laurem_staff_message_conversations_created_by_staff_idx','laurem_staff_profiles_contract_idx','laurem_staff_security_events_staff_idx','laurem_staff_visa_case_events_staff_idx',
    'laurem_staff_documents_staff_idx','laurem_staff_documents_signature_idx','laurem_staff_documents_source_idx','laurem_staff_document_events_document_idx','laurem_staff_document_events_staff_idx','laurem_staff_visa_cases_staff_idx','laurem_staff_visa_cases_application_idx','laurem_staff_visa_cases_open_staff_idx','laurem_staff_visa_invoices_staff_idx','laurem_staff_notifications_staff_created_idx','laurem_staff_notifications_unread_idx',
    'laurem_audit_events_application_time_idx','laurem_audit_events_staff_time_idx','laurem_audit_events_area_time_idx','laurem_audit_events_entity_time_idx','laurem_audit_events_time_idx'
  ];
  missing_tables text[];
  rls_disabled_tables text[];
  missing_columns jsonb;
  missing_indexes text[];
  baseline_migration_present boolean;
  latest_migration jsonb;
begin
  select coalesce(array_agg(e.table_name order by e.table_name), array[]::text[])
  into missing_tables
  from unnest(expected_tables) e(table_name)
  where not exists (
    select 1 from information_schema.tables t
    where t.table_schema='public' and t.table_name=e.table_name and t.table_type='BASE TABLE'
  );

  select coalesce(array_agg(e.table_name order by e.table_name), array[]::text[])
  into rls_disabled_tables
  from unnest(expected_tables) e(table_name)
  join pg_class c on c.relname=e.table_name
  join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where coalesce(c.relrowsecurity,false)=false;

  select coalesce(jsonb_agg(jsonb_build_object('table',x.value->>0,'column',x.value->>1) order by x.value->>0,x.value->>1), '[]'::jsonb)
  into missing_columns
  from jsonb_array_elements(expected_columns) x
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=x.value->>0 and c.column_name=x.value->>1
  );

  select coalesce(array_agg(e.index_name order by e.index_name), array[]::text[])
  into missing_indexes
  from unnest(expected_indexes) e(index_name)
  where not exists (
    select 1 from pg_indexes p where p.schemaname='public' and p.indexname=e.index_name
  );

  select exists(select 1 from supabase_migrations.schema_migrations m where m.version='20260920184540')
  into baseline_migration_present;

  select jsonb_build_object('version',m.version,'name',m.name)
  into latest_migration
  from supabase_migrations.schema_migrations m
  order by m.version desc limit 1;

  return jsonb_build_object(
    'ok',
    cardinality(missing_tables)=0
    and cardinality(rls_disabled_tables)=0
    and jsonb_array_length(missing_columns)=0
    and cardinality(missing_indexes)=0
    and baseline_migration_present,
    'contract_version',2,
    'expected_table_count',cardinality(expected_tables),
    'missing_tables',missing_tables,
    'rls_disabled_tables',rls_disabled_tables,
    'missing_columns',missing_columns,
    'missing_indexes',missing_indexes,
    'baseline_migration_present',baseline_migration_present,
    'latest_migration',latest_migration,
    'checked_at',clock_timestamp()
  );
end;
$$;

revoke all on function public.laurem_verify_release_schema() from public, anon, authenticated;
grant execute on function public.laurem_verify_release_schema() to service_role;