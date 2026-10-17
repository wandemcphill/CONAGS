-- CONAGS: DBS/PVG is a workforce compliance item, not a staff portal lifecycle gate.
-- It may remain outstanding for review, but it must never prevent:
--   * Hired transition
--   * staff portal provisioning
--   * activation-link issuance
--   * staff self-activation
--
-- Canonical lifecycle readiness is deliberately limited to the allowlisted keys
-- enforced by laurem_is_staff_lifecycle_readiness_key().

update public.laurem_recruitment_onboarding_checklist
set required = false,
    updated_at = clock_timestamp()
where required
  and lower(regexp_replace(btrim(coalesce(item_key, '')), '[^a-z0-9]+', '_', 'g'))
      in ('dbs', 'dbs_pvg', 'dbs_pvg_verified', 'dbs_pvg_check', 'dbs_pvg_check_verified');

-- Defense in depth: lifecycle readiness may count only canonical readiness keys.
alter table public.laurem_recruitment_onboarding_checklist
  drop constraint if exists laurem_recruitment_onboarding_checklist_required_key_check;

alter table public.laurem_recruitment_onboarding_checklist
  add constraint laurem_recruitment_onboarding_checklist_required_key_check
  check (
    not required
    or public.laurem_is_staff_lifecycle_readiness_key(item_key)
  );

-- DBS/PVG remains visible in the workforce compliance area for HR follow-up.
-- This migration does not alter dbs_verified/dbs_pvg_status or delete evidence.
