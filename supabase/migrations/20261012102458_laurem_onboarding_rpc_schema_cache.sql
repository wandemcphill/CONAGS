-- Restore the CONAGS onboarding acknowledgement RPC exposure and refresh PostgREST.
-- This migration was applied to the linked Supabase project; keep the checked-in
-- version aligned with its recorded migration version.
-- Idempotent: does not modify staff or onboarding task records.
do $$
declare
  fn_oid oid;
begin
  select p.oid
    into fn_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'laurem_acknowledge_staff_onboarding_task'
    and pg_get_function_identity_arguments(p.oid) = 'p_staff_id uuid, p_task_id uuid';

  if fn_oid is null then
    raise exception 'Expected function public.laurem_acknowledge_staff_onboarding_task(uuid, uuid) is missing';
  end if;

  -- The application calls this function with its server-side service role.
  execute 'revoke all on function public.laurem_acknowledge_staff_onboarding_task(uuid, uuid) from public, anon, authenticated';
  execute 'grant execute on function public.laurem_acknowledge_staff_onboarding_task(uuid, uuid) to service_role';
end
$$;

-- Ensure PostgREST re-reads the function signature and grants.
notify pgrst, 'reload schema';
