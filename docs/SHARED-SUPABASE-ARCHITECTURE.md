# Shared Supabase architecture

BIMED and CONAGS intentionally share one Supabase project. They do not share application tables.

## Ownership boundary

BIMED retains ownership of the existing shared `recruitment_*` and legacy workforce tables. CONAGS uses a physical `laurem_` prefix for its portal tables and RPCs.

The CONAGS server client in `lib/db.ts` keeps the application's logical table names stable while translating known CONAGS table and RPC names to their prefixed physical names. This means an existing CONAGS call such as `db().from('recruitment_applications')` reaches `laurem_recruitment_applications`, not BIMED's table.

This allowlist includes the logical `workforce_audit_events` table used by assignment and leave audit logging. It is translated to `laurem_workforce_audit_events`, so workforce audit events cannot fall through to a shared `workforce_audit_events` table.

Unknown table names and Supabase operations are passed through unchanged. CONAGS therefore cannot silently take over BIMED-only tables through the CONAGS name map.

## Data ownership

CONAGS is a brand-new portal. Its production recruitment namespace starts empty.

Existing applicants, invites, interviews, second interviews, contract signatures and other recruitment records in the shared `recruitment_*` namespace belong to BIMED's existing portal. They are not CONAGS records and must not be copied into CONAGS.

The corrective cutover migration removes any records previously copied into the CONAGS namespace and leaves the shared source tables untouched.

## Migration rule

Never rename, drop, truncate, or repurpose the existing shared BIMED tables to satisfy CONAGS migrations.

CONAGS migrations create and evolve only the `laurem_*` physical namespace and CONAGS-owned storage. New CONAGS candidate activity should create records only in that namespace.

The historical isolation migration contains legacy bootstrap-copy SQL because it was the migration used during the original shared-schema cutover. It must be treated as a historical migration and must not be repurposed as a data-import mechanism. The subsequent empty-cutover migration and baseline guard enforce the current launch policy: CONAGS starts with zero application/recruitment/workforce rows.

## Production baseline

After correction, production contains:

- CONAGS invites: 0
- CONAGS applications: 0
- CONAGS interviews: 0
- CONAGS second interviews: 0
- CONAGS archived legacy contract signatures: 0

The existing BIMED/shared counts remain unchanged: 59 invites, 15 applications, 4 interviews, 9 second interviews and 6 contract signatures.

The executable baseline guard migration fails the migration sequence if any CONAGS-owned rows exist at first launch. It performs no writes against BIMED/shared recruitment tables.

## Deployment sequence

1. Apply the CONAGS schema/isolation migrations.
2. Apply the empty-cutover cleanup migration.
3. Apply the CONAGS empty-baseline guard and require it to succeed.
4. Deploy the CONAGS application containing the `lib/db.ts` routing layer.
5. Run the authenticated CONAGS system health check.
6. Confirm new CONAGS application writes are landing in `laurem_*` tables.
7. Keep BIMED on its existing shared tables. No BIMED migration is required for the CONAGS cut-over.

This architecture intentionally favours additive isolation over a risky in-place rename or schema replacement.
