# PB-7 Project Change Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auditable Project Change Order workflow that separates approval from canonical Order application, preserves existing Order/Procurement/Finance truth, and exposes a guarded Admin/Sales/Finance Project tab.

**Architecture:** PB-7 owns business authorization/history in dedicated Project Change Order tables and guarded RPCs. Approval never mutates Orders, Procurement, Invoices, or Finance; application is recorded only by linking an already-created canonical `customer_order_revisions` row. Project financial truth remains PB-2, while PB-7 reports approved-but-unapplied deltas separately to prevent double counting.

**Tech Stack:** PostgreSQL/Supabase SQL + RLS/RPC, Next.js/React/TypeScript, Supabase JS client, Node contract scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-05-pb7-project-change-orders-design.md`

## Global Constraints

- Approval and application are separate dimensions; approval MUST NOT call `update_customer_order` or mutate Order/Procurement/Finance/Invoice truth.
- `customer_order_revisions` remains canonical Order revision history.
- PB-3B Procurement continues to react only to canonical Order changes/revision activity.
- PB-2 remains canonical current Project financial summary; PB-7 pending impacts are separate informational values.
- Sales may see sell effects but never expected cost/vendor/internal margin detail.
- Admin/Super Admin may review/cancel/link applications; Finance is full-detail read-only.
- No Store/Portal projection in PB-7.
- Mixed currency fails closed; no FX conversion is introduced.
- Submitted/approved/rejected/cancelled commercial content is immutable; corrections are new Change Orders.
- RLS enabled; broad direct browser table mutation is not granted; public RPC wrappers are explicitly guarded.
- `ProjectParticipantRoleManager` must not render inside Project detail; General Settings remains canonical for role taxonomy.

---

### Task 1: Add the RED PB-7 contract and CI gate

**Files:**
- Create: `modulex-admin/scripts/project-pb7-change-orders-contract.mjs`
- Modify: `.github/workflows/admin-project-base.yml`

**Interfaces:**
- Consumes: design spec and existing PB-6/PB-5 contract conventions.
- Produces: deterministic contract `node scripts/project-pb7-change-orders-contract.mjs` that is RED before implementation and GREEN only when DB/client/UI boundaries exist.

- [ ] **Step 1: Write the failing contract**

The contract must assert exact implementation boundaries, including these required paths/tokens:

```js
const migrationPath = "../modulex-store/supabase/migrations/20260905100000_customer_project_change_orders.sql";
const sqlPath = "sql/project-pb7-change-orders.sql";
const domainPath = "src/lib/customers/project-change-orders-domain.ts";
const componentPath = "src/components/customers/project-detail/ProjectChangeOrdersTab.tsx";
const workspacePath = "src/components/customers/ProjectDetailWorkspace.tsx";

for (const token of [
  "customer_project_change_orders",
  "customer_project_change_order_lines",
  "customer_project_change_order_events",
  "customer_project_change_order_applications",
  "get_customer_project_change_orders",
  "get_customer_project_change_order",
  "create_customer_project_change_order",
  "update_customer_project_change_order_draft",
  "set_customer_project_change_order_lines",
  "submit_customer_project_change_order",
  "review_customer_project_change_order",
  "cancel_customer_project_change_order",
  "link_customer_project_change_order_revision",
  "get_customer_project_change_order_summary",
]) assert.match(dbSql, new RegExp(token, "i"));

assert.match(dbSql, /approved[\s\S]*application/i);
assert.doesNotMatch(reviewFunction, /update_customer_order|customer_order_items|finance_transactions|procurement_commitments/i);
assert.match(dbSql, /order_revision_id[\s\S]*unique/i);
assert.match(dbSql, /FOR UPDATE|for update/i);
assert.match(dbSql, /pg_advisory_xact_lock/i);
assert.match(dbSql, /revoke\s+all[\s\S]*from\s+public/i);
assert.doesNotMatch(dbSql, /grant\s+.*\s+to\s+anon/i);
assert.match(domain, /get_customer_project_change_orders/);
assert.match(component, /Approved pending application/i);
assert.match(workspace, /Change Orders/);
assert.doesNotMatch(workspace, /<ProjectParticipantRoleManager/);
```

Also assert migration/Admin SQL mirror byte parity, lifecycle states, append-only event/application guards, Sales cost sanitization, canonical revision linkage, mixed-currency fail-closed behavior, and no Store/Portal files referenced.

- [ ] **Step 2: Add the contract to Admin Project Base CI**

Append:

```yaml
      - name: Project PB-7 Change Orders contract
        run: node scripts/project-pb7-change-orders-contract.mjs
