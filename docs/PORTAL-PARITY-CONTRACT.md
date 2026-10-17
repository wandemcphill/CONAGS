# Portal Parity Contract

## Purpose

CONAGS Portal and BIMED Portal serve the same broad product purpose: private recruitment followed by controlled employee onboarding and staff/workforce management.

The portals must maintain comparable engineering capability, lifecycle integrity, security and auditability while keeping company identity, terminology, data namespaces and jurisdiction-specific employment/immigration policy completely separate.

## Common lifecycle baseline

Every portal must support and enforce:

1. Private candidate invitation and controlled application access.
2. Candidate recruitment lifecycle with explicit status transitions.
3. First-stage assessment/interview and, where applicable, second-stage assessment.
4. Candidate evidence/document collection and review.
5. Central role normalization.
6. Employment contract generation and acceptance.
7. A backend-enforced contract gate before staff conversion.
8. A backend-enforced readiness gate before staff conversion.
9. Server-side staff provisioning with a permanent employee identifier.
10. Secure staff activation, authenticated self-service and self-service password recovery.
11. Staff onboarding package/tasks with acknowledgement where required.
12. Internal staff messaging with anti-enumeration controls.
13. Workforce operations appropriate to the product, including shifts/rota, attendance/timesheets, leave and payroll/pay records.
14. Administrative Staff 360/workforce oversight.
15. Audit history for sensitive recruitment, contract, onboarding and workforce actions.
16. Critical invitations and lifecycle actions are idempotent or protected against concurrent duplicate execution.
17. Release/schema health checks and regression coverage for critical lifecycle rules.

## Jurisdiction boundary

The common baseline is architectural, not legal.

### CONAGS

UK/Scotland employment, right-to-work, sponsorship, professional-registration and international-recruitment policies belong only to CONAGS policy modules and approved company content.

Policy ownership includes the company configuration, role policy, recruitment configuration, onboarding readiness and lifecycle modules plus the international nurse and UK welcome configuration.

### BIMED

Ireland employment, employment-permit, immigration, accommodation/relocation and Ireland-specific recruitment policies belong only to BIMED policy modules and approved company content.

Policy ownership includes the company/recruitment configuration, role policy, employment-permit options, onboarding readiness and accommodation/relocation modules.

No portal may copy the other company's legal wording, statutory thresholds, sponsorship assumptions, payment terms, URLs, mailbox names or database identifiers.

## Lifecycle rule

A candidate must never become a staff identity merely because an administrator changed a recruitment status.

The backend must prove the applicable contract and readiness requirements before staff provisioning and before a status transition that represents staff conversion.

The UI is a presentation layer. It is never the authority for eligibility.

Invitation and status operations that can be triggered more than once must not create duplicate active records when the underlying business state permits only one active workflow.

## Change discipline

Before adding a lifecycle feature to either portal:

- audit the corresponding existing workflow first;
- identify the authoritative backend transition;
- add a regression test for the happy path;
- add a regression test for the bypass/negative path;
- verify the relevant database constraint, RLS and RPC permissions;
- preserve the portal's own jurisdiction policy;
- avoid copying implementation-specific company names or fields from the other product.

## Definition of parity

On par means the two products have equivalent engineering capability and lifecycle safety, not identical screens or identical legal workflows.

A difference is legitimate when it is caused by jurisdiction, company policy, role mix, professional-regulatory requirements, terminology, or the payroll/workforce model.

A difference is not legitimate when it is caused by an accidental missing feature, missing authorization check, client-only gate, untested bypass, duplicated role logic, inconsistent status transitions, missing auditability, or different security quality for equivalent functions.