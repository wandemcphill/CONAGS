# CONAGS Portal CONAGS parity

This document records safeguards translated from the current CONAGS Portal into CONAGS Portal without making the products share branding, URLs or database tables.

## Implemented

### 1. Contract gate
Staff conversion requires an accepted CONAGS employment contract with `accepted_at` populated. An unaccepted, declined, draft or missing contract cannot create a staff profile.

### 2. Role consistency
`lib/laurem-role-policy.ts` is the source of truth for supported recruitment roles and canonical role slugs. Staff conversion compares the application role with the accepted contract job title after normalization. A mismatch blocks conversion.

### 3. Pre-staff onboarding readiness
`recruitment_onboarding_checklist` stores application-level readiness separately from the employee onboarding package. The required baseline is identity, qualification evidence, references and right-to-work. International candidates additionally require work-permission verification. Registered Nurses additionally require professional-registration verification.

### 4. Auditability
Readiness changes are performed through an admin-authenticated route and recorded in `recruitment_status_history`. Waivers require an explicit note, and required readiness items cannot be silently bypassed.

## Manual deployment step
Apply `supabase/migrations/20260909_onboarding_readiness_gate.sql` to the CONAGS Supabase project before using staff conversion with the readiness gate.

The application code remains server-side and continues to use the existing CONAGS `db()` client. No public website code, SMTP settings, payment integrations or secrets are changed by this feature.