```

- [ ] **Step 3: Run RED verification**

Run from `modulex-admin`:

```bash
node scripts/project-pb7-change-orders-contract.mjs
```

Expected: FAIL because `20260905100000_customer_project_change_orders.sql` and PB-7 client/UI files do not exist yet.

- [ ] **Step 4: Commit the RED gate**

```bash
git add modulex-admin/scripts/project-pb7-change-orders-contract.mjs .github/workflows/admin-project-base.yml
git commit -m "test: add PB-7 change order contract"
```

---

### Task 2: Implement the canonical PB-7 database boundary

**Files:**
- Create: `modulex-store/supabase/migrations/20260905100000_customer_project_change_orders.sql`
- Create: `modulex-admin/sql/project-pb7-change-orders.sql`

**Interfaces:**
- Consumes: `customer_projects`, `customer_orders`, `customer_order_items`, `customer_order_revisions`, `profiles`, `public.current_user_has_any_role(...)`.
- Produces: four PB-7 tables plus guarded public RPCs listed in the design spec.

- [ ] **Step 1: Define the four tables and integrity constraints**

Create:

```sql
public.customer_project_change_orders
public.customer_project_change_order_lines
public.customer_project_change_order_events
public.customer_project_change_order_applications
```

Required constraints include:

```sql
unique (project_id, change_order_number)
check (status in ('draft','submitted','approved','rejected','cancelled'))
check (effect_type in ('add_scope','remove_scope','quantity_change','price_adjustment','customer_credit','vendor_credit','other'))
unique (order_revision_id)
```

Use foreign keys to canonical Project/Order/Order Item/Product/Profile/Revision rows. Store three-character uppercase currency codes with checks.

- [ ] **Step 2: Add immutable-history guards**

Implement private triggers with these semantics:

```sql
-- Header commercial content can change only while OLD.status = 'draft'.
if old.status <> 'draft' and (
  new.title is distinct from old.title or
  new.reason is distinct from old.reason or
  new.correction_of_change_order_id is distinct from old.correction_of_change_order_id
) then
  raise exception 'PROJECT_CHANGE_ORDER_IMMUTABLE';
end if;

-- Lines can INSERT/UPDATE/DELETE only when parent status = 'draft'.
-- Events and application links reject UPDATE/DELETE unconditionally.
```

- [ ] **Step 3: Add guarded helper predicates and numbering**

Use role helpers:

```sql
private.can_view_customer_project_change_orders()
private.can_manage_customer_project_change_orders()
private.can_review_customer_project_change_orders()
private.can_view_customer_project_change_order_cost()
```

Role policy:

```text
view: super_admin, admin, sales, finance
manage draft/submit: super_admin, admin, sales
review/cancel/link: super_admin, admin
cost/vendor visibility: super_admin, admin, finance
```

Numbering must use:

```sql
perform pg_advisory_xact_lock(hashtextextended('customer_project_change_order:' || p_project_id::text, 0));
select coalesce(max(change_order_number), 0) + 1 ...;
```

- [ ] **Step 4: Implement Draft create/update/line replacement RPCs**

Public wrappers:

```sql
create_customer_project_change_order(
  p_project_id uuid,
  p_title text,
  p_reason text default null,
  p_correction_of_change_order_id uuid default null
) returns uuid

update_customer_project_change_order_draft(
  p_change_order_id uuid,
  p_title text,
  p_reason text default null,
  p_correction_of_change_order_id uuid default null
) returns void

