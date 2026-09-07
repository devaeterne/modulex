# PB-6 — Project Participants & Commission Ledger Acceptance

Date: 2026-09-04
PR: #308
Branch: `feat/pb6-participants-commission-ledger`
Status: COMPLETE / PRODUCTION VERIFIED

## Goal

PB-6 adds Project participant assignment and commission entitlement without creating a second Finance/payment truth.

Project owns:

- who participates in a Project;
- the participant's Project role;
- commission obligation basis and scope;
- explicit commission lifecycle and append-safe corrections.

Finance continues to own actual money movement.

## Canonical truth boundaries

- Project Sales Rep remains `customer_projects.sales_rep_id -> profiles.id`.
- PB-6 projects that canonical Sales Rep into `project_participants` with `source = 'project_sales_rep'`; the manual participant RPC refuses to edit Sales Rep.
- Employees reuse `hr_employees`.
- Customer-side people reuse `customer_contacts` for the Project Customer.
- Modulex users reuse `profiles`.
- No generic external-party/person table was invented because no canonical external-party model exists in the current schema.
- Actual commission payout remains `finance_transactions` plus `finance_transaction_links`.
- PB-6 does not create `project_commission_payments` or any other Project-owned payment ledger.

## Participant model

`project_participant_roles` is a configurable role taxonomy. Default roles are:

- Sales Rep
- Designer
- Contractor
- Installer
- Referral Partner
- Project Manager

Only Sales Rep is structural because it projects canonical `customer_projects.sales_rep_id`. Admin/Super Admin may relabel Sales Rep but cannot deactivate it. The other seeded business roles are configurable defaults and may be deactivated or replaced by custom roles.

Admin/Super Admin can configure the taxonomy through the guarded role RPC and the Project Detail `Participant Roles` Admin surface.

`project_participants` requires exactly one canonical subject reference per row: employee, Customer contact, or Modulex profile. Manual Sales Rep assignment is rejected and must go through Project Settings.

The authoritative participant RPC also rejects inactive/missing employees, inactive/wrong-Customer contacts, and inactive/missing Modulex profiles. UI candidate filtering is convenience only; DB validation remains authoritative.

## Commission obligation model

`project_commission_obligations` is the immutable commercial snapshot. It supports:

- fixed amount;
- percentage of an explicit basis snapshot;
- whole-Project scope;
- product-category scope;
- product scope;
- ISO three-letter currency.

Category/product scope is validated again at the DB boundary and must belong to a non-cancelled Order in the same Project. The client list is only convenience; it is not the authority.

No automatic earned formula or Project-status trigger is invented. Creation starts in `pending`; earning is an explicit business action because the repository/spec does not define a trustworthy automatic earning event.

## Append-only lifecycle

`project_commission_events` records:

- `earned`
- `approved`
- `cancelled`
- `adjustment`
- `offset`
- `reversal`

Obligations and events reject UPDATE/DELETE. Adjustment/offset/reversal writes append new history. An adjustment to an earned/approved obligation returns the derived status to `earned`, requiring approval again rather than silently rewriting an approved amount.

Corrections are DB-guarded so current entitlement cannot become negative.

A bounded `get_customer_project_commission_events` projection exposes event history under the same commission visibility boundary. Project UI uses that history to select reversible adjustment/offset events; users are not required to obtain raw event UUIDs outside the UI.

## Finance payout attribution

Actual payout is read only from posted Finance transactions linked with:

- `source_document_type = 'project_commission_obligation'`
- `source_document_id = <commission obligation id>`

Voided transactions do not count.

The Project projection does not invent FX conversion. If posted payout links exist in a currency different from the obligation currency, `paid_amount` fails closed to null and `payout_currency_state = 'mixed_currency'` so Finance must review the canonical transactions.

## Authorization

| Actor | Participants | Commission entitlement | Event history | Payout detail | Mutation |
| --- | --- | --- | --- | --- | --- |
| Super Admin / Admin | full read | full read | full read | visible | participant + role + commission manage |
| Finance | read | full read | full read | visible | commission manage |
| Sales | no internal PB-6 surface | none | none | none | none |
| HR / Warehouse / Shipping | no PB-6 surface | none | none | none | none |
| anon / Store / Portal | none | none | none | none | none |

Sales does not receive the internal Participants & Commission ledger. A later personal, summary-only projection may expose only the individual final receivable after Project completion; that projection is intentionally separate from the internal ledger.

RLS is enabled on PB-6 tables. PUBLIC RPC execution is revoked and authenticated execution is explicitly granted only to guarded RPCs. Private PB-6 helper functions also have PUBLIC execution revoked.

## Admin surface

