# CONAGS Supabase schema governance

## Shared project boundary

CONAGS, LAUREM and BIMED use the same Supabase project. The current ownership boundary is:

- BIMED: existing unprefixed `recruitment_*` and legacy workforce tables.
- LAUREM: existing `laurem_*` tables, RPCs, audit records and private buckets.
- CONAGS: isolated `conags_*` tables and RPCs, plus private `conags-private-documents`, `conags-staff-photos` and `conags-interview-recordings` buckets.

## Applied CONAGS migrations

- `20261020160424_conags_namespace_isolation.sql` creates empty CONAGS tables, functions, constraints, triggers and RLS boundaries.
- `20261020161103_conags_lock_names.sql` gives Conags-owned advisory locks independent names.
- `20261020163911_conags_release_index_contract.sql` supplies the index names required by the release-health contract and creates a separate private interview-recordings bucket.

These migrations do not copy applicant, staff, interview, document, audit or storage-object data. The existing LAUREM and BIMED tables and stored objects are left untouched.

New CONAGS migrations must use `conags_*` objects and must not rename, drop, truncate, or repurpose LAUREM or BIMED objects. Keep migration file timestamps aligned with the versions recorded in the Supabase migration history so deploys do not try to replay already-applied changes.

## Release verification

The CONAGS database namespace is ready when:

- the expected CONAGS tables and RPCs exist under `conags_*`;
- all CONAGS tables have RLS enabled and direct `anon` / `authenticated` grants are absent;
- release-schema and release-readiness RPCs return `ok: true`;
- all Conags document, photo and interview-recording buckets are private;
- no pre-existing LAUREM or BIMED rows were copied or modified; and
- new candidate, interview, document and staff records are written exclusively to CONAGS objects.
