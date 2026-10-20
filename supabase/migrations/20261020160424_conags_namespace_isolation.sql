-- Establish a separate, empty CONAGS namespace in the shared LAUREM/BIMED Supabase project.
-- IMPORTANT: structure-only clone. This migration intentionally never copies table rows or storage objects.

DO $conags_isolation$
DECLARE
  r record;
  q record;
  v_source_table_count integer;
  v_target_table_count integer;
  v_bucket_count integer;
  v_new_table text;
  v_new_constraint text;
  v_definition text;
  v_signature text;
  v_row_count bigint;
  v_policy_sql text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND left(c.relname, 7) = 'conags_'
      AND c.relkind IN ('r', 'p', 'v', 'm')
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND left(p.proname, 7) = 'conags_'
  ) THEN
    RAISE EXCEPTION 'CONAGS namespace objects already exist; refusing to overwrite or merge namespaces.';
  END IF;

  SELECT count(*) INTO v_source_table_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND left(c.relname, 7) = 'laurem_';

  IF v_source_table_count < 50 THEN
    RAISE EXCEPTION 'Expected the existing LAUREM schema before cloning CONAGS; found only % source tables.', v_source_table_count;
  END IF;

  SELECT count(*) INTO v_bucket_count
  FROM storage.buckets
  WHERE id IN ('laurem-private-documents', 'laurem-staff-photos');

  IF v_bucket_count <> 2 THEN
    RAISE EXCEPTION 'Expected both existing private LAUREM buckets before creating independent CONAGS buckets.';
  END IF;

  -- Clone table structure only; LIKE does not copy the source rows.
  FOR r IN
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND left(c.relname, 7) = 'laurem_'
    ORDER BY c.relname
  LOOP
    v_new_table := replace(r.relname, 'laurem_', 'conags_');
    EXECUTE format(
      'CREATE TABLE public.%I (LIKE public.%I INCLUDING ALL)',
      v_new_table,
      r.relname
    );

    IF r.relrowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_new_table);
    END IF;
    IF r.relforcerowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_new_table);
    END IF;

    -- These server-only tables must not become readable through the public Data API.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_new_table);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', v_new_table);

    IF obj_description(r.oid, 'pg_class') IS NOT NULL THEN
      EXECUTE format(
        'COMMENT ON TABLE public.%I IS %L',
        v_new_table,
        replace(replace(obj_description(r.oid, 'pg_class'), 'LAUREM', 'CONAGS'), 'laurem_', 'conags_')
      );
    END IF;
  END LOOP;

  -- LIKE copies CHECK constraints verbatim. Rebuild them so helper-function references
  -- and any internal table/function names point to CONAGS rather than LAUREM.
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND left(c.relname, 7) = 'laurem_'
    ORDER BY c.relname
  LOOP
    v_new_table := replace(r.relname, 'laurem_', 'conags_');
    FOR q IN
      SELECT con.conname
      FROM pg_constraint con
      WHERE con.conrelid = to_regclass(format('public.%I', v_new_table))
        AND con.contype = 'c'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_new_table, q.conname);
    END LOOP;
  END LOOP;

  -- Recreate foreign keys only between LAUREM-owned tables, pointed at the new CONAGS tables.
  FOR r IN
    SELECT source.relname AS source_table,
           con.conname AS constraint_name,
           pg_get_constraintdef(con.oid) AS constraint_definition
    FROM pg_constraint con
    JOIN pg_class source ON source.oid = con.conrelid
    JOIN pg_namespace sn ON sn.oid = source.relnamespace
    JOIN pg_class target ON target.oid = con.confrelid
    JOIN pg_namespace tn ON tn.oid = target.relnamespace
    WHERE sn.nspname = 'public'
      AND tn.nspname = 'public'
      AND con.contype = 'f'
      AND left(source.relname, 7) = 'laurem_'
      AND left(target.relname, 7) = 'laurem_'
    ORDER BY source.relname, con.conname
  LOOP
    v_new_table := replace(r.source_table, 'laurem_', 'conags_');
    v_new_constraint := left(replace(r.constraint_name, 'laurem_', 'conags_'), 63);
    v_definition := replace(r.constraint_definition, 'laurem_', 'conags_');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I %s',
      v_new_table,
      v_new_constraint,
      v_definition
    );
  END LOOP;

  -- Clone each database function under a new name and rewrite internal LAUREM references.
  -- SQL-language helpers run last; PL/pgSQL routine bodies resolve their calls when executed.
  FOR r IN
    SELECT p.oid, p.proname, p.proargtypes, l.lanname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND left(p.proname, 7) = 'laurem_'
    ORDER BY CASE WHEN l.lanname = 'sql' THEN 1 ELSE 0 END, p.proname, p.oid
  LOOP
    v_definition := replace(pg_get_functiondef(r.oid), 'laurem_', 'conags_');
    EXECUTE v_definition;

    v_signature := format(
      'public.%I(%s)',
      replace(r.proname, 'laurem_', 'conags_'),
      oidvectortypes(r.proargtypes)
    );
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;

  -- Recreate CHECK constraints after CONAGS helper functions have been created.
  -- This avoids checks in the new tables calling LAUREM-owned helpers.