set_customer_project_change_order_lines(
  p_change_order_id uuid,
  p_lines jsonb
) returns integer
```

`set...lines` validates every target Order belongs to the same Project; an Order Item belongs to the supplied target Order; Product exists; cost currency is present iff expected cost is present; descriptions are non-empty. It replaces all draft lines transactionally and numbers them by input order.

- [ ] **Step 5: Implement submit/review/cancel lifecycle RPCs with row locks and idempotency**

Required lifecycle:

```text
draft -> submitted
submitted -> approved | rejected
admin: draft/submitted -> cancelled
```

Every transition uses `SELECT ... FOR UPDATE`. Repeat calls that request the already-current state return the current state without appending duplicate events; illegal transitions fail deterministically.

`review_customer_project_change_order` must contain no Order/Finance/Procurement mutation. It only updates PB-7 status/reviewer metadata and appends a PB-7 event.

- [ ] **Step 6: Implement canonical revision-link application RPC**

```sql
link_customer_project_change_order_revision(
  p_change_order_id uuid,
  p_order_revision_id uuid
) returns uuid
```

Validate:

```text
Change Order status = approved
revision.order_id belongs to same Project
revision.created_at >= Change Order reviewed_at
if PB-7 lines target one or more Orders, linked revision Order must be one of them
revision is not already linked anywhere
```

Derive canonical pre-tax sell delta from the revision's before snapshot and the next revision snapshot/current Order state:

```text
net_sales = subtotal - discount_amount
canonical_sell_delta = after_net_sales - before_net_sales
```

Currency before/after must match. Insert immutable application row and append `application_linked` event. Do not write canonical Order tables.

- [ ] **Step 7: Implement role-sanitized read/summary RPCs**

Return JSON projections:

```sql
get_customer_project_change_orders(p_project_id uuid) returns jsonb
get_customer_project_change_order(p_change_order_id uuid) returns jsonb
get_customer_project_change_order_summary(p_project_id uuid) returns jsonb
```

For Sales, project sell fields remain visible but these return NULL:

```text
expected_cost_delta
cost_currency_code
vendor_code
pending_expected_cost_impact
```

Derived application state for approved rows:

```text
pending: zero application links
partial: links exist but sell delta does not reconcile, or currency is incompatible
applied: linked sell delta reconciles to approved sell delta within 0.01 in one currency
```

Zero-sell approved Change Orders require at least one valid linked revision before `applied`.

Summary returns canonical financial values only by calling/embedding the existing PB-2 summary for privileged users where appropriate, plus separate PB-7 pending impacts; it must never add pending impacts into canonical totals.

- [ ] **Step 8: Lock down privileges/RLS and mirror SQL**

Enable RLS on all four tables. Revoke broad direct access from PUBLIC/anon/authenticated. Revoke PUBLIC execute from private helpers. Grant `authenticated` execute only on guarded public wrappers. Do not grant anon.

Copy the canonical migration byte-for-byte to:

```text
modulex-admin/sql/project-pb7-change-orders.sql
```

- [ ] **Step 9: Run contract to reach DB GREEN**

```bash
cd modulex-admin
node scripts/project-pb7-change-orders-contract.mjs
```

Expected: still FAIL only on missing client/UI wiring, not on migration/schema assertions.

- [ ] **Step 10: Commit DB boundary**

```bash
git add modulex-store/supabase/migrations/20260905100000_customer_project_change_orders.sql modulex-admin/sql/project-pb7-change-orders.sql
git commit -m "feat(project): add PB-7 change order ledger"
```

---

### Task 3: Add the typed client domain

**Files:**
- Create: `modulex-admin/src/lib/customers/project-change-orders-domain.ts`

**Interfaces:**
- Consumes: PB-7 public RPCs.
- Produces exported TypeScript types/functions used only by the Project Admin workspace.

- [ ] **Step 1: Define stable UI-facing types**

```ts
export type ProjectChangeOrderStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";
export type ProjectChangeOrderApplicationStatus = "not_applicable" | "pending" | "partial" | "applied";
export type ProjectChangeOrderEffectType = "add_scope" | "remove_scope" | "quantity_change" | "price_adjustment" | "customer_credit" | "vendor_credit" | "other";

