-- Complete the CONAGS release index contract and isolate interview-recording storage.
-- Index definitions are copied from LAUREM metadata only; no data rows are copied or changed.
DO $conags_release_indexes$
DECLARE
  expected_index text;
  source_definition text;
  source_index text;
BEGIN
  FOREACH expected_index IN ARRAY ARRAY[
    'conags_audit_events_application_time_idx',
    'conags_audit_events_area_time_idx',
    'conags_audit_events_entity_time_idx',
    'conags_audit_events_staff_time_idx',
    'conags_audit_events_time_idx',
    'conags_data_events_finding_idx',
    'conags_data_findings_application_idx',
    'conags_data_findings_staff_idx',
    'conags_data_findings_status_severity_idx',
    'conags_data_findings_subject_idx',
    'conags_data_requests_status_idx',
    'conags_data_requests_subject_idx',
    'conags_payroll_entries_staff_period_idx',
    'conags_recruitment_admin_actions_application_idx',
    'conags_recruitment_applications_invite_idx',
    'conags_recruitment_contract_tokens_contract_idx',
    'conags_recruitment_documents_application_idx',
    'conags_recruitment_documents_request_idx',
    'conags_recruitment_documents_superseded_idx',
    'conags_recruitment_evidence_audit_application_idx',
    'conags_recruitment_evidence_audit_review_idx',
    'conags_recruitment_evidence_reviews_application_idx',
    'conags_recruitment_evidence_reviews_document_idx',
    'conags_recruitment_interviews_application_idx',
    'conags_recruitment_nurse_interview_responses_application_idx',
    'conags_recruitment_second_interviews_application_idx',
    'conags_recruitment_status_history_application_idx',
    'conags_staff_availability_staff_effective_idx',
    'conags_staff_document_events_document_idx',
    'conags_staff_document_events_staff_idx',
    'conags_staff_documents_signature_idx',
    'conags_staff_documents_source_idx',
    'conags_staff_documents_staff_idx',
    'conags_staff_documents_superseded_idx',
    'conags_staff_leave_requests_staff_start_idx',
    'conags_staff_message_conversations_created_by_staff_idx',
    'conags_staff_message_participants_staff_conversation_idx',
    'conags_staff_messages_conversation_created_idx',
    'conags_staff_messages_sender_created_idx',
    'conags_staff_notifications_staff_created_idx',
    'conags_staff_notifications_unread_idx',
    'conags_staff_portal_sessions_staff_expiry_idx',
    'conags_staff_profiles_contract_idx',
    'conags_staff_security_events_staff_idx',
    'conags_staff_timesheets_assignment_work_date_idx',
    'conags_staff_visa_case_events_staff_idx',
    'conags_staff_visa_cases_application_idx',
    'conags_staff_visa_cases_open_staff_idx',
    'conags_staff_visa_cases_staff_idx',
    'conags_staff_visa_invoices_staff_idx'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class i
      JOIN pg_namespace n ON n.oid=i.relnamespace
      WHERE n.nspname='public' AND i.relkind='i' AND i.relname=expected_index
    ) THEN
      source_index := replace(expected_index, 'conags_', 'laurem_');
      SELECT p.indexdef INTO source_definition
      FROM pg_indexes p
      WHERE p.schemaname='public' AND p.indexname=source_index;

      IF source_definition IS NULL THEN
        RAISE EXCEPTION 'Cannot create CONAGS release index %: source definition % is missing.', expected_index, source_index;
      END IF;

      source_definition := replace(source_definition, 'laurem_', 'conags_');
      EXECUTE source_definition;
    END IF;
  END LOOP;
END
$conags_release_indexes$;

-- Give CONAGS an independent private interview-recordings bucket.
-- No objects or recordings are copied from the existing shared bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'conags-interview-recordings',
       'conags-interview-recordings',
       false,
       file_size_limit,
       allowed_mime_types
FROM storage.buckets
WHERE id='interview-recordings'
ON CONFLICT (id) DO NOTHING;

DO $conags_bucket_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id='conags-interview-recordings'
      AND name='conags-interview-recordings'
      AND public=false
  ) THEN
    RAISE EXCEPTION 'The private CONAGS interview-recordings bucket was not created.';
  END IF;
END
$conags_bucket_guard$;
