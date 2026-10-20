# CONAGS Supabase schema governance

## Shared project boundary

CONAGS, LAUREM and BIMED use the same Supabase project. The current ownership boundary is:

- BIMED: existing unprefixed `recruitment_*` and legacy workforce tables.
- LAUREM: existing `laurem_*` tables, RPCs, audit records and private buckets.
- CONAGS: isolated `conags_*` tables and RPCs, plus private `conags-private-documents` and `conags-staff-photos` buckets.

## Namespace isolation migration

`20261020165000_conags_namespace_isolation.sql` is additive. It clones schema metadata from existing LAUREM tables and functions into the CONAGS namespace but does not copy any data rows or stored files. It enables RLS, grants access to the server-side `service_role` only, and creates private CONAGS storage buckets.

The old `laurem_*` migration filenames are retained for historical/source-control compatibility. Do not replay or repurpose historical cutover/cleanup migrations against the live shared project. New CONAGS migrations must use `conags_*` objects and must not rename, drop, truncate or repurpose LAUREM or BIMED objects.

## Release verification

The CONAGS database namespace is considered ready only when:

- the expected CONAGS tables and RPCs exist under `conags_*`;
- all CONAGS tables have RLS enabled and server-only grants;
- no pre-existing LAUREM or BIMED rows were copied or modified;
- new candidate, interview, document and staff records are written exclusively to CONAGS objects; and
- the authenticated release-health endpoint passes.

Any future schema changes must be tracked in a migration and verified against the live schema before deployment.
