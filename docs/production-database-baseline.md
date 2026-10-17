# CONAGS production database baseline

Verified against Supabase project `xjnzmkaaxytwbgftrnxn` on 20 September 2026.

| Property | Verified value |
|---|---|
| Postgres engine | 17 |
| Postgres release | 17.6.1.155 |
| Supabase project status | ACTIVE_HEALTHY |
| Migration rows recorded in `supabase_migrations.schema_migrations` | 126 |
| Historical recovery baseline | `20260920184540` |
| Historical recovery migration | `laurem_missing_fk_indexes_20260920` |
| Source-controlled governance migration | `20260920213203` |
| Source-controlled governance fix | `20260920213318` |

## Repository/source-control note

The production database has a real migration history, but the repository does not currently contain the corresponding `supabase/migrations` SQL history.

This document is therefore a **baseline record**, not a replacement for replayable migration files. It prevents us from pretending the repository can currently reconstruct the production database from source control alone.

The next schema change should be introduced with a tracked migration file and verified against production before release.

Schema-governance migrations are now source-controlled. The historical pre-recovery chain remains documented but is not yet reconstructed into individual repository files.

## Current lifecycle schema contract

The production health check now treats these employment-lifecycle tables as required:

- `staff_documents`
- `staff_document_events`
- `staff_visa_cases`
- `staff_visa_invoices`
- `staff_visa_case_events`

The health check also verifies the private `laurem-private-documents` storage bucket.

## Release principle

Application code, CI, deployment state and the production database must agree before a release is considered complete.