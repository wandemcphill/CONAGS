-- Add the staff-authored visa information audit event to the UK sponsorship case event contract.
alter table public.laurem_staff_visa_case_events
  drop constraint if exists laurem_staff_visa_case_events_event_type_check;

alter table public.laurem_staff_visa_case_events
  add constraint laurem_staff_visa_case_events_event_type_check
  check (event_type in (
    'requested',
    'admin_reviewed',
    'pathway_changed',
    'invoice_issued',
    'payment_recorded',
    'sms_prepared',
    'submitted_to_sms',
    'cos_assigned',
    'document_uploaded',
    'candidate_information_updated',
    'completed',
    'declined',
    'withdrawn'
  ));
