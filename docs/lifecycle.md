# CONAGS Portal lifecycle

The canonical employment lifecycle is:

application → accepted contract → readiness → staff profile → Hired → portal provisioning → portal activation

The enforcement boundary is deliberate:

- `lib/laurem-lifecycle.ts` provides server-side application, contract and readiness validation.
- `lib/laurem-lifecycle-policy.ts` defines the canonical application and staff state machines.
- `public.laurem_evaluate_staff_lifecycle(...)` is the database policy boundary used by transactional RPCs.
- Critical transitions are `prepare_onboarding`, `mark_hired`, `portal_provision`, and `portal_activate`.

## Canonical ordering

1. The application must have an accepted contract whose canonical role matches the applied role.
2. Required onboarding readiness items must exist and be completed or explicitly waived.
3. The gated onboarding flow creates or repairs the workforce identity and binds it to the accepted contract. Staff remains `pending`.
4. The application can then move to `Hired`. `Hired` does not require portal activation to have happened yet.
5. Portal provisioning can issue the one-time activation credential only for a `Hired` application with complete readiness and a bound pending staff record.
6. Portal activation atomically converts that pending staff record to `active` and creates the staff session.

## Idempotency and re-entry

Same-state application transitions are safe and deterministic. Re-running onboarding for an eligible `Offer`, `Onboarding`, or `Hired` application reuses existing staff/package records and repairs a missing staff-contract binding.

`Rejected` and `Withdrawn` are terminal application states. Re-entry requires an explicit admin override reason, and the contract/readiness/staff gates remain enforced even when the state-machine override is used.

## Partial historical records

The defined repair path for an eligible historical `Offer`, `Onboarding`, or `Hired` record is the gated admin onboarding flow. It rechecks the accepted contract and readiness, creates a missing staff identity when safe, binds an unbound legacy staff record to the accepted contract, and remains transactionally idempotent.

Portal activation is never itself a repair mechanism. Legacy activation tokens are cleared by the admin onboarding flow, and new provisioning occurs only from the `Hired` state.