Project Detail exposes a `Participants & Commission` tab using shared Modulex Admin primitives and appearance tokens. The tab is visible only to Finance, Admin, and Super Admin; participant-role configuration remains Admin/Super Admin-only inside that tab.

The surface provides:

- participant list;
- canonical Sales Rep source indicator;
- Admin participant assignment and participation end action;
- Admin participant-role configuration;
- commission obligation list;
- fixed/percentage and Project/category/product creation controls;
- commission event history;
- explicit earned / approved / cancelled / adjustment / offset / reversal actions;
- bounded reversal target selection from prior adjustment/offset events;
- Finance payout state within the internal tab;
- no Sales access to participant assignments, commission basis, event history, or payout detail.

## Repository sources

Core migration / byte-identical Admin mirror:

- `modulex-store/supabase/migrations/20260904150000_customer_project_participants_commission_ledger.sql`
- `modulex-admin/sql/project-pb6-participants-commission-ledger.sql`

Hardening migration / mirror:

- `modulex-store/supabase/migrations/20260904150500_customer_project_participants_commission_hardening.sql`
- `modulex-admin/sql/project-pb6-participants-commission-hardening.sql`

System-role guard / mirror:

- `modulex-store/supabase/migrations/20260904151000_customer_project_participant_system_role_guard.sql`
- `modulex-admin/sql/project-pb6-participant-system-role-guard.sql`

Participant / commission integrity / mirror:

- `modulex-store/supabase/migrations/20260904151500_customer_project_participant_commission_integrity.sql`
- `modulex-admin/sql/project-pb6-participant-commission-integrity.sql`

Commission event projection / mirror:

- `modulex-store/supabase/migrations/20260904152000_customer_project_commission_event_projection.sql`
- `modulex-admin/sql/project-pb6-commission-event-projection.sql`

Role classification / mirror:

- `modulex-store/supabase/migrations/20260904152500_customer_project_participant_role_classification.sql`
- `modulex-admin/sql/project-pb6-participant-role-classification.sql`

Admin implementation:

- `modulex-admin/src/lib/customers/project-participants-commission-domain.ts`
- `modulex-admin/src/lib/customers/project-commission-events.ts`
- `modulex-admin/src/lib/customers/project-participant-role-admin.ts`
- `modulex-admin/src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx`
- `modulex-admin/src/components/customers/project-detail/ProjectParticipantRoleManager.tsx`
- `modulex-admin/src/app/(admin)/projects/[id]/page.tsx`
- `modulex-admin/scripts/project-pb6-participants-commission-contract.mjs`
- `.github/workflows/admin-project-base.yml`

## TDD evidence

RED contract was committed first on branch commit `60a09d1f135a77ddb3481779cf5bdb7073581f57`. At that point the required migration/domain/UI implementation did not exist.

The first implementation run of Admin Project Base was GitHub Actions run `33886626903`; all existing Project contracts and the new PB-6 contract passed on head `fe9800d2181d3487835c6bdd3794b0e6079ce6e1`.

Admin UI Foundation then correctly rejected feature-level appearance recreation in the first PB-6 panel implementation. The panel was changed to use shared `ADMIN_SURFACE_CARD` / `ADMIN_TEXT_STYLES` tokens rather than bypassing the strict gate. A later TypeScript RED identified a stale payout-state client reference and was corrected fail-closed.

Final-head CI identifiers are recorded in PR #308 and this acceptance artifact after the last documentation commit completes.

## Production closeout — 2026-09-07

PB-6 core/hardening/percentage/gross-profit migrations are installed. PR #352 supplied the final deterministic event-ordering hardening.

- production ordering migration: `20260907191844 — customer_project_commission_event_ordering`;
- `event_sequence` is `GENERATED ALWAYS AS IDENTITY`, historical values are non-null, and 15 targeted hardening indexes are present;
- current-status and event-history projections use `event_sequence DESC`; PUBLIC/anon execute remains denied and authenticated execute remains allowed;
- rollback acceptance verified fixed `$500.00`, sales basis `$6,635.00` → `$663.50`, GP revenue/cost/basis/commission `$6,540.70 / $2,924.00 / $3,616.70 / $361.67`;
- `earned → approved → adjustment → approved → offset → reversal` passed with one shared timestamp and six distinct sequences;
- negative entitlement, true Sales-only denial and immutable UPDATE/DELETE guards passed;
- canonical posted Finance payout attribution rolled up same-currency and failed closed for mixed currency;
- all temporary costs/accounts/obligations/events/Finance rows rolled back with zero residue;
- fresh Advisors show no PB-5/PB-6-specific blocker; unrelated debt remains separate.

**PB-6 status: COMPLETE / PRODUCTION VERIFIED.**