export type ProjectChangeOrderLineInput = {
  effectType: ProjectChangeOrderEffectType;
  targetOrderId: string | null;
  targetOrderItemId: string | null;
  productId: string | null;
  description: string;
  quantityDelta: number | null;
  sellAmountDelta: number;
  sellCurrencyCode: string;
  expectedCostDelta: number | null;
  costCurrencyCode: string | null;
  vendorCode: string | null;
};
```

Define list/detail/summary/application/event shapes matching the guarded JSON RPC projections.

- [ ] **Step 2: Add RPC wrappers**

Export:

```ts
getCustomerProjectChangeOrders(projectId)
getCustomerProjectChangeOrder(changeOrderId)
getCustomerProjectChangeOrderSummary(projectId)
createCustomerProjectChangeOrder(input)
updateCustomerProjectChangeOrderDraft(input)
setCustomerProjectChangeOrderLines(changeOrderId, lines)
submitCustomerProjectChangeOrder(changeOrderId)
reviewCustomerProjectChangeOrder(changeOrderId, decision, note)
cancelCustomerProjectChangeOrder(changeOrderId, reason)
linkCustomerProjectChangeOrderRevision(changeOrderId, orderRevisionId)
```

Every wrapper checks Supabase errors and normalizes nullable/number fields without reintroducing internal cost fields that the RPC omitted.

- [ ] **Step 3: Run TypeScript/lint-focused verification**

```bash
cd modulex-admin
npx tsc --noEmit
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit client domain**

```bash
git add modulex-admin/src/lib/customers/project-change-orders-domain.ts
git commit -m "feat(project): add change order client domain"
```

---

### Task 4: Build the Project Change Orders Admin tab

**Files:**
- Create: `modulex-admin/src/components/customers/project-detail/ProjectChangeOrdersTab.tsx`
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`

**Interfaces:**
- Consumes: Task 3 domain functions, current Project Orders, current user profile/permissions.
- Produces: Project-level Change Orders tab with summary, list, Draft editor, review actions, and explicit canonical revision linking.

- [ ] **Step 1: Create the tab shell and role-aware load path**

Component props:

```ts
export type ProjectChangeOrdersTabProps = {
  projectId: string;
  customerId: string;
  canManage: boolean;
  canReview: boolean;
  canViewCost: boolean;
};
```

Load list + summary. Render canonical Project totals separately from:

```text
Approved pending application — sell impact
Approved pending application — expected cost impact
```

Cost cards/columns only render when `canViewCost`.

- [ ] **Step 2: Add list/detail interaction**

List columns:

```text
Change Order # | Title | Status | Application | Sell impact | Cost impact* | Dates | Actions
```

`*` privileged only.

Opening a row loads detail via `getCustomerProjectChangeOrder` and shows append-only lifecycle/application history.

- [ ] **Step 3: Add Draft create/edit/line editor**

Use existing `ComponentCard`, `Input`, `Select`, `Button`, `Table`, `Alert`, `Badge`, and admin theme tokens. Draft line editor supports all seven effect types and target Order/Order Item/Product IDs already returned by guarded detail/options data. Sales UI must not render cost/vendor inputs.

Submission calls `submitCustomerProjectChangeOrder` only after the draft has at least one line.

- [ ] **Step 4: Add Admin review/cancel/application controls**

For `canReview` users:

```text
Approve
Reject
Cancel
Link canonical Order revision
```

Approval copy must explicitly state that approval does not update the Order. The application section provides `Open Order` and a revision selector/input sourced from canonical `customer_order_revisions` for Project Orders, then calls the guarded link RPC.

- [ ] **Step 5: Wire the Project workspace tab and restore PB-6 boundary**

Modify the tab list:

```ts
const PROJECT_TABS = [
  "Overview",
  "Orders",
  "Finance",
  "Participants & Commission",
  "Change Orders",
  "Procurement",
  "Fulfillment",
  "Calendar",
  "Documents",
  "Activity",
] as const;
```

Compute PB-7 access from existing roles:

```ts
const canViewChangeOrders = profile.roles.some((role) => ["super_admin", "admin", "sales", "finance"].includes(role));
const canManageChangeOrders = profile.roles.some((role) => ["super_admin", "admin", "sales"].includes(role));
const canReviewChangeOrders = profile.roles.some((role) => ["super_admin", "admin"].includes(role));
const canViewChangeOrderCost = profile.roles.some((role) => ["super_admin", "admin", "finance"].includes(role));
```

Remove the Project workspace import/render of:

```tsx
ProjectParticipantRoleManager
```

Keep `ProjectParticipantsCommissionPanel`; global participant-role configuration stays in General Settings.

- [ ] **Step 6: Run UI and contract verification**

```bash
cd modulex-admin
node scripts/project-pb7-change-orders-contract.mjs
npx tsc --noEmit
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit UI**

