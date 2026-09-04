# PB-6 — Project Participants & Commission Ledger Acceptance

Date: 2026-09-04
PR: #308
Branch: `feat/pb6-participants-commission-ledger`
Status: code / CI owner-merge gate; production unchanged

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

`project_participant_roles` is a configurable role taxonomy. Structural seeds are:

- Sales Rep
- Designer
- Contractor
- Installer
- Referral Partner
- Project Manager

Admin/Super Admin may create or relabel roles through the guarded role RPC. Structural system roles cannot be deactivated; this prevents disabling the canonical Sales Rep projection contract.

`project_participants` requires exactly one canonical subject reference per row: employee, Customer contact, or Modulex profile. Manual Sales Rep assignment is rejected and must go through Project Settings.

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

## Finance payout attribution

Actual payout is read only from posted Finance transactions linked with:

- `source_document_type = 'project_commission_obligation'`
- `source_document_id = <commission obligation id>`

Voided transactions do not count.

The Project projection does not invent FX conversion. If posted payout links exist in a currency different from the obligation currency, `paid_amount` fails closed to null and `payout_currency_state = 'mixed_currency'` so Finance must review the canonical transactions.

## Authorization

| Actor | Participants | Commission entitlement | Payout detail | Mutation |
| --- | --- | --- | --- | --- |
| Super Admin / Admin | full read | full read | visible | participant + commission manage |
| Finance | read | full read | visible | commission manage |
| Sales | read | own obligations only | restricted | none |
| HR / Warehouse / Shipping | no PB-6 surface | none | none | none |
| anon / Store / Portal | none | none | none | none |

Sales own-commission visibility resolves through canonical participant identity: `profile_id = auth.uid()` or `hr_employees.user_id = auth.uid()`. Historical own obligations remain visible after participation ends.

RLS is enabled on PB-6 tables. PUBLIC RPC execution is revoked and authenticated execution is explicitly granted only to guarded RPCs. Private PB-6 helper functions also have PUBLIC execution revoked.

## Admin surface

Project Detail renders `ProjectParticipantsCommissionPanel` using shared Modulex Admin primitives.

The panel provides:

- participant list;
- canonical Sales Rep source indicator;
- Admin participant assignment and participation end action;
- commission obligation list;
- fixed/percentage and Project/category/product creation controls;
- explicit lifecycle/correction actions;
- Sales own-commission privacy notice;
- Finance payout status without exposing payout detail to Sales.

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

Admin implementation:

- `modulex-admin/src/lib/customers/project-participants-commission-domain.ts`
- `modulex-admin/src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx`
- `modulex-admin/src/app/(admin)/projects/[id]/page.tsx`
- `modulex-admin/scripts/project-pb6-participants-commission-contract.mjs`
- `.github/workflows/admin-project-base.yml`

## TDD evidence

RED contract was committed first on branch commit `60a09d1f135a77ddb3481779cf5bdb7073581f57`. At that point the required migration/domain/UI implementation did not exist.

The first implementation run of Admin Project Base was GitHub Actions run `33886626903`; all existing Project contracts and the new PB-6 contract passed on head `fe9800d2181d3487835c6bdd3794b0e6079ce6e1`.

Admin UI Foundation then correctly rejected feature-level appearance recreation in the first PB-6 panel implementation. The panel was changed to use shared `ADMIN_SURFACE_CARD` / `ADMIN_TEXT_STYLES` tokens rather than bypassing the strict gate.

Final-head CI identifiers are recorded in PR #308 after the last code commit completes.

## Production boundary

No PB-6 migration, DDL, RPC or business-data mutation has been applied to production before owner merge.

Production was queried read-only to verify the existing canonical contracts used by PB-6, including `customer_projects`, `hr_employees`, `customer_contacts`, `profiles`, Order/product/category references, `finance_transactions`, and `finance_transaction_links`.

## Post-merge production acceptance

Only after explicit owner approval:

1. apply PB-6 migrations in order;
2. verify tables, indexes, triggers, RLS policies, RPC grants and private-function execute lockdown;
3. verify Sales Rep projection against existing `customer_projects.sales_rep_id` without changing Project Sales Rep truth;
4. use rollback-only role-authenticated probes for Admin participant management and Finance commission lifecycle;
5. prove Sales sees only own commission obligations and no payout detail;
6. prove unrelated roles and anon cannot read PB-6 internal data;
7. prove category/product scope mismatch fails closed;
8. prove immutable UPDATE/DELETE guards reject destructive rewrites;
9. prove same-currency posted Finance attribution rolls up and mixed-currency attribution fails closed;
10. rerun Supabase Security and Performance Advisors;
11. deploy Admin and perform signed-in Project Detail acceptance.

PB-7 Change Orders is explicitly outside PR #308 and has not started.
