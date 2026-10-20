-- Keep advisory locks in the CONAGS namespace independent of LAUREM.
-- This updates only CONAGS-owned functions and changes no table rows.
DO $conags_lock_names$
DECLARE
  r record;
  v_definition text;
  v_signature text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.proargtypes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND left(p.proname, 7) = 'conags_'
      AND (
        pg_get_functiondef(p.oid) LIKE '%laurem-workforce:%'
        OR pg_get_functiondef(p.oid) LIKE '%laurem-payroll:%'
      )
    ORDER BY p.proname
  LOOP
    v_definition := pg_get_functiondef(r.oid);
    v_definition := replace(v_definition, 'laurem-workforce:', 'conags-workforce:');
    v_definition := replace(v_definition, 'laurem-payroll:', 'conags-payroll:');
    EXECUTE v_definition;

    v_signature := format('public.%I(%s)', r.proname, oidvectortypes(r.proargtypes));
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END
$conags_lock_names$;
