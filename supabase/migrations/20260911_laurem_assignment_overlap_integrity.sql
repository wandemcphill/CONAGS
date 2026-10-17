-- Enforce the same no-overlap rule at the database boundary so concurrent
-- admin requests cannot create conflicting scheduled/confirmed assignments.
create extension if not exists btree_gist;

alter table public.laurem_staff_assignments
  add constraint laurem_staff_assignments_no_active_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  ) where (status in ('scheduled', 'confirmed'));

alter table public.laurem_staff_assignments
  enable row level security;
revoke all on public.laurem_staff_assignments from anon, authenticated;
