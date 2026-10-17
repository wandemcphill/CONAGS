# CONAGS Release Readiness & Operational Resilience

## Release gates

Every production release is expected to pass the application CI gates and the runtime release-readiness contract.

The runtime contract verifies:

- required server configuration is present
- database connectivity is working
- the CONAGS schema contract has no missing tables, columns or indexes and no RLS-disabled expected tables
- all required private storage buckets are present
- critical database functions required by recruitment, contracts, onboarding, hire, staff activation and audit are present

The authenticated admin health screen reports the complete result. The public `/api/health` endpoint remains dependency-free, while `/api/health/ready` verifies database and release readiness without exposing secret names or diagnostic internals.

## Correlation

API requests under `/api/*` receive a safe `x-request-id`. A caller-provided id is accepted only when it matches the restricted correlation format; otherwise CONAGS generates a new id.

Critical recruitment/workforce endpoints return the request id in their structured operational errors and write the same id to server logs. Error responses remain generic and do not include tokens, passwords, signed URLs, document contents or provider secrets.

## Failure handling

Dependency failures should fail closed for readiness rather than masquerading as healthy. A release with a missing schema prerequisite, critical function or required private bucket reports not-ready and should not be treated as production-ready.

Workflow operations remain transactional at their existing database boundaries. Email delivery remains idempotent through `notification_deliveries` and provider idempotency keys. Re-running a failed workflow should prefer the existing record or recovery path rather than create an uncontrolled duplicate.

## Rollback and recovery

Do not edit an already-applied Supabase migration. Ship forward-only corrective migrations.

Before destructive recovery work, verify that database and storage backups can restore both the operational record and the canonical audit history.

For partial recruitment-to-employment records, use the gated lifecycle repair paths rather than directly editing status, contract or staff bindings.

## Operator sequence

1. Confirm CI dependency audit, typecheck, tests, production build and smoke all pass.
2. Confirm `/api/health/ready` is ready on the deployed commit.
3. Open Admin → System health and confirm environment, database, schema, private storage and critical functions all pass.
4. Confirm the data-governance scan has no active findings requiring release attention.
5. If a release fails, capture the request id / deploy id, identify the failed gate, and apply a forward-only repair before retrying.