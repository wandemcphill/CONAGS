-- Forward hardening for Mega-Build 17 role normalizer.
-- Keep the SQL helper on a fixed schema resolution path so the Supabase
-- security advisor does not report a mutable search_path.

alter function public.laurem_normalize_role(text)
  set search_path = public;
