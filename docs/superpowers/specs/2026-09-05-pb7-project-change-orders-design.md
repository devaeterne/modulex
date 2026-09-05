# PB-7 — Project Change Orders Design

Date: 2026-09-05
Status: proposed for owner approval
Branch: `feat/pb7-project-change-orders`
Base: `main@2f0e2e6bf936d28948975a43eda7e07a7a8752e8`

## 1. Goal

Add a first-class Project-level Change Order workflow for approved post-sale business changes without creating a second Order, Finance, Procurement, Inventory, or Invoice truth.

Examples include:

- added cabinets or other scope;
- island / vanity / bath revisions;
- removed items;
- quantity changes;
- customer price adjustments / credits;
- vendor or expected-cost credits;
- other approved scope/value changes after the original sale.

A Project Change Order is the business authorization and audit record for a change. It is not the canonical Order mutation itself and is not a money-movement ledger.

## 2. Existing canonical boundaries confirmed before design

Production currently has:

- `customer_orders` / `customer_order_items` as canonical commercial Order truth;
- `customer_order_revisions` as immutable before-change Order snapshots;
- `private.update_customer_order(...)` as the guarded canonical revision path;
- `private.customer_order_revision_mode(...)`, which locks revisions after fulfillment/finalization and requires approval for Sales edits to confirmed/in-preparation/ready-for-shipment Orders;
- `approval_requests`, whose current approval behavior for `order_revision` applies the Order revision immediately;
- PB-3B Procurement synchronization from canonical Order changes / revision activity;
- `get_customer_project_financial_summary(uuid)`, which derives Project sales/cost/margin from current non-cancelled canonical Orders and current canonical product cost;
- Finance transactions and `finance_transaction_links` as canonical cash/payment attribution.

Therefore PB-7 must not directly rewrite any of those domains behind their existing guards.

## 3. Chosen architecture

### 3.1 Dedicated Project Change Order domain

PB-7 gets its own business-history tables rather than reusing `approval_requests` as canonical state.

Reason: the current generic approval framework treats approval of an Order revision as approval **and immediate application**. PB-7 needs approval and application to be separate dimensions. Reusing that row as canonical Change Order state would couple two different lifecycles and risk hidden Order mutation.

Proposed tables:

### `customer_project_change_orders`

Header / lifecycle record.

Core fields:

- `id uuid`
- `project_id uuid`
- `change_order_number integer` — DB-authoritative sequence within Project
- `title text`
- `reason text`
- `status text` — `draft | submitted | approved | rejected | cancelled`
- `correction_of_change_order_id uuid null` — optional append-safe correction relationship
- `created_by uuid`
- `submitted_by uuid null`, `submitted_at timestamptz null`
- `reviewed_by uuid null`, `reviewed_at timestamptz null`
- `review_note text null`
- `cancelled_by uuid null`, `cancelled_at timestamptz null`
- timestamps

Approval state never becomes `applied`; application is intentionally separate.

### `customer_project_change_order_lines`

Approved business effects. Lines are editable only while the parent is Draft. Once submitted they are immutable.

Core fields:

- `id uuid`
- `change_order_id uuid`
- `line_no integer`
- `effect_type text`
  - `add_scope`
  - `remove_scope`
  - `quantity_change`
  - `price_adjustment`
  - `customer_credit`
  - `vendor_credit`
  - `other`
- `target_order_id uuid null`
- `target_order_item_id uuid null`
- `product_id uuid null`
- `description text`
- `quantity_delta numeric null`
- `sell_amount_delta numeric` — pre-tax commercial effect; positive or negative
- `sell_currency_code varchar(3)`
- `expected_cost_delta numeric null` — internal expected-cost effect, not actual Finance/AP
- `cost_currency_code varchar(3) null`
- `vendor_code text null`
- timestamps / actor metadata

`sell_amount_delta` follows Project financial semantics: pre-tax sell impact, excluding tax and payment-method fees. This keeps PB-7 comparable to PB-2 Project sales.

`expected_cost_delta` is explicitly an approved expectation/snapshot, not actual vendor invoice, procurement allocation, or cash expense.

### `customer_project_change_order_events`

Append-only lifecycle/audit events:

- `created`
- `submitted`
- `approved`
- `rejected`
- `cancelled`
- `application_linked`

No destructive UPDATE/DELETE of lifecycle history.

### `customer_project_change_order_applications`

Explicit linkage from an approved Change Order to canonical Order revision history.

Core fields:

- `id uuid`
- `change_order_id uuid`
- `order_id uuid`
- `order_revision_id uuid`
- `canonical_sell_delta numeric`
- `currency_code varchar(3)`
- `linked_by uuid`
- `linked_at timestamptz`

A revision may only be linked once. The DB validates that the Order belongs to the same Project, the revision belongs to that Order, and the revision was created after Change Order approval.

## 4. Approval lifecycle

Allowed transitions:

```text
draft -> submitted
submitted -> approved
submitted -> rejected
draft -> cancelled
submitted -> cancelled (Admin/Super Admin)
```

