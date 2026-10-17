-- CONAGS application code calls these SECURITY DEFINER functions server-side.
-- Do not expose them through the anonymous/authenticated PostgREST roles.
-- No BIMED/shared recruitment data is modified.

revoke execute on function public.laurem_activate_staff_account(text, text, text, inet, text) from public, anon, authenticated;
revoke execute on function public.laurem_consume_recruitment_contract_token(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.laurem_consume_staff_auth_attempt(text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.laurem_record_evidence_review(uuid, text, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.laurem_transition_application_status(uuid, text, text, text, boolean, text) from public, anon, authenticated;
