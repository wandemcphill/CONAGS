-- Mega-Build 19: release readiness operational contract.
-- Verify the database functions required for critical recruitment/workforce flows.
create or replace function public.laurem_verify_release_readiness()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_functions text[] := array[
    'laurem_verify_release_schema',
    'laurem_evaluate_staff_lifecycle',
    'laurem_transition_application_status',
    'laurem_prepare_staff_onboarding_atomic',
    'laurem_activate_staff_account_with_session',
    'laurem_issue_recruitment_contract_with_token',
    'laurem_create_second_interview_invitation',
    'laurem_issue_staff_employment_document_package',
    'laurem_record_audit_event'
  ];
  missing_functions text[];
  schema_contract jsonb;
begin
  select coalesce(array_agg(e.function_name order by e.function_name), array[]::text[])
    into missing_functions
  from unnest(required_functions) e(function_name)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = e.function_name
  );

  schema_contract := public.laurem_verify_release_schema();

  return jsonb_build_object(
    'ok', coalesce(schema_contract->>'ok','false') = 'true' and cardinality(missing_functions) = 0,
    'schema', schema_contract,
    'required_function_count', cardinality(required_functions),
    'missing_functions', missing_functions,
    'checked_at', clock_timestamp()
  );
end;
$$;

revoke all on function public.laurem_verify_release_readiness() from public, anon, authenticated;
grant execute on function public.laurem_verify_release_readiness() to service_role;