Rules:

- Draft header/lines may be edited.
- Submitted/approved/rejected/cancelled header commercial content and lines are immutable.
- Approval/rejection uses row locking and DB-authoritative role checks.
- An approved record is never edited to fix history. A correction is a new Change Order, optionally linked by `correction_of_change_order_id` and carrying positive/negative effects as needed.
- No automatic Project status transition is implied by a Change Order.

## 5. Approval vs application

This separation is the central PB-7 rule.

**Approval** means Oakwell accepted the business change.

**Application** means the approved change has actually been reflected through existing canonical operational records.

PB-7 approval MUST NOT silently call `update_customer_order`, mutate Order items, alter invoices, create Procurement commitments, or post Finance transactions.

For Order-backed changes:

1. approve the Project Change Order;
2. open/use the existing canonical Order revision workflow;
3. after that revision exists, explicitly link the resulting `customer_order_revisions` row to the approved Change Order;
4. PB-3B Procurement continues to react to canonical Order revision activity exactly as it does today.

The Change Orders tab may provide an `Open Order` / `Apply through Order revision` action, but it never bypasses Order revision guards.

If the target Order is already fulfillment-locked/finalized, PB-7 does not invent a bypass. Customer credit/refund or vendor financial settlement must use the existing Invoice/Finance/Procurement path as appropriate.

## 6. Application reconciliation

Application status is derived, not manually typed:

- `pending` — approved and no linked canonical revision;
- `partial` — one or more revisions linked, but their reconciled sell delta does not equal the approved sell delta;
- `applied` — linked canonical revision delta reconciles to the approved sell delta within currency and rounding tolerance.

Canonical sell delta for an Order revision is derived from Order revision snapshots using the same pre-tax Project-sales semantics. Because `customer_order_revisions` stores the pre-change snapshot, the after-state is the next revision snapshot or current Order state for the latest revision.

For a zero-sell scope-only Change Order, at least one valid linked revision is required before it can be considered applied.

Mixed currency fails closed; no silent FX conversion is introduced.

## 7. Financial semantics and double-count prevention

PB-2 remains the canonical current Project financial summary. PB-7 must **not** add approved Change Order amounts into PB-2 totals once the canonical Order has already changed.

The UI therefore presents separate values:

- **Current canonical Project sales/cost/profit** — existing PB-2 truth;
- **Approved Change Orders pending application — sell impact**;
- **Approved Change Orders pending application — expected cost impact** when complete/compatible;
- optional projected sales as an informational calculation only when currency is compatible.

Once a Change Order is reconciled as `applied`, it leaves the pending-impact total. PB-2 then naturally contains the real Order effect.

This prevents both phantom revenue before application and double-counting after application.

Expected Change Order cost does not replace canonical product cost, Procurement expected cost, Vendor Invoice allocation, or Finance expense/AP truth.

## 8. Procurement / Finance / Invoice boundaries

### Procurement

PB-7 does not create Procurement requirements or commitments directly. Order-backed application uses the existing Order revision path; existing PB-3B synchronization responds to the canonical Order change.

Vendor credit / expected-cost effect in a Change Order is approval context only. Actual vendor invoice allocation/reversal remains PB-3B/Finance canonical truth.

### Finance

PB-7 creates no payment/cash ledger. Refunds, credits paid, vendor cash movement, expenses and settlements stay in Finance. If future attribution is needed, `finance_transaction_links.source_document_type/source_document_id` can point to the Change Order without duplicating the Finance transaction.

### Invoice

PB-7 does not rewrite issued invoices. Invoice adjustments/credits continue through the canonical Invoice/Finance workflow.

## 9. Authorization and privacy

### Sales

- can view Project Change Orders and customer-facing sell effects;
- can create/edit Draft Change Orders;
- can submit Drafts;
- cannot see expected cost, vendor, margin, Finance settlement, or internal cost detail;
- cannot approve/reject;
- cannot bypass existing Order revision approval/lock rules.

### Admin / Super Admin

- full Change Order detail;
- create/edit/submit;
- approve/reject/cancel;
- manage explicit application linkage.

### Finance

- full read-only financial detail, including expected cost/vendor context where already permitted;
- no Project scope/order mutation rights are added by PB-7.

### Other roles / anon / Store / Portal

- default deny;
- no Store/Customer Portal/Dealer Portal Change Order projection in PB-7.

Implementation should reuse existing `projects.view`, `projects.manage`, `pricing.cost.view`, and role guards rather than widening unrelated roles. Approval remains Admin/Super Admin authoritative.

Because column-level privacy matters, browser code should consume guarded RPC projections instead of direct broad table SELECTs. Sales RPC rows return internal cost/vendor fields as NULL/omitted.

## 10. RPC boundary

Planned public guarded RPCs:

