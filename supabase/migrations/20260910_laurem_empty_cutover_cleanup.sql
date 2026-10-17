-- CONAGS is a brand-new recruitment portal.
-- Existing recruitment_* records belong to the legacy/BIMED portal and are
-- deliberately NOT part of CONAGS. This corrective migration removes only
-- rows previously copied into the CONAGS-prefixed namespace.
-- The shared/source tables are never modified.

begin;

delete from public.laurem_workforce_audit_events;
delete from public.laurem_payroll_entries;
delete from public.laurem_staff_timesheets;
delete from public.laurem_staff_assignments;
delete from public.laurem_staff_availability;
delete from public.laurem_staff_onboarding_tasks;
delete from public.laurem_staff_onboarding_packages;
delete from public.laurem_staff_messages;
delete from public.laurem_staff_message_participants;
delete from public.laurem_staff_message_conversations;
delete from public.laurem_staff_security_events;
delete from public.laurem_staff_portal_sessions;
delete from public.laurem_staff_portal_auth_limits;
delete from public.laurem_staff_internal_mailboxes;
delete from public.laurem_recruitment_evidence_audit;
delete from public.laurem_recruitment_evidence_reviews;
delete from public.laurem_recruitment_admin_actions;
delete from public.laurem_recruitment_onboarding_checklist;
delete from public.laurem_recruitment_nurse_interview_responses;
delete from public.laurem_recruitment_contract_tokens;
delete from public.laurem_recruitment_documents;
delete from public.laurem_recruitment_document_requests;
delete from public.laurem_recruitment_contracts;
delete from public.laurem_recruitment_status_history;
delete from public.laurem_recruitment_second_interviews;
delete from public.laurem_recruitment_interviews;
delete from public.laurem_staff_profiles;
delete from public.laurem_recruitment_applications;
delete from public.laurem_recruitment_invites;
delete from public.laurem_legacy_contract_signatures;
delete from public.laurem_notification_deliveries;
delete from public.laurem_payroll_periods;

commit;
