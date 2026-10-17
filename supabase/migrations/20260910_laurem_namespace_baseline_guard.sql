-- CONAGS is a brand-new portal. The initial production namespace must be empty.
--
-- This guard intentionally runs after the empty-cutover cleanup migration. It
-- makes the empty baseline an executable invariant for fresh/rebuilt databases
-- and prevents a future migration sequence from being considered successful
-- while legacy recruitment records remain in CONAGS-owned tables.
--
-- BIMED/shared recruitment tables are read-only from this migration.

do $$
declare
  laurem_count bigint;
begin
  select
    (select count(*) from public.laurem_recruitment_invites) +
    (select count(*) from public.laurem_recruitment_applications) +
    (select count(*) from public.laurem_recruitment_interviews) +
    (select count(*) from public.laurem_recruitment_second_interviews) +
    (select count(*) from public.laurem_recruitment_nurse_interview_responses) +
    (select count(*) from public.laurem_recruitment_status_history) +
    (select count(*) from public.laurem_recruitment_document_requests) +
    (select count(*) from public.laurem_recruitment_documents) +
    (select count(*) from public.laurem_recruitment_contracts) +
    (select count(*) from public.laurem_recruitment_contract_tokens) +
    (select count(*) from public.laurem_recruitment_onboarding_checklist) +
    (select count(*) from public.laurem_recruitment_evidence_reviews) +
    (select count(*) from public.laurem_recruitment_evidence_audit) +
    (select count(*) from public.laurem_recruitment_admin_actions) +
    (select count(*) from public.laurem_staff_profiles) +
    (select count(*) from public.laurem_staff_availability) +
    (select count(*) from public.laurem_staff_assignments) +
    (select count(*) from public.laurem_staff_timesheets) +
    (select count(*) from public.laurem_staff_onboarding_packages) +
    (select count(*) from public.laurem_staff_onboarding_tasks) +
    (select count(*) from public.laurem_staff_portal_sessions) +
    (select count(*) from public.laurem_staff_portal_auth_limits) +
    (select count(*) from public.laurem_staff_security_events) +
    (select count(*) from public.laurem_staff_internal_mailboxes) +
    (select count(*) from public.laurem_staff_message_conversations) +
    (select count(*) from public.laurem_staff_message_participants) +
    (select count(*) from public.laurem_staff_messages) +
    (select count(*) from public.laurem_staff_leave_requests) +
    (select count(*) from public.laurem_payroll_periods) +
    (select count(*) from public.laurem_payroll_entries) +
    (select count(*) from public.laurem_notification_deliveries) +
    (select count(*) from public.laurem_workforce_audit_events) +
    (select count(*) from public.laurem_legacy_contract_signatures)
  into laurem_count;

  if laurem_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LAUREM_EMPTY_BASELINE_VIOLATION',
      detail = format('Expected zero CONAGS-owned rows at first launch, found %s.', laurem_count);
  end if;
end;
$$;
