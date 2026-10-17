# CONAGS Portal Security Baseline

This document records the application-level security controls that are part of the production release baseline.

## Administrator authentication

The configured admin credential remains server-side only. Login attempts are throttled using a Supabase-backed state table and a database function. The application derives a keyed SHA-256 throttle key from the request identity, so raw IP addresses, passwords and submitted credentials are not persisted.

A maximum of 10 failed attempts is allowed within a 15-minute window for a throttle key. Once blocked, the API returns HTTP 429 and a `Retry-After` response header. If the throttle store cannot be checked, administrator login fails closed with HTTP 503 rather than bypassing the control.

Admin sessions remain HMAC-signed and expire after eight hours. The explicit logout endpoint clears the session cookie immediately.

## Browser boundary

The application sends baseline response headers for MIME sniffing protection, clickjacking protection, referrer control, browser capability restriction and cross-origin isolation. A restrictive Content Security Policy is intentionally not added here because the existing portal contains inline styles; CSP needs a separate inventory and nonce-based migration rather than a cosmetic header.

## Secrets and persistence

Credential-bearing request bodies, email HTML, notification payloads and administrator passwords must never be copied into persistent audit or notification tables. Delivery records retain operational metadata only.

## Deployment rule

Repository migrations are source-controlled but are not evidence that a production database has been changed. Before release, the correct CONAGS Supabase project must be identified, migrations must be applied there, and the resulting schema/functions/RLS state must be verified against the application release.
