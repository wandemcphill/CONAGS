# Shared Supabase architecture

BIMED, LAUREM and CONAGS intentionally share one Supabase project, but their application data is stored in separate namespaces.

## Ownership boundary

- BIMED continues to own the existing unprefixed `recruitment_*` and legacy workforce tables.
- LAUREM continues to own the physical `laurem_*` tables, functions, audit data and storage buckets.
- CONAGS uses physical `conags_*` tables and RPC functions, plus the private `conags-private-documents` and `conags-staff-photos` storage buckets.

The CONAGS server client in `lib/db.ts` keeps the existing application call-sites compatible: logical names such as `recruitment_applications`, and legacy `laurem_*` identifiers still present in the forked source, are routed to the corresponding `conags_*` physical object. It must never route a CONAGS request to a `laurem_*` or unprefixed BIMED table.

## Data isolation and cutover

The CONAGS namespace-isolation migration clones table definitions, indexes, constraints, foreign keys, RLS state, database functions and triggers from the existing LAUREM schema. It creates an empty CONAGS starting point; **it does not copy table rows, staff records, candidate records, invitations, interview answers, contracts, invoices, audit records or stored files**.

The original LAUREM and BIMED tables, functions, storage buckets and existing records remain untouched. The LAUREM migration history is retained as historical source-control context; after the namespace-isolation migration, all new CONAGS schema changes must use `conags_*` names and must not clean up or alter LAUREM/BIMED objects.

## Security boundary

All CONAGS tables have Row Level Security enabled and grant table access only to the server-side `service_role`. CONAGS RPCs are created with execution restricted to `service_role`; no CONAGS table or security-definer RPC is intentionally exposed to `anon` or `authenticated`. The portal server must keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.

The CONAGS storage buckets are private. Document and photo access must go through authenticated server routes; never make these buckets public.

## Deployment and verification

1. Apply the tracked `conags_namespace_isolation` migration to the existing shared project.
2. Confirm that all `conags_*` tables exist, are empty, and have RLS enabled.
3. Confirm that the CONAGS functions and triggers refer only to CONAGS-owned tables/functions.
4. Deploy the CONAGS app with the updated `lib/db.ts` and storage bucket names.
5. Exercise invitation, application, first/second interview, evidence upload, contract, onboarding and staff account flows.
6. Verify new records appear only in `conags_*`; re-check that LAUREM and BIMED row counts have not changed.

Do not rename, drop, truncate, repurpose or bulk-copy existing shared tables to establish CONAGS.