FOR r IN
    SELECT source.relname AS source_table,
           con.conname AS constraint_name,
           pg_get_constraintdef(con.oid) AS constraint_definition
    FROM pg_constraint con
    JOIN pg_class source ON source.oid = con.conrelid
    JOIN pg_namespace sn ON sn.oid = source.relnamespace
    WHERE sn.nspname = 'public'
      AND con.contype = 'c'
      AND left(source.relname, 7) = 'laurem_'
    ORDER BY source.relname, con.conname
  LOOP
    v_new_table := replace(r.source_table, 'laurem_', 'conags_');
    v_new_constraint := left(replace(r.constraint_name, 'laurem_', 'conags_'), 63);
    v_definition := replace(r.constraint_definition, 'laurem_', 'conags_');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I %s',
      v_new_table,
      v_new_constraint,
      v_definition
    );
  END LOOP;


  -- Copy any existing table policies with their table/function references rewritten.
  FOR r IN
    SELECT * FROM pg_policies
    WHERE schemaname = 'public'
      AND left(tablename, 7) = 'laurem_'
    ORDER BY tablename, policyname
  LOOP
    v_policy_sql := format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
      replace(r.policyname, 'laurem_', 'conags_'),
      replace(r.tablename, 'laurem_', 'conags_'),
      r.permissive,
      r.cmd,
      array_to_string(r.roles, ', ')
    );
    IF r.qual IS NOT NULL THEN
      v_policy_sql := v_policy_sql || ' USING (' || replace(r.qual, 'laurem_', 'conags_') || ')';
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_policy_sql := v_policy_sql || ' WITH CHECK (' || replace(r.with_check, 'laurem_', 'conags_') || ')';
    END IF;
    EXECUTE v_policy_sql;
  END LOOP;

  -- Clone table triggers after the corresponding CONAGS functions exist.
  FOR r IN
    SELECT source.relname AS source_table,
           tg.tgname AS trigger_name,
           pg_get_triggerdef(tg.oid) AS trigger_definition
    FROM pg_trigger tg
    JOIN pg_class source ON source.oid = tg.tgrelid
    JOIN pg_namespace sn ON sn.oid = source.relnamespace
    WHERE sn.nspname = 'public'
      AND left(source.relname, 7) = 'laurem_'
      AND NOT tg.tgisinternal
    ORDER BY source.relname, tg.tgname
  LOOP
    v_definition := replace(r.trigger_definition, 'laurem_', 'conags_');
    EXECUTE v_definition;
  END LOOP;

  -- Create new private buckets only; existing stored documents and photos stay in LAUREM.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  SELECT replace(id, 'laurem-', 'conags-'),
         replace(name, 'laurem-', 'conags-'),
         public,
         file_size_limit,
         allowed_mime_types
  FROM storage.buckets
  WHERE id IN ('laurem-private-documents', 'laurem-staff-photos')
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_target_table_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND left(c.relname, 7) = 'conags_';

  IF v_target_table_count <> v_source_table_count THEN
    RAISE EXCEPTION 'CONAGS schema verification failed: expected % tables, found %.', v_source_table_count, v_target_table_count;
  END IF;

  -- Guard that no rows have been inserted into the new CONAGS tables during this cutover.
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND left(c.relname, 7) = 'conags_'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.relname) INTO v_row_count;
    IF v_row_count <> 0 THEN
      RAISE EXCEPTION 'CONAGS table % was not empty at namespace creation.', r.relname;
    END IF;
  END LOOP;

  RAISE NOTICE 'Created % empty CONAGS tables with isolated functions/triggers and private storage buckets.', v_target_table_count;
END
$conags_isolation$;
