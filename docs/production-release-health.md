# CONAGS production release health

## Runtime health endpoints

The production service exposes two distinct health contracts.

### Liveness

`GET /api/health`

This is intentionally lightweight and dependency-free so Render can use it safely as the service Health Check Path.

It returns:

- `200` with `ok: true` when the Next.js process is responding.
- the deployed release commit when Render provides it.
- no database details, environment values, credentials or internal errors.

Recommended Render Health Check Path:

`/api/health`

### Database readiness

`GET /api/health/ready`

This performs a lightweight server-side database probe against the CONAGS recruitment schema.

It returns:

- `200` and `ok: true` when the database is reachable.
- `503` and `ok: false` when the database probe fails.
- database probe latency, but no raw database error or secret.

This endpoint is the runtime readiness signal for deeper operational monitoring. It is not the Render liveness probe.

## Administrative dependency health

The authenticated admin endpoint remains:

`GET /api/admin/system/health`

It performs the broader release-readiness check covering required environment variables, the CONAGS-owned schema contract, database reachability, and the private document storage bucket.

The schema portion now comes from the service-role-only `laurem_verify_release_schema()` database contract. It checks the 38-table CONAGS lifecycle surface, RLS posture, critical employment/visa columns, required performance/FK indexes, and the recovered migration baseline.

## Release rule

A release is not complete until:

1. CI passes dependency audit, typecheck, tests, production build, and the public liveness smoke test.
2. Render deploy reaches `live`.
3. `/api/health` returns `200`.
4. `/api/health/ready` returns `200` in an environment with production Supabase configuration.
5. The authenticated admin system health endpoint reports the expected production dependencies.

The current Render integration can inspect the Health Check Path but cannot mutate that service setting, so configuring `/api/health` remains a Dashboard configuration step.
