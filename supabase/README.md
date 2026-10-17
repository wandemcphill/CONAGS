# CONAGS Supabase schema governance

## Production baseline

The CONAGS production database contains a historical migration chain that predates source-control recovery. As of 20 September 2026, the verified production baseline ended at migration `20260920184540_laurem_missing_fk_indexes_20260920`.

The repository does not yet contain the preceding historical migration files. That gap is documented explicitly in `docs/production-database-baseline.md`.

## Source-controlled forward migrations

The first source-controlled migrations added after the recovered baseline are:

- `20260920213203_laurem_schema_drift_guard_20260920.sql`
- `20260920213318_laurem_schema_drift_guard_fix_20260920.sql`

Together they create the service-role-only `public.laurem_verify_release_schema()` contract.

The verifier checks:

- 38 CONAGS lifecycle/workforce tables
- RLS enabled on every contract table
- critical employment-document and visa columns
- the indexed performance/FK contract established by the recent hardening work
- presence of the recovered baseline migration `20260920184540`

## Release behavior

The authenticated admin release-health endpoint consumes the full contract result.

The public `/api/health/ready` endpoint consumes only the boolean result and never exposes the detailed drift inventory.

Future database changes must add a tracked migration file and keep the release-health contract green before deployment.
