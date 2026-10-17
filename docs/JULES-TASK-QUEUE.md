# Jules Task Queue

## ACTIVE: CONAGS Portal BIMED parity

Read `docs/JULES-HANDOFF-BIMED-PARITY.md` and execute it end-to-end.

Priority order:
1. Audit current CONAGS Portal and open PR #1.
2. Audit latest merged BIMED Portal improvements for signed-contract promotion, onboarding readiness, and centralized role policy.
3. Implement the CONAGS equivalents without copying BIMED-specific business data or branding.
4. Preserve and reconcile the existing CONAGS staff messaging/portal-identity feature.
5. Run typecheck, tests, regression tests and build.
6. Apply only repository-safe changes and create a reviewable PR into `main`.
7. Document any Supabase migration or production deployment actions that require human execution.

Do not touch CONAGS Web, BIMED Web, or BIMED Portal.
