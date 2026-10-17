# Conags Care

Conags Care is a separate copy of the recruitment and workforce platform. It is branded Conags Care. The original Laurem Care app is not part of this copy and is left unchanged.

A Conags Care recruitment-to-workforce platform, designed from the CONAGS recruitment and workforce architecture and structured for future white-label deployments.

## Current build tracks

- Conags company configuration
- UK and international nurse recruitment
- Role-aware first and second interviews
- Sponsorship pathway
- Candidate document collection
- Recruiter/admin workflow
- Staff onboarding and workforce operations
- Standard staff employment contract generation
- Dedicated international registered nurse employment contract generation and acceptance
- Role-specific handbooks and overseas welcome package
- Pathway-aware onboarding packages with employee acknowledgement tracking

## Communication routing

The portal's automated internal notifications are intentionally routed to **info@conagscare.com only**. The other Conags mailboxes are not used as portal alert recipients, keeping recruitment, accounts, and management correspondence focused.

Candidate-facing recruitment emails use **recruitment@conagscare.com** as the sender/reply-to address.

## Employment contract source

A previous Conags staff employment contract has been supplied as a source document for the workforce build. Its structure is being converted into a configurable contract template rather than copied blindly. Legacy references to third-party systems, websites, addresses, clients, dates, rates and employee-specific details must be replaced with Conags' current approved values before a contract is issued.

The source contract covers guaranteed minimum hours, assignments, duties, pay and expenses, holidays, absence and sick pay, pension, termination and suspension, confidentiality, training, health and safety, staff handbook, vetting, personal data, restrictive covenants, insurance, identity/uniform, disciplinary/grievance and changes to terms.

## International nurse contracts

The international nurse contract is a separate Conags template for overseas Registered Nurses recruited to Scotland. It includes sponsorship and immigration status, professional registration/NMC progress, pre- and post-registration pay, contracted hours, induction and training, safeguarding, right-to-work and vetting, ethical recruitment, relocation support, transparent repayment provisions, confidentiality, termination, and electronic acceptance.

The international nurse template is informed by current public guidance from GOV.UK, the Scottish Government's 2025 Code of Practice for international recruitment of health and social care personnel, NMC overseas registration guidance, and current 2026/27 NHS Scotland Agenda for Change pay information used only as a benchmark. NHS Scotland employment terms are not automatically incorporated into Conags contracts unless Conags expressly adopts them.

Any salary entered into an international nurse contract must be checked against the immigration rules and the approved sponsored role before issue. Where a worker is completing NMC registration, the exact lawful pre-registration arrangement and salary must be confirmed before the contract is issued.

Repayment terms must be transparent, proportionate, time-limited and flexible. Employer-liable recruitment and sponsorship costs are excluded from employee-repayable costs, and any permitted expenses must be genuine, evidenced and auditable.

## Handbooks and overseas welcome package

Conags now has two role-specific handbooks:

- `docs/handbooks/laurem-sponsored-hca-handbook.md` for Healthcare Assistants who are lawfully eligible for the applicable sponsored/in-country route.
- `docs/handbooks/laurem-overseas-nurse-handbook.md` for internationally recruited Registered Nurses joining Scotland.

International nurses also receive a dedicated `docs/handbooks/laurem-overseas-nurse-welcome-package.md`, covering pre-arrival preparation, travel, airport arrival, temporary accommodation, local orientation, bank account and payroll onboarding, National Insurance signposting, UKVI/eVisa and right-to-work, GP and healthcare access, transport, workplace culture, NMC registration support, buddy/mentor support, family/dependant considerations, community networks, anti-exploitation guidance and a 30-day settlement checklist.

The handbook configuration is defined in `lib/laurem-handbook-config.ts` so the portal can select the correct package by recruitment pathway and keep required acknowledgements machine-readable.

## Pathway-aware onboarding

When a recruiter converts an accepted candidate into a staff record, CONAGS automatically determines the onboarding audience and creates the corresponding onboarding package. An international Registered Nurse receives the Overseas Nurse Handbook, the UK/Scotland Welcome Package, sponsorship acknowledgement, NMC action-plan task, arrival/settlement checks, clinical induction, buddy/mentor and NMC registration confirmation tasks. A Healthcare Assistant receives the Sponsored HCA Handbook together with role-specific safeguarding, mandatory-training, PVG/disclosure and competency tasks.

Each package has a secure employee access link. Employees can read the assigned handbook or welcome package inside the onboarding portal and electronically acknowledge required items using their full name. Completion is stored against the staff onboarding package and individual task records. Recruiters have a separate onboarding workspace to complete operational/compliance tasks and can see package progress.

Staff conversion is gated behind an accepted employment contract. International nurses are kept in pending workforce status until the required right-to-work and NMC conditions are recorded, rather than being treated as fully deployable by default.

### Important HCA sponsorship rule

The HCA handbook deliberately does **not** present Healthcare Assistant sponsorship as an overseas recruitment route. Since 22 July 2025, care worker and senior care worker entry-clearance applications from overseas have been closed. Certain in-country applications remain possible during the transitional period where the worker already meets the immigration conditions, including the required lawful employment period with the sponsor. Conags must verify the current Immigration Rules before offering or sponsoring any HCA role.

## Source of truth

Conags' existing recruitment documents and current public employment/immigration guidance are being converted into structured, configurable workflows rather than static PDFs. Contract and handbook wording should receive employer/HR/legal approval before production issue, and links/checklists should be refreshed when official guidance changes.
