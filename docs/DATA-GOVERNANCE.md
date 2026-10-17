# CONAGS Data Governance Control Plane

## Purpose

CONAGS treats recruitment, workforce and document data as controlled operational records. The governance center detects broken references and routes retention/export/deletion decisions through explicit operator review.

This control plane does **not** perform automatic destructive deletion.

## Ownership

| Data area | Operational owner | Default control |
| --- | --- | --- |
| Unsuccessful candidates | Recruitment Operations | Retention review required |
| Recruitment documents | Document Control | Retention review required |
| Superseded staff documents | Document Control | Retention review required |
| Inactive staff | Workforce Operations | Retention review required |
| Staff messages | Workforce Operations | Retention review required |

Retention windows are intentionally not hard-coded as legal requirements. An approved retention window can be configured in the governance policy record after CONAGS's responsible operator has confirmed the applicable obligation.

## Current private storage

The production project currently exposes these buckets as private:

- `laurem-private-documents`
- `laurem-staff-photos`
- `interview-recordings`
- `bimed-staff-photos`

The main CONAGS private document bucket currently limits uploads to 10 MB and the staff-photo bucket to 5 MB. Signed document URLs are time-limited by the existing application routes.

## Governance findings

The scanner detects at least:

- recruitment documents without a valid application
- staff documents without a valid staff profile
- contracts without a valid application
- onboarding packages without a valid staff profile
- message conversations without participants
- messages without a valid conversation
- visa cases without a valid staff profile

Findings can be acknowledged, held, resolved or reopened. Resolution and hold actions require an operator reason and are written to the canonical audit timeline.

## Data requests

CONAGS supports:

- metadata-only export requests
- deletion-review requests

Export manifests intentionally exclude document contents, storage paths, signed URLs, authentication material and private message bodies.

Deletion requests are review records only. No automatic destructive deletion is performed by this control plane.

## Recovery expectations

Backups and restoration procedures remain infrastructure responsibilities. Before destructive lifecycle work is approved, operators should verify that the underlying database/storage backup posture is current and that restoration can recover both the operational record and its audit history.

The canonical audit timeline and governance findings are protected records and must not be treated as disposable application content.

## Least privilege

Sensitive governance tables are RLS-enabled and have no direct grants to `anon` or `authenticated`. Application access uses the existing server-side/admin service boundary.

Error payloads should continue to return generic operator-safe messages. Diagnostic logs should exclude passwords, tokens, signed URLs, document contents and private authentication material.

## Release verification

The authoritative schema contract includes the governance tables and indexes. The production governance scan should remain clean for active orphan findings before a production release is considered complete.
