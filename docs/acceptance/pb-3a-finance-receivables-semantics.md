# PB-3A Finance Receivables Semantics — Acceptance

Date: 2026-09-03
PR: #276
Branch: `fix/project-finance-receivables-semantics`

## Purpose

This is a post-deploy PB-3A Admin UX correction. It does not reopen the payment-ledger architecture and introduces no Supabase schema, RPC, RLS, or production-data change.

The Finance workspace now keeps four separate concepts explicit:

- **Collected** — actual effective customer cash received.
- **Applied** — collected cash explicitly allocated to payment requirements/milestones.
- **Unallocated Credit** — collected cash not yet allocated to a milestone.
- **Open Requirements** — milestone value that still has not been satisfied by allocations.

**Customer Balance** means money still owed by the customer against the Payment Plan, calculated per currency as `max(Payment Plan - Collected, 0)`. It is intentionally not the same as Open Requirements.

Example accepted from the production review:

- Order Value: USD 1,990
- Payment Plan: USD 5,000
- Collected: USD 5,000
- Applied: USD 2,000
- Unallocated Credit: USD 3,000
- Open Requirements: USD 3,000
- Customer Balance: USD 0

The USD 3,000 open requirement is not customer debt in that example because USD 3,000 has already been collected and remains available as unallocated Project credit.

## Order Value reconciliation

Active Project Order totals are shown as a reference only. The Payment Plan is not locked 1:1 to Orders.

When the Payment Plan and current active Project Order value differ in the same currency, Admin/Finance receives a non-blocking warning. The workflow remains editable because future Orders, agreed milestones, deposits, and later commercial changes may legitimately cause a temporary difference.

No cross-currency values are combined or silently converted.

## UI terminology

The Payment Plan table now labels the allocation-derived milestone column **Applied** instead of **Received**. Actual received cash remains visible in Customer Payments / Collected.

The Commercial Overview exposes, per currency:

1. Order Value
2. Payment Plan
3. Collected
4. Customer Balance
5. Applied
6. Unallocated Credit
7. Open Requirements
8. Overdue

## Authorization boundaries

This correction does not change PB-3A authorization:

- Sales remains status-only and does not receive payment amounts, cost, margin, profit, vendor price, or outgoing-finance amounts.
- Finance/Admin retain detailed payment-ledger access and mutation controls.
- PB-2 cost/margin remains separately permission-gated.
- Store / Customer Portal / Dealer Portal projections are unchanged.

## TDD evidence

RED:

- Admin Project Base run `33767052257`
- Expected failure: `Project Finance must receive active Order totals as a reconciliation reference without coupling milestones to Orders`
- Existing Project Base, Project Progress, and PB-2 financial-rollup contracts passed before the new PB-3A assertion failed.

GREEN functional head: `31b1c003cc572cce2e6c612c5b924a584d404155`

- Admin Project Base `33767587598` — PASS
- Admin Customers UI `33767587651` — PASS
- Admin UI Foundation `33767587672` — PASS
- Admin A1 Core Operations `33767587584` — PASS
- GC-6 Cabinet Journey `33767587644` — PASS
- GC-7 Attributed Social Proof `33767587629` — PASS

Admin UI Foundation also passed strict changed-file UI checks, TypeScript, lint, and the production build.

## Package tracking

PB-3A remains the same accepted Project Payment Ledger package. This follow-up corrects presentation semantics only; PB-3B Procurement remains the next Project Base business package after this UX correction is merged/deployed.