- `get_customer_project_change_orders(p_project_id)`
- `get_customer_project_change_order(p_change_order_id)`
- `create_customer_project_change_order(...)`
- `update_customer_project_change_order_draft(...)`
- `set_customer_project_change_order_lines(...)`
- `submit_customer_project_change_order(p_change_order_id)`
- `review_customer_project_change_order(p_change_order_id, p_decision, p_note)`
- `cancel_customer_project_change_order(p_change_order_id, p_reason)`
- `link_customer_project_change_order_revision(p_change_order_id, p_order_revision_id)`
- `get_customer_project_change_order_summary(p_project_id)`

Security requirements:

- revoke PUBLIC execute;
- no anon execute;
- authenticated execute only on guarded public wrappers;
- private helpers have PUBLIC execute revoked;
- tables have RLS enabled and no broad direct browser mutation path;
- every mutation validates Project/Order/customer linkage server-side.

## 11. Concurrency / idempotency / integrity

- DB-authoritative per-Project Change Order numbering under transaction lock/advisory lock;
- `SELECT ... FOR UPDATE` on state transitions;
- unique `(project_id, change_order_number)`;
- unique application link per `order_revision_id`;
- target Order and Order item must belong to the same Project/Order relationship;
- submitted lines immutable;
- approved history cannot be deleted or rewritten;
- mixed currencies fail closed for aggregated projected/reconciliation values;
- duplicate submit/review/application calls fail deterministically or return the already-current result without creating duplicate events.

## 12. Admin UI

Add **Change Orders** as a Project Detail tab.

### Tab summary

- counts by Draft / Submitted / Approved / Applied state;
- approved pending sell impact;
- expected-cost impact visible only to Admin/Finance/Super Admin;
- current canonical Project totals remain clearly labelled separately.

### List

Columns:

- Change Order #
- title
- status
- application status
- sell impact
- cost impact (privileged only)
- created/submitted/approved dates
- actions

### Detail/editor

- Draft header + line editor;
- target Order / optional Order item / optional Product;
- effect type;
- description;
- quantity delta;
- sell delta;
- internal expected-cost/vendor controls only for privileged users;
- Submit action;
- Admin review actions;
- approved application section with `Open Order` and explicit revision-linking UI.

Use existing shared Admin UI primitives and theme tokens.

## 13. Known workspace regression to restore while touching the tab file

Current `main` still renders `ProjectParticipantRoleManager` inside the Project `Participants & Commission` tab even though PB-6/#313 established that global role configuration belongs only in General Settings.

PB-7 changes the same Project workspace file. The implementation must preserve the accepted PB-6 boundary by removing that duplicate Project render while leaving the General Settings route intact. This is a regression restoration, not a new PB-7 feature.

## 14. Tracker update

`docs/PROJECT_BASE_PLAN.md` is stale on current `main` and still reports PB-5 active / PB-6 not started.

During implementation closeout:

- PB-5 -> complete;
- PB-6 -> complete, including gross-profit commission follow-up;
- PB-7 -> active, then complete only after code/CI + approved production acceptance;
- PB-8 remains not started.

## 15. Testing / acceptance

### TDD contract first

Before implementation, add a deterministic PB-7 contract covering:

- migration/admin mirror parity;
- required tables/RPCs;
- immutable submitted history;
- approval/application separation;
- no direct Order/Finance/Procurement mutation on approval;
- application link validation;
- role-aware sell vs cost visibility;
- no Store/Portal surface;
- Change Orders tab wiring;
- PB-6 Participant Role regression restoration.

### DB acceptance

After owner-approved merge/production gate:

1. schema/RLS/grant verification;
2. anon denied;
3. Sales sanitized projection;
4. Admin full projection;
5. create Draft + line smoke;
6. submit -> immutable line enforcement;
7. Sales approve denied;
8. Admin approve succeeds;
9. approval does not mutate Order totals/items/revisions;
10. unrelated Order/revision link fails;
11. valid post-approval revision link succeeds;
12. application reconciliation leaves no double count;
13. negative customer/vendor credit effects work as approved deltas;
14. mixed-currency aggregation fails closed;
15. rollback-only smoke leaves zero business-data residue;
16. Supabase Security + Performance Advisors checked.

### CI

- Admin Project Base contract;
- Admin UI Foundation strict gate;
- RBAC regression;
- TypeScript;
- lint;
- production build;
- Store Core regression to prove no Portal/Store widening.

## 16. Out of scope for PB-7

- Store/Portal Change Order visibility;
- automatic customer notifications;
- bypassing finalized/fulfilled Order revision locks;
- creating AP/AR/payment/refund ledgers;
- inventing FX conversion;
- automatic historical Change Order backfill;
- automatic rewrite of existing approved Orders on Change Order approval;
- PB-8 Portal projection.

## 17. Decision summary

PB-7 will be an auditable Project business-authorization layer with explicit application linkage to existing Order revisions. Approval never equals hidden mutation. Canonical Orders, Procurement, Invoice and Finance remain authoritative, while approved-but-unapplied effects are visible separately so Project totals are neither premature nor double-counted.
