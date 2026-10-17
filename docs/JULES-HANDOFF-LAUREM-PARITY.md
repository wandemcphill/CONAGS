# Jules Handoff: CONAGS Portal CONAGS Parity

## Mission
Bring the latest **CONAGS Portal recruitment/workforce integrity improvements** into **CONAGS Portal**, while preserving CONAGS's own product identity, data model, routes, branding, and business rules.

## Product boundary
- **CONAGS Portal** is the private recruitment/staff-management platform.
- **CONAGS Web** is a separate public corporate website. Do not modify it.
- **CONAGS Portal** is a separate product and repository. Use it only as the reference implementation/pattern source.
- Do not copy CONAGS-specific branding, names, URLs, company facts, database identifiers, or business content into CONAGS.

## Starting point
- Work from the current `main` branch of `wandemcphill/CONAGS`.
- Review the existing open PR #1, `feat: add CONAGS Care private staff messaging and portal identity`, and preserve its useful work if it is compatible.
- Before implementation, audit the current CONAGS recruitment/staff workflow and Supabase schema.
- Inspect the corresponding CONAGS Portal implementation in `wandemcphill/CONAGS` for the latest merged improvements.

## Required CONAGS parity work
### 1. Signed-contract promotion gate
Staff must not be created/promoted from an application unless there is a valid signed employment contract.

Requirements:
- Signed contract is required.
- Contract role must match the application's canonical role.
- Prefer authoritative signed-contract name, address, and start date when creating staff.
- Do not allow client-side role manipulation to bypass backend validation.
- Preserve CONAGS's own canonical roles and aliases.
- Add regression tests for missing contract and role mismatch.

### 2. Onboarding readiness gate
Implement a backend-enforced onboarding readiness policy before staff creation.

Baseline required checks should cover the CONAGS equivalent of:
- identity verification
- qualification evidence verification
- references verification
- right-to-work verification

For international candidates, add the CONAGS equivalent of international work-permission verification where applicable.

Requirements:
- Checklist states: pending, completed, waived.
- Required items block staff creation until completed or explicitly waived.
- Waiver requires an admin note.
- Informational/non-blocking documents must remain separate from blocking checks.
- Admin-only checklist GET/PATCH APIs with proper session authorization and validation.
- Record checklist changes in the recruitment audit trail.
- Staff creation must enforce readiness server-side, after the signed-contract gate.
- Add local and international regression tests.

### 3. Role consistency
Create/strengthen a central CONAGS role policy analogous to CONAGS's role policy.

It should own:
- canonical role slugs and display labels
- legacy aliases where needed
- contract defaults
- onboarding/job-description role mapping
- safe normalization

All relevant backend flows should consume this policy instead of independently guessing roles.

### 4. Preserve/validate CONAGS workforce messaging
The existing CONAGS messaging feature must remain compatible with the above lifecycle gates.

Keep:
- permanent CONAGS staff ID
- portal-only internal staff identities
- staff-only activation
- known-handle messaging without ordinary staff directory discovery
- generic lookup failures to avoid account enumeration
- admin-only oversight/replies
- staff `/staff/messages`
- admin `/admin/messages`

Contract acceptance and staff activation must not create a staff identity before the required promotion/onboarding gates are satisfied.

## Security requirements
- Server-side authorization is authoritative.
- No public self-registration unless already explicitly required by CONAGS's existing product design.
- Do not expose staff enumeration.
- Keep service-role/database credentials server-side.
- Preserve RLS and least-privilege RPC grants.
- Do not weaken existing auth/session controls.
- Audit sensitive recruitment, contract, checklist and staff-promotion actions.

## Database
- Add migrations rather than mutating production manually in application code.
- Enable/retain RLS on exposed tables.
- Revoke unnecessary anon/authenticated/public RPC execution where appropriate.
- Add indexes and uniqueness constraints where needed.
- Include a read-only verification script for new production-critical schema controls if useful.
- Do not invent migration state. Document migrations that still require production application.

## Testing
Run and fix:
- typecheck
- unit tests
- regression tests
- build
- relevant API tests

At minimum test:
- application role normalization
- contract required
- contract/application role mismatch
- readiness local candidate
- readiness international candidate
- waiver requires note
- optional/non-blocking item cannot be used to bypass rules
- staff creation blocked when required checks are missing
- staff creation succeeds only when contract + readiness are valid
- messaging authorization and anti-enumeration

## Documentation
Add/update:
- `docs/onboarding-readiness.md`
- `docs/ROLE-POLICY.md` or equivalent
- `docs/PRODUCTION-READINESS.md`

Each must clearly describe CONAGS, not CONAGS.

## Do not do
- Do not modify CONAGS Web.
- Do not modify CONAGS.
- Do not add CONAGS URLs or branding.
- Do not invent regulatory, sponsorship, vacancy, employment or clinical claims.
- Do not change production DNS, SMTP, payment systems or unrelated integrations.
- Do not commit credentials or secrets.
- Do not publish directly to production.

## Definition of done
1. Current CONAGS Portal implementation is audited.
2. Existing PR #1 functionality is preserved and either safely merged or incorporated without duplication.
3. Signed-contract gate is enforced server-side.
4. Onboarding readiness gate is enforced server-side.
5. CONAGS role policy is centralized and consumed by recruitment/onboarding/staff flows.
6. Messaging remains staff-only and anti-enumeration.
7. Database migrations/RLS are production-safe and documented.
8. Tests, typecheck and build pass.
9. Jules produces a reviewable PR into `main`.
10. Any manual production migration/deployment steps are explicitly documented.