```bash
git add modulex-admin/src/components/customers/project-detail/ProjectChangeOrdersTab.tsx modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx
git commit -m "feat(project): add Change Orders workspace"
```

---

### Task 5: Add acceptance coverage and tracker closeout

**Files:**
- Create: `docs/acceptance/pb-7-project-change-orders.md`
- Modify: `docs/PROJECT_BASE_PLAN.md`

**Interfaces:**
- Consumes: completed DB/client/UI implementation.
- Produces: reproducible production acceptance checklist and accurate Project Base tracker.

- [ ] **Step 1: Write PB-7 acceptance document**

Document the exact production smoke sequence:

```text
1. schema/RLS/grants present
2. anon denied
3. Sales projection has sell values and NULL internal cost/vendor
4. Admin projection has full detail
5. create Draft + lines
6. submit and prove line/header commercial immutability
7. Sales review denied
8. Admin approve succeeds
9. compare Order totals/items/revision count before vs after approval: unchanged
10. unrelated revision link rejected
11. valid post-approval revision link accepted
12. application state reconciles pending/partial/applied without adding to PB-2 canonical totals
13. negative credit deltas accepted
14. mixed currency fails closed
15. rollback-only smoke leaves no business-data residue
16. Security Advisor and Performance Advisor checked
```

- [ ] **Step 2: Update Project Base tracker**

Set:

```text
PB-5: complete
PB-6: complete (including gross-profit commission follow-up)
PB-7: implemented / awaiting merge + production acceptance
PB-8: not started
```

Only mark PB-7 `complete` after production migration and acceptance are verified.

- [ ] **Step 3: Commit docs/tracker**

```bash
git add docs/acceptance/pb-7-project-change-orders.md docs/PROJECT_BASE_PLAN.md
git commit -m "docs: add PB-7 acceptance plan"
```

---

### Task 6: Full verification and PR

**Files:**
- Verify all files above; no new source files required unless a failing gate exposes a real defect.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: reviewable PB-7 PR with fresh passing evidence.

- [ ] **Step 1: Run deterministic local/CI-equivalent checks**

```bash
cd modulex-admin
node scripts/project-base-contract.mjs
node scripts/project-pb6-participants-commission-contract.mjs
node scripts/project-pb6-tab-access-percentage-basis-contract.mjs
node scripts/project-pb6-gross-profit-commission-contract.mjs
node scripts/project-pb7-change-orders-contract.mjs
npx tsc --noEmit
npm run lint
npm run build
```

From Store, run the existing Store Core command used by CI.

- [ ] **Step 2: Inspect branch diff for scope leakage**

Verify there are no Store/Portal PB-7 projections, no new payment/AP/AR ledger, and no direct PB-7 approval mutation of canonical Order/Procurement/Finance tables.

- [ ] **Step 3: Open PR**

Title:

```text
feat(project): add PB-7 change orders
```

PR body must call out:

```text
- approval/application separation
- canonical Order revision linkage
- Sales cost sanitization
- no Store/Portal widening
- PB-6 Participant Role Manager regression restoration
- production migration intentionally deferred until merge/owner gate
```

- [ ] **Step 4: Verify GitHub Actions on final head**

Required green gates:

```text
Admin Project Base
Admin UI Foundation
Store Core CI
```

Do not claim completion while any required check is pending/failing.

- [ ] **Step 5: Production gate after owner merge approval**

Apply the canonical Supabase migration with `apply_migration`, never ad-hoc DDL via `execute_sql`, then execute the acceptance document in a rollback-safe transaction where possible. Check Supabase Security + Performance Advisors. Only then update PB-7 tracker to `complete` in a follow-up if the tracker was intentionally left at awaiting-production state.
