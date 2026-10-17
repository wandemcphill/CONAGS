-- Harden CONAGS security-definer functions exposed through the public API schema.
-- All application code calls these functions from server-side service-role clients.
-- No BIMED/shared recruitment data is modified.

revoke execute on function public.laurem_activate_staff_account(text, text, text, inet, text) from anon, authenticated;
revoke execute on function public.laurem_consume_recruitment_contract_token(text, text, text, text, text, text) from anon, authenticated;
revoke execute on function public.laurem_consume_staff_auth_attempt(text, integer, integer, integer) from anon, authenticated;
revoke execute on function public.laurem_record_evidence_review(uuid, text, uuid, text, text, text, jsonb) from anon, authenticated;
revoke execute on function public.laurem_transition_application_status(uuid, text, text, text, boolean, text) from anon, authenticated;

grant execute on function public.laurem_activate_staff_account(text, text, text, inet, text) to service_role;
grant execute on function public.laurem_consume_recruitment_contract_token(text, text, text, text, text, text) to service_role;
grant execute on function public.laurem_consume_staff_auth_attempt(text, integer, integer, integer) to service_role;
grant execute on function public.laurem_record_evidence_review(uuid, text, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.laurem_transition_application_status(uuid, text, text, text, boolean, text) to service_role;

do $$
declare
  fn record;
  identity_args text;
begin
  for fn in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'set_recruitment_onboarding_checklist_updated_at',
         'laurem_safe_jsonb',
         'laurem_assign_staff_identity',
         'laurem_create_international_nurse_contract_template_meta',
         'laurem_consume_admin_auth_attempt'
       )
  loop
    select pg_get_function_identity_arguments(fn.oid) into identity_args;
    execute format('alter function public.%I(%s) set search_path = public', fn.proname, identity_args);
  end loop;
end;
$$;
