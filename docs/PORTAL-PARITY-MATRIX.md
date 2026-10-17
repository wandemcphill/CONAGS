# Portal Parity Matrix

This matrix tracks the shared engineering capability target for CONAGS Portal and BIMED Portal. It is deliberately not a legal or regulatory equivalence document.

| Capability | CONAGS | BIMED | Parity decision |
| --- | --- | --- | --- |
| Private invitation/application access | Implemented | Implemented | Common |
| Recruitment lifecycle/status control | Implemented | Implemented | Common, backend controlled |
| First-stage assessment/interview | Implemented | Implemented | Common |
| Second-stage interview | Atomic duplicate guard | Atomic duplicate guard added in parity branch | Common |
| Central role normalization | Implemented | Implemented | Common |
| Accepted employment contract gate | Universal gate on parity branch | Universal gate on parity branch | Common |
| Pre-staff readiness gate | Implemented | Implemented | Common |
| Staff provisioning | Implemented | Implemented | Common |
| Staff activation | Implemented | Implemented | Common |
| Staff password recovery | Implemented | Implemented | Common |
| Staff messaging | Implemented | Implemented | Common |
| Shift/rota management | Implemented | Implemented | Common |
| Time/attendance tracking | Timesheets | Attendance | Equivalent capability, different terminology |
| Leave management | Implemented | Backend existed; Staff Portal UI added in parity branch | Common |
| Payroll/pay records | Payroll | Payslips | Equivalent capability, different implementation |
| Staff profile | Implemented | Implemented | Common |
| Candidate/Admin 360 | Implemented | Implemented | Common |
| Admin readiness controls | Implemented | Implemented | Common |
| Evidence/document review | Native evidence lifecycle | Candidate/document packet workflow | Needs continued review, do not force identical implementation |
| Staff onboarding | Package/tasks/acknowledgements | Recruitment-linked verification plus permit/relocation workflow | Continue parity audit |
| Staff documents | General staff document workspace | Signed-contract access and company documents | Continue parity audit |
| International sponsorship | UK/Scotland policy | Ireland employment-permit policy | Jurisdiction-specific, never copied |
| Professional registration | NMC pathway where applicable | CORU pathway where applicable | Jurisdiction/role-specific |
| Relocation/travel | UK-specific | Ireland-specific flights/arrival workflow | Company/jurisdiction-specific |
| Accommodation | CONAGS model | BIMED-specific accommodation billing | Company-specific |
| Security/RLS/audit | Required | Required | Common |
| Release/schema health | Implemented | Required baseline | Common |
| Regression coverage | Extensive | Being expanded by parity branch | Common target |

## Rules

A parity gap is an engineering defect when an equivalent function is missing, weakly authorized, client-only gated, non-idempotent, unaudited, or inconsistently enforced.

A difference is legitimate when it is caused by company policy, jurisdiction, professional registration, role mix, payroll model, terminology, or a deliberately different relocation/accommodation arrangement.

Any new feature must be audited against both portals before implementation so that a fix in one product does not silently recreate an already-resolved error in the other.
