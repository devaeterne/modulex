# PB-3B Project Procurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Project Procurement so confirmed Project Orders automatically create purchasable demand, Admin can place and receive vendor commitments, Admin/Finance can attach shared vendor invoices with Project-specific invoice cost, and Sales sees status only.

**Architecture:** Keep Customer Orders as demand truth and create a separate append-safe procurement domain for vendor commitments, delivery events, and vendor invoice allocations. Derive configured Countertop Stone quantity from `countertop_configurations.slab_quantity` and configured Sink as a separate component. Synchronization is DB-authoritative and idempotent; no procurement action writes inventory, and vendor payment state remains Finance/PB-4 scope.

**Tech Stack:** PostgreSQL/Supabase migrations + RPCs/RLS, Next.js 16 / React / TypeScript, Supabase JS client, Modulex shared Admin UI primitives, Node contract scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-pb-3b-project-procurement-design.md`

## Global Constraints

- Work from execution-time current `main`; re-check open PRs immediately before implementation and preserve parallel Vendor Catalog/Stone work.
- Use an isolated worktree/branch for execution; the current design branch is `feat/project-procurement-pb3b`.
- `customer_orders` and `customer_order_items` remain canonical Order truth.
- Draft Orders create no procurement demand; Project-linked confirmed Orders do.
- Standalone Orders with `project_id = null` remain valid and create no Project Procurement.
- Configured Countertop Stone quantity is `countertop_configurations.slab_quantity`, never sqft/commercial Order quantity.
- Configured Countertop Sink is a separate procurement component with current canonical quantity `1` when present.
- `SERVICE` lines do not create procurement requirements.
- Existing vendor commitments are historical truth and must not be silently rewritten by later Order revisions.
- Vendor resolution order is approved canonical Vendor Catalog link, then product metadata, then `Vendor Required`.
- Missing vendor never fabricates a vendor; missing cost never becomes `0`; missing quantity never fabricates a quantity.
- `Vendor Order / PO No` is required when placing a commitment.
- Delivery is procurement receipt truth only and must create zero `inventory_movements`.
- Vendor Invoice is vendor-scoped canonical truth and may span many Projects; Project shows only its allocated invoice cost.
- No `Paid / Unpaid / Due / Payment Date / Payment Method` fields in Project Procurement.
- No FX conversion is invented; currency mismatch fails closed.
- PB-2 profitability remains unchanged in PB-3B.
- Sales receives only sanitized operational status; vendor cost and invoice amounts remain denied.
- No Store/Customer Portal/Dealer Portal procurement projection is added.
- Public RPC wrappers stay `SECURITY INVOKER`; private mutation/read cores may use `SECURITY DEFINER` only with explicit role guards and pinned search paths.
- Direct anon/authenticated table access is denied; RLS/grants are part of acceptance.
- Use shared Admin primitives from `ADMIN_UI_GUIDE.md`; changed UI files must pass `npm run smoke:admin-ui-strict`.
- Normalize text, currency, numeric and date inputs according to `ADMIN_VALIDATION_GUIDE.md`; browser validation is not authoritative.
- Do not permanently apply the production migration before merge. Pre-merge production checks are read-only. After project-owner merge, apply migrations, run rollback-only mutation acceptance, Advisors, deploy acceptance, then close the package.

---

### Task 1: Establish PB-3B RED contract and active tracking

**Files:**
- Create: `modulex-admin/scripts/project-procurement-contract.mjs`
- Modify: `.github/workflows/admin-project-base.yml`
- Modify: `docs/PROJECT_BASE_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Consumes: approved PB-3B spec.
- Produces: one deterministic contract script used throughout the package and CI entry `Project Procurement contract`.

- [ ] **Step 1: Re-check execution-time baseline and parallel work**

Run:

```bash
git fetch origin main
git rev-parse origin/main
gh pr list --state open --limit 50
```

Expected: record the current main SHA in the implementation notes. If main moved after the design baseline, rebase/merge current main into the isolated branch before touching implementation files. Do not overwrite unrelated vendor work.

- [ ] **Step 2: Write the initial failing contract**

Create `modulex-admin/scripts/project-procurement-contract.mjs` with a minimal RED gate that requires the planned migration, adapter, component and permissions:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const coreMigration = "modulex-store/supabase/migrations/20260904102000_customer_project_procurement_core.sql";
const syncMigration = "modulex-store/supabase/migrations/20260904102500_customer_project_procurement_order_sync.sql";
const operationsMigration = "modulex-store/supabase/migrations/20260904103000_customer_project_procurement_operations.sql";
const adapter = "modulex-admin/src/lib/customers/project-procurement.ts";
const component = "modulex-admin/src/components/customers/project-detail/ProjectProcurementTab.tsx";
const permissions = "modulex-admin/src/lib/auth/permissions.ts";

assert.equal(exists(coreMigration), true, "PB-3B core migration must exist");
assert.equal(exists(syncMigration), true, "PB-3B order sync migration must exist");
assert.equal(exists(operationsMigration), true, "PB-3B operations migration must exist");
assert.equal(exists(adapter), true, "Project procurement adapter must exist");
assert.equal(exists(component), true, "Project procurement tab must exist");

const permissionSource = read(permissions);
assert.match(permissionSource, /project_procurement\.view/);
assert.match(permissionSource, /project_procurement\.manage/);

console.log("Project Procurement contract passed.");
```

- [ ] **Step 3: Run the contract and verify RED**

Run:

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
```

Expected: FAIL on the first missing PB-3B migration.

- [ ] **Step 4: Wire the contract into Project Base CI**

Add after the existing Finance simple-flow check in `.github/workflows/admin-project-base.yml`:

```yaml
      - name: Project Procurement contract
        run: node scripts/project-procurement-contract.mjs
```

- [ ] **Step 5: Mark PB-3B active in both trackers**

In `docs/PROJECT_BASE_PLAN.md`, change `PB-3B — Procurement [ ]` to `[~]` and record the approved boundaries: confirmed-order sync, no inventory movement, shared vendor invoice, Project-specific invoice cost, Finance owns payment.

In `modulex-admin/ADMIN_ROADMAP.md`, add/update a Project Base PB-3B row as `[~]` and point to the design/plan paths. Do not mark complete.

- [ ] **Step 6: Commit the RED gate**

```bash
git add .github/workflows/admin-project-base.yml \
  modulex-admin/scripts/project-procurement-contract.mjs \
  docs/PROJECT_BASE_PLAN.md \
  modulex-admin/ADMIN_ROADMAP.md
git commit -m "test: define PB-3B procurement contract"
```

---

### Task 2: Add canonical procurement schema, component derivation, and idempotent demand sync

**Files:**
- Create: `modulex-store/supabase/migrations/20260904102000_customer_project_procurement_core.sql`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Produces tables:
  - `public.customer_project_procurement_requirements`
  - `public.customer_project_procurement_commitments`
  - `public.customer_project_procurement_delivery_events`
  - `public.vendor_invoices`
  - `public.customer_project_procurement_invoice_allocations`
  - `public.customer_project_procurement_events`
- Produces private functions:
  - `private.get_customer_order_procurement_components(p_order_id uuid)`
  - `private.resolve_customer_project_procurement_vendor(p_product_id uuid)`
  - `private.get_customer_project_procurement_cost(p_product_id uuid)`
  - `private.sync_customer_order_procurement(p_order_id uuid)`
- Later tasks consume these exact names.

- [ ] **Step 1: Extend the contract with core-schema RED assertions**

Add assertions for these exact tokens:

```js
const core = read(coreMigration);
for (const token of [
  "customer_project_procurement_requirements",
  "customer_project_procurement_commitments",
  "customer_project_procurement_delivery_events",
  "vendor_invoices",
  "customer_project_procurement_invoice_allocations",
  "customer_project_procurement_events",
  "get_customer_order_procurement_components",
  "resolve_customer_project_procurement_vendor",
  "get_customer_project_procurement_cost",
  "sync_customer_order_procurement",
  "countertop_stone",
  "countertop_sink",
]) assert.match(core, new RegExp(token));

assert.match(core, /slab_quantity/);
assert.match(core, /source_kind/);
assert.match(core, /is_current/);
```

Run the contract; expected FAIL because the migration is not present.

- [ ] **Step 2: Create the requirement table with current-demand identity**

Use `numeric(18,4)` for quantities/money and `varchar(3)` for currency codes. The requirement table must include:

```sql
create table public.customer_project_procurement_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  order_item_id uuid not null references public.customer_order_items(id) on delete restrict,
  source_kind text not null check (source_kind in ('order_item','countertop_stone','countertop_sink')),
  configuration_id uuid null references public.countertop_configurations(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  required_quantity numeric(18,4) null check (required_quantity is null or required_quantity > 0),
  vendor_code text null,
  vendor_name_snapshot text null,
  vendor_source text not null default 'unresolved'
    check (vendor_source in ('catalog','metadata','manual','unresolved')),
  expected_unit_cost numeric(18,4) null check (expected_unit_cost is null or expected_unit_cost >= 0),
  expected_cost_currency varchar(3) null,
  is_current boolean not null default true,
  retired_reason text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customer_project_procurement_requirement_current_source_uidx
  on public.customer_project_procurement_requirements(order_item_id, source_kind)
  where is_current;
```

The `is_current` model is required so a committed historical product can be retained while a later source/product change creates a new current requirement.

- [ ] **Step 3: Create commitment, delivery, invoice, allocation, and event tables**

Use these business constraints:

```sql
-- commitment
ordered_quantity numeric(18,4) not null check (ordered_quantity > 0)
agreed_unit_cost numeric(18,4) not null check (agreed_unit_cost >= 0)
currency_code varchar(3) not null
vendor_order_no text not null check (btrim(vendor_order_no) <> '')
status text not null check (status in ('ordered','confirmed','cancelled'))

-- delivery event: append-safe signed delta
quantity_delta numeric(18,4) not null check (quantity_delta <> 0)
event_type text not null check (event_type in ('delivery','correction'))
correction_of_event_id uuid null
reason text null

-- vendor invoice
vendor_code text not null
invoice_number text not null
invoice_number_key text not null
invoice_date date not null
total_amount numeric(18,4) not null check (total_amount > 0)
currency_code varchar(3) not null
unique(vendor_code, invoice_number_key)

-- invoice allocation: append-safe signed delta
quantity_delta numeric(18,4) not null check (quantity_delta <> 0)
amount_delta numeric(18,4) not null check (amount_delta <> 0)
reversal_of_allocation_id uuid null
reason text null
```

`customer_project_procurement_events` is immutable append-only audit for vendor override, commitment confirm/cancel and other stateful corrections. Store `event_type`, relevant entity IDs, `before_snapshot`, `after_snapshot`, `reason`, `actor_id`, `created_at`.

- [ ] **Step 4: Implement purchasable-component derivation**

`private.get_customer_order_procurement_components` must return ordinary physical lines plus configured Countertop components with no duplication:

```sql
-- ordinary physical lines: exclude SERVICE and any configured countertop line
select
  oi.id as order_item_id,
  'order_item'::text as source_kind,
  null::uuid as configuration_id,
  oi.product_id,
  oi.quantity::numeric(18,4) as required_quantity
from public.customer_order_items oi
join public.products p on p.id = oi.product_id
join public.product_types pt on pt.id = p.product_type_id
left join public.countertop_configurations cc on cc.order_item_id = oi.id
where oi.order_id = p_order_id
  and pt.code <> 'SERVICE'
  and cc.id is null

union all

select
  cc.order_item_id,
  'countertop_stone'::text,
  cc.id,
  cc.stone_product_id,
  case when cc.slab_quantity > 0 then cc.slab_quantity::numeric(18,4) else null end
from public.countertop_configurations cc
where cc.order_id = p_order_id

union all

select
  cc.order_item_id,
  'countertop_sink'::text,
  cc.id,
  cc.sink_product_id,
  1::numeric(18,4)
from public.countertop_configurations cc
where cc.order_id = p_order_id
  and cc.sink_product_id is not null;
```

This is the contract that prevents 55 sqft from becoming 55 Stone units.

- [ ] **Step 5: Implement deterministic vendor resolution**

Resolver rules:

1. Collect distinct non-empty `vendor_catalog_items.vendor_code` rows where `canonical_product_id = p_product_id` and `review_status = 'APPROVED'`.
2. If exactly one distinct code exists, return it with display name from product metadata `vendor_name`, Stone profile `vendor_name`, or humanized code.
3. If catalog result is absent, use `products.metadata->>'vendor_code'` with the same display-name fallback.
4. If catalog has conflicting vendor codes, fail safe to unresolved instead of picking one.
5. Normalize stored code with `lower(btrim(...))`.

Return columns `(vendor_code text, vendor_name text, vendor_source text)`.

- [ ] **Step 6: Implement current product-cost lookup**

Match PB-2 current-cost semantics: active cost, `valid_from <= now()`, `valid_to is null or valid_to > now()`, newest `valid_from/created_at` wins. Return `(amount numeric, currency_code varchar)` or no row. Never coalesce missing cost to zero.

- [ ] **Step 7: Implement idempotent sync**

`private.sync_customer_order_procurement(p_order_id uuid)` must:

```text
lock Order
if Order missing -> raise
if project_id is null -> return 0
if status = draft -> return 0
if status = cancelled -> return 0
derive desired components
for each desired order_item/source_kind:
  if current requirement exists and has no commitments:
    refresh product, qty, vendor (preserve manual vendor only if product unchanged), expected cost
  if current requirement exists and product unchanged with commitments:
    refresh current required qty only; preserve commitment history
  if current requirement exists and product changed with commitments:
    mark old requirement is_current=false, retired_reason='source_product_changed'
    create new current requirement for the new product
  if no current requirement:
    create it
for each current requirement no longer present in desired components:
  set is_current=false, retired_reason='source_removed'
return count of current requirements
```

Use a per-order transaction advisory lock so repeated/parallel sync cannot duplicate current rows.

- [ ] **Step 8: Enable RLS immediately on new tables**

Core migration must `enable row level security` on every new public table. Direct grants are added in Task 4; enabling RLS at creation prevents a permissive intermediate schema.

- [ ] **Step 9: Run the contract**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
```

Expected: core assertions pass; contract still fails on the not-yet-created sync/operations files.

- [ ] **Step 10: Commit**

```bash
git add modulex-store/supabase/migrations/20260904102000_customer_project_procurement_core.sql \
  modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project procurement core model"
```

---

### Task 3: Connect procurement sync to canonical Order lifecycle without browser coupling

**Files:**
- Create: `modulex-store/supabase/migrations/20260904102500_customer_project_procurement_order_sync.sql`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Consumes: `private.sync_customer_order_procurement(uuid)`.
- Produces trigger functions that call sync after confirmed status/project assignment and after completed confirmed-order revision activity.

- [ ] **Step 1: Add RED assertions for DB-authoritative hooks**

Add:

```js
const sync = read(syncMigration);
assert.match(sync, /customer_orders/);
assert.match(sync, /project_id/);
assert.match(sync, /confirmed/);
assert.match(sync, /customer_activity/);
assert.match(sync, /order_revised/);
assert.match(sync, /sync_customer_order_procurement/);
```

Run contract; expected FAIL because sync migration does not exist.

- [ ] **Step 2: Add an AFTER UPDATE Order hook**

Create a trigger function that calls sync only when the order is Project-linked and either:

- status transitions to `confirmed`; or
- `project_id` changes from null/another value to the current Project while status is already non-Draft/non-cancelled.

Use logic equivalent to:

```sql
if new.project_id is not null and (
  (new.status = 'confirmed' and old.status is distinct from new.status)
  or
  (new.project_id is distinct from old.project_id and new.status not in ('draft','cancelled'))
) then
  perform private.sync_customer_order_procurement(new.id);
end if;
```

This also covers `create_project_customer_order(... p_initial_status => 'confirmed')` because that function sets `project_id` only after the canonical Order/items are created.

- [ ] **Step 3: Add a confirmed-revision completion hook**

The existing canonical Order update core inserts `customer_activity.activity_type = 'order_revised'` at the end of a successful revision. Add an AFTER INSERT trigger on `public.customer_activity` that:

```sql
if new.activity_type = 'order_revised'
   and nullif(new.metadata->>'order_id','') is not null then
  v_order_id := (new.metadata->>'order_id')::uuid;
  if exists (
    select 1 from public.customer_orders o
    where o.id = v_order_id
      and o.project_id is not null
      and o.status not in ('draft','cancelled')
  ) then
    perform private.sync_customer_order_procurement(v_order_id);
  end if;
end if;
```

Do not hook draft Countertop configurator functions: current production `attach_countertop_configuration`, `create_and_attach_countertop_order_item`, and `remove_countertop_order_item` explicitly reject non-Draft Orders, so confirmed procurement truth is created only after configuration is stable.

- [ ] **Step 4: Keep sync side-effect free with respect to customer activity and inventory**

The sync function must not insert `customer_activity`, and neither lifecycle trigger may insert or call any `inventory_movements` function. This prevents recursive activity triggers and preserves the approved no-stock boundary.

- [ ] **Step 5: Run contract**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
```

Expected: sync-hook assertions pass; operations/adapter/UI assertions remain RED.

- [ ] **Step 6: Commit**

```bash
git add modulex-store/supabase/migrations/20260904102500_customer_project_procurement_order_sync.sql \
  modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: sync procurement from confirmed Orders"
```

---

### Task 4: Add procurement operations, shared vendor invoice behavior, append-safe corrections, and authorization

**Files:**
- Create: `modulex-store/supabase/migrations/20260904103000_customer_project_procurement_operations.sql`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Public reads:
  - `get_customer_project_procurement(p_project_id uuid) returns jsonb`
  - `get_customer_project_procurement_status(p_project_id uuid) returns jsonb`
- Public mutations:
  - `set_customer_project_procurement_vendor(p_requirement_id uuid, p_vendor_code text, p_vendor_name text) returns uuid`
  - `create_customer_project_procurement_commitment(p_requirement_id uuid, p_ordered_quantity numeric, p_agreed_unit_cost numeric, p_currency_code text, p_vendor_order_no text) returns uuid`
  - `confirm_customer_project_procurement_commitment(p_commitment_id uuid) returns uuid`
  - `cancel_customer_project_procurement_commitment(p_commitment_id uuid, p_reason text) returns uuid`
  - `record_customer_project_procurement_delivery(p_commitment_id uuid, p_quantity numeric, p_delivered_date date, p_notes text) returns uuid`
  - `correct_customer_project_procurement_delivery(p_delivery_event_id uuid, p_quantity numeric, p_reason text) returns uuid`
  - `record_customer_project_procurement_invoice(p_commitment_id uuid, p_invoice_number text, p_invoice_date date, p_invoice_total numeric, p_currency_code text, p_invoiced_quantity numeric, p_project_invoice_cost numeric) returns uuid`
  - `reverse_customer_project_procurement_invoice_allocation(p_allocation_id uuid, p_reason text) returns uuid`

- [ ] **Step 1: Extend contract with operation/security RED assertions**

Require all RPC names above plus these security tokens:

```js
const ops = read(operationsMigration);
for (const token of [
  "get_customer_project_procurement",
  "get_customer_project_procurement_status",
  "set_customer_project_procurement_vendor",
  "create_customer_project_procurement_commitment",
  "record_customer_project_procurement_delivery",
  "record_customer_project_procurement_invoice",
  "reverse_customer_project_procurement_invoice_allocation",
  "42501",
  "security definer",
  "revoke",
  "authenticated",
]) assert.match(ops.toLowerCase(), new RegExp(token.toLowerCase()));
assert.doesNotMatch(ops, /insert\s+into\s+public\.inventory_movements/i);
```

Run contract; expected FAIL because operations migration does not exist.

- [ ] **Step 2: Implement detailed and Sales-safe read cores**

Detailed read is Admin/Finance only. It returns JSON shaped as:

```json
{
  "project_id": "uuid",
  "requirements": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "order_number": "SO-...",
      "order_item_id": "uuid",
      "source_kind": "countertop_stone",
      "product_id": "uuid",
      "sku": "...",
      "product_name": "...",
      "required_quantity": 2,
      "vendor_code": "venezia",
      "vendor_name": "Venezia Surfaces",
      "attention_state": "ready",
      "expected_unit_cost": 500,
      "expected_cost_currency": "USD",
      "active_committed_quantity": 2,
      "open_quantity": 0,
      "excess_ordered_quantity": 0,
      "commitments": []
    }
  ]
}
```

For each commitment include `ordered_quantity`, `agreed_unit_cost`, `currency_code`, `vendor_order_no`, `status`, effective `delivered_quantity`, derived `delivery_state`, effective `invoiced_quantity`, derived `invoice_state`, effective `invoice_cost`, and linked invoice rows `{allocation_id, invoice_id, invoice_number, invoice_date, project_invoice_cost}`.

Derived requirement attention priority:

```sql
case
  when required_quantity is null then 'quantity_required'
  when vendor_code is null then 'vendor_required'
  when expected_unit_cost is null then 'cost_required'
  when greatest(active_committed_quantity - required_quantity, 0) > 0 then 'excess_ordered'
  when greatest(required_quantity - active_committed_quantity, 0) > 0 then 'open_to_purchase'
  else 'ready'
end
```

Sales-safe read returns only product/source identity, required quantity, ordered/open boolean/status, delivery state/quantity progress, and invoice state. It must omit `vendor_code`, `vendor_name`, all expected/agreed cost fields, invoice number, invoice total, allocation amount, and Project invoice cost.

- [ ] **Step 3: Implement manual vendor resolution for Admin**

Normalize:

```sql
v_vendor_code := lower(nullif(btrim(p_vendor_code), ''));
v_vendor_name := nullif(btrim(p_vendor_name), '');
```

Reject either missing field. Admin/Super Admin only. Lock the current requirement. If the requirement product has already been committed, do not allow vendor identity rewrite; existing commitment vendor is historical truth. Otherwise update requirement vendor fields with `vendor_source='manual'` and append a procurement event with before/after snapshot.

- [ ] **Step 4: Implement commitment creation with open-quantity guard**

Admin/Super Admin only. Lock requirement and active commitments. Reject:

```text
not current requirement
Vendor Required
Quantity Required
ordered_quantity <= 0
ordered_quantity > max(required_quantity - active_committed_quantity, 0)
blank PO/vendor_order_no
missing/non-finite agreed unit cost
invalid three-letter currency
```

Snapshot requirement vendor identity into the commitment. Allow missing expected cost if the user supplies the required agreed unit cost; `Cost Required` means canonical expected cost is missing, not that the real vendor order must be blocked once an agreed cost is entered.

- [ ] **Step 5: Implement confirmation/cancellation**

Confirmation changes `ordered -> confirmed`, records actor/timestamp, and appends event history.

Cancellation requires non-empty reason and is allowed only when effective delivered quantity and effective invoiced quantity are both zero. Do not delete the commitment. Set `status='cancelled'`, `cancelled_at/by/reason`, append event history, and let open quantity become available again through derived reads.

- [ ] **Step 6: Implement append-safe delivery + correction**

Admin/Super Admin only.

Positive delivery inserts one `quantity_delta > 0` event. Before insert, lock commitment and sum current delivery deltas. Reject if resulting effective delivery is `> ordered_quantity`.

Correction inserts a new negative event referencing the original positive delivery event. Require a non-empty reason. Reject if correction quantity exceeds the remaining effective quantity attributable to the original event or would make total effective delivery negative.

No delivery function may call inventory RPCs or insert `inventory_movements`.

- [ ] **Step 7: Implement one-step canonical invoice create/reuse + Project allocation**

Admin/Finance/Super Admin may call `record_customer_project_procurement_invoice`.

Normalize invoice identity:

```sql
v_invoice_number := nullif(btrim(p_invoice_number), '');
v_invoice_key := lower(regexp_replace(v_invoice_number, '\\s+', ' ', 'g'));
v_currency := upper(btrim(p_currency_code));
```

Use commitment vendor code as the invoice vendor; the caller never supplies a different vendor.

Lock by `(vendor_code, invoice_key)` using advisory lock. If invoice does not exist, create header using invoice date, total and currency. If it exists, require exact vendor/currency and the same invoice date and total (numeric tolerance `0.0001`); otherwise reject instead of silently changing canonical invoice truth.

Then validate allocation:

```text
invoiced_quantity > 0
project_invoice_cost > 0
commitment not cancelled
currency = commitment currency
resulting commitment invoiced quantity <= ordered quantity
resulting invoice allocated amount <= vendor invoice total
```

Insert a positive allocation row and return its UUID. The same vendor invoice ID can therefore receive allocations from commitments in many Projects.

- [ ] **Step 8: Implement append-safe invoice allocation reversal**

Admin/Finance/Super Admin. Require reason. Insert a negative allocation row referencing the original positive row; never delete the original. Reject double reversal and any reversal that would make effective commitment invoiced quantity or invoice allocated amount negative.

- [ ] **Step 9: Apply RLS/grants/security model**

For every new table:

```sql
alter table ... enable row level security;
revoke all on table ... from public, anon, authenticated;
```

Use restrictive deny policies for `anon` and `authenticated` direct table access. Service-role access may remain explicit for maintenance/diagnostics.

Private read/mutation functions are `SECURITY DEFINER` with pinned `search_path` and explicit role checks. Public wrappers are SQL/PLpgSQL `SECURITY INVOKER`; revoke execute from `public` and `anon`, grant only required public RPCs to `authenticated`.

Detailed read guard: roles `super_admin`, `admin`, `finance`.

Sales-safe read guard: roles `super_admin`, `admin`, `finance`, `sales`.

Order/vendor/delivery mutations: `super_admin`, `admin` only.

Invoice record/reversal: `super_admin`, `admin`, `finance`.

All role denials use SQLSTATE `42501`.

- [ ] **Step 10: Make procurement event log immutable**

Add a BEFORE UPDATE OR DELETE trigger on `customer_project_procurement_events` that raises SQLSTATE `23514` with a stable message such as `Project procurement audit rows are immutable.`

- [ ] **Step 11: Run contract**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
```

Expected: DB schema/sync/operations contract is GREEN; adapter/UI still RED.

- [ ] **Step 12: Commit**

```bash
git add modulex-store/supabase/migrations/20260904103000_customer_project_procurement_operations.sql \
  modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project procurement operations"
```

---

### Task 5: Add Admin permissions and typed procurement client adapter

**Files:**
- Create: `modulex-admin/src/lib/customers/project-procurement.ts`
- Modify: `modulex-admin/src/lib/auth/permissions.ts`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Produces TypeScript types:
  - `ProjectProcurementAttentionState`
  - `ProjectProcurementDeliveryState`
  - `ProjectProcurementInvoiceState`
  - `ProjectProcurementInvoiceLink`
  - `ProjectProcurementCommitment`
  - `ProjectProcurementRequirement`
  - `ProjectProcurementLedger`
  - `ProjectProcurementStatusRow`
- Produces adapter functions:
  - `loadProjectProcurement(projectId)`
  - `loadProjectProcurementStatus(projectId)`
  - `resolveProjectProcurementVendor(input)`
  - `createProjectProcurementCommitment(input)`
  - `confirmProjectProcurementCommitment(commitmentId)`
  - `cancelProjectProcurementCommitment(input)`
  - `recordProjectProcurementDelivery(input)`
  - `correctProjectProcurementDelivery(input)`
  - `recordProjectProcurementInvoice(input)`
  - `reverseProjectProcurementInvoiceAllocation(input)`

- [ ] **Step 1: Extend contract with adapter/permission RED assertions**

Require the exact exported function names above and role assignments:

```js
const adapterSource = read(adapter);
for (const token of [
  "loadProjectProcurement",
  "loadProjectProcurementStatus",
  "resolveProjectProcurementVendor",
  "createProjectProcurementCommitment",
  "recordProjectProcurementDelivery",
  "recordProjectProcurementInvoice",
]) assert.match(adapterSource, new RegExp(token));

assert.match(permissionSource, /project_procurement\.view/);
assert.match(permissionSource, /project_procurement\.manage/);
```

Run; expected RED.

- [ ] **Step 2: Add explicit permissions**

Add to `Permission` and labels:

```ts
| "project_procurement.view"
| "project_procurement.manage"
```

Labels:

```ts
"project_procurement.view": "View Project procurement status",
"project_procurement.manage": "Manage Project vendor commitments and delivery",
```

Role mapping:

```text
sales   -> project_procurement.view
finance -> project_procurement.view
admin/super_admin -> all permissions, therefore view + manage
warehouse/shipping -> no new Procurement permission in PB-3B
```

Finance invoice actions are authorized by DB role plus existing `finance.manage`; do not give Finance broad vendor-order/delivery ownership through `project_procurement.manage`.

Update role descriptions so Sales says Procurement operational status only and Finance says vendor invoice allocation/cost visibility without order/delivery ownership.

- [ ] **Step 3: Define typed adapter models**

Use camelCase client types. Example commitment:

```ts
export type ProjectProcurementCommitment = {
  id: string;
  status: "ordered" | "confirmed" | "cancelled";
  orderedQuantity: number;
  agreedUnitCost: number;
  currencyCode: string;
  vendorOrderNo: string;
  deliveredQuantity: number;
  deliveryState: "not_delivered" | "partially_delivered" | "delivered";
  invoicedQuantity: number;
  invoiceState: "not_invoiced" | "partially_invoiced" | "invoiced";
  invoiceCost: number;
  invoices: ProjectProcurementInvoiceLink[];
};
```

Requirement includes order/source/product/vendor/expected cost, active committed/open/excess quantity and commitments.

- [ ] **Step 4: Normalize mutation inputs before RPC**

In the adapter, implement domain-local helpers:

```ts
function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function positiveNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than zero.`);
  return value;
}

function currencyCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter code.");
  return normalized;
}

function isoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} is invalid.`);
  return value;
}
```

Do not convert blank numeric fields to zero.

- [ ] **Step 5: Add local early permission guards without replacing DB authority**

Implement:

```ts
async function requireProcurementManage() { /* project_procurement.manage */ }
async function requireProcurementInvoiceManage() { /* project_procurement.manage OR finance.manage */ }
```

Detailed reads may be requested only when `project_procurement.view` plus internal finance/cost visibility is present; Sales uses the status RPC.

- [ ] **Step 6: Implement RPC adapters**

Use exact RPC argument names from Task 4. Parse numeric strings with a helper that returns finite numbers but does not fabricate missing cost values; nullable costs stay `null`.

`recordProjectProcurementInvoice` input:

```ts
{
  commitmentId: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTotal: number;
  currencyCode: string;
  invoicedQuantity: number;
  projectInvoiceCost: number;
}
```

- [ ] **Step 7: Run contract and TypeScript**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
npm run typecheck
```

Expected: adapter/permission contract GREEN; typecheck passes; UI assertions still RED.

- [ ] **Step 8: Commit**

```bash
git add modulex-admin/src/lib/customers/project-procurement.ts \
  modulex-admin/src/lib/auth/permissions.ts \
  modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project procurement client boundary"
```

---

### Task 6: Replace Project Procurement placeholder with the real role-aware UI

**Files:**
- Create: `modulex-admin/src/components/customers/project-detail/ProjectProcurementTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectProcurementOrderActions.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectProcurementReceiptInvoiceActions.tsx`
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- `ProjectProcurementTab` props:

```ts
type ProjectProcurementTabProps = {
  projectId: string;
  canViewDetails: boolean;
  canManageProcurement: boolean;
  canManageInvoices: boolean;
};
```

- `canViewDetails`: Admin/Finance internal detail; false for Sales.
- `canManageProcurement`: Admin/Super Admin.
- `canManageInvoices`: Admin/Super Admin or Finance.

- [ ] **Step 1: Extend UI contract RED assertions**

Require:

```js
const workspace = read("modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx");
const procurementUi = read(component);
assert.match(workspace, /ProjectProcurementTab/);
assert.doesNotMatch(workspace, /title="Procurement"[\s\S]{0,300}ProjectPendingDomainTab/);
for (const label of [
  "Vendor",
  "Product",
  "Vendor Cost",
  "Delivery",
  "Invoiced",
  "Invoice No",
  "Invoice Cost",
  "PO No",
]) assert.match(procurementUi, new RegExp(label));
assert.match(procurementUi, /Vendor Required/);
assert.match(procurementUi, /Open to Purchase/);
assert.match(procurementUi, /Excess Ordered/);
```

Run; expected RED.

- [ ] **Step 2: Add role-aware Procurement permissions to workspace load**

In `ProjectDetailWorkspace.tsx`, compute after profile load:

```ts
const nextCanViewProcurement = Boolean(profile && hasPermission(profile.roles, "project_procurement.view"));
const nextCanManageProcurement = Boolean(profile && hasPermission(profile.roles, "project_procurement.manage"));
const nextCanManageInvoices = Boolean(
  profile && (
    hasPermission(profile.roles, "project_procurement.manage") ||
    hasPermission(profile.roles, "finance.manage")
  )
);
const nextCanViewProcurementDetails = Boolean(
  profile &&
  hasPermission(profile.roles, "project_procurement.view") &&
  hasPermission(profile.roles, "pricing.cost.view")
);
```

Sales therefore gets the status projection, Finance gets detailed cost/invoice view + invoice actions, Admin gets full actions.

If the profile lacks `project_procurement.view`, the Procurement tab should render a permission-denied state rather than attempt the RPC.

- [ ] **Step 3: Build the Sales-safe status branch first**

When `canViewDetails === false`, call only `loadProjectProcurementStatus`. Render no vendor identity or money columns. Use shared `ComponentCard`, `TableViewport`, `Table`, `Badge`, `Alert`, `Button`.

Columns:

```text
Product | Required | Ordered | Delivery | Invoiced
```

Explicit states: loading, empty (`No confirmed Project purchases yet.`), error + Retry, permission denied.

- [ ] **Step 4: Build the detailed Admin/Finance table**

Call `loadProjectProcurement`. Render the approved compact table:

```text
Vendor | Product | Qty | Vendor Cost | Delivery | Invoiced | Invoice No | Invoice Cost | PO No | Actions
```

Rules:

- Requirement row shows current required quantity.
- Configured Countertop source label may show `Stone` / `Sink` secondary text.
- Vendor Cost uses agreed commitment cost when commitment exists; otherwise expected cost; missing is `Cost Required` rather than `$0.00`.
- Delivery shows `delivered / ordered` plus state badge.
- Invoice Cost sums effective allocations for the visible commitment only.
- Multiple invoice numbers render as a compact list, never as the vendor invoice full total.
- Attention badges: `Vendor Required`, `Cost Required`, `Quantity Required`, `Open to Purchase`, `Excess Ordered`.
- Historical cancelled commitments remain readable but visually marked cancelled.

- [ ] **Step 5: Implement Admin order/vendor actions in `ProjectProcurementOrderActions.tsx`**

Use shared Modal/Input/Label/Button/Alert components only.

Vendor resolution modal fields:

```text
Vendor Code
Vendor Name
```

Create Order modal fields:

```text
PO / Vendor Order No
Quantity (default = open quantity)
Agreed Unit Cost
Currency (default expected currency when available)
```

Disable duplicate submits. Frontend rejects quantity `<= 0` or `> openQuantity`; DB remains authoritative.

Add `Confirm Vendor Order` for ordered commitments and `Cancel Vendor Order` with mandatory reason. Hide all of these actions from Finance/Sales.

- [ ] **Step 6: Implement delivery and invoice actions in `ProjectProcurementReceiptInvoiceActions.tsx`**

Admin delivery modal:

```text
Received Quantity (default remaining)
Delivery Date (default today YYYY-MM-DD)
Notes (optional)
```

Admin correction modal:

```text
Correction Quantity
Reason (required)
```

Admin/Finance invoice modal:

```text
Invoice No
Invoice Date
Vendor Invoice Total
Currency
Invoiced Quantity (default remaining uninvoiced qty)
Invoice Cost for this Project/product
```

Copy clarifies that `Vendor Invoice Total` is the whole vendor invoice header and `Invoice Cost` is only this Project/product allocation. Do not render payment status fields.

Provide reversal of a linked allocation behind a secondary action requiring a reason. Admin and Finance may use it.

- [ ] **Step 7: Keep the primary screen simple**

Do not add a standalone PO module, inventory controls, payment controls, or PB-2 profitability changes. Correction/cancellation actions belong behind row actions/modals; the primary table remains the nine approved business columns plus Actions.

- [ ] **Step 8: Replace only the Procurement placeholder in workspace**

Import `ProjectProcurementTab` and render it for `activeTab === "Procurement"`. Keep `ProjectPendingDomainTab` for Documents or other still-staged domains.

- [ ] **Step 9: Run focused contract and strict UI gate**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
npm run smoke:admin-ui-strict
npm run typecheck
```

Expected: all PB-3B source contract assertions GREEN; strict UI and typecheck pass.

- [ ] **Step 10: Commit**

```bash
git add modulex-admin/src/components/customers/project-detail/ProjectProcurementTab.tsx \
  modulex-admin/src/components/customers/project-detail/ProjectProcurementOrderActions.tsx \
  modulex-admin/src/components/customers/project-detail/ProjectProcurementReceiptInvoiceActions.tsx \
  modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx \
  modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project Procurement workspace"
```

---

### Task 7: Lock behavioral/security acceptance and package documentation before PR handoff

**Files:**
- Create: `docs/acceptance/pb-3b-project-procurement.md`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`
- Modify: `docs/PROJECT_BASE_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Modify: `.github/workflows/admin-project-base.yml` only if final contract naming/order needs correction

**Interfaces:**
- Produces pre-merge acceptance artifact and a final-head CI gate.

- [ ] **Step 1: Add final static invariants to the contract**

Require the final contract to prove at source level:

```js
assert.doesNotMatch(core, /insert\s+into\s+public\.inventory_movements/i);
assert.doesNotMatch(ops, /insert\s+into\s+public\.inventory_movements/i);
assert.doesNotMatch(ops, /paid_amount|payment_date|payment_method/i);
assert.match(core, /countertop_configurations/);
assert.match(core, /slab_quantity/);
assert.match(ops, /vendor_invoices/);
assert.match(ops, /invoice_number_key/);
assert.match(ops, /project_invoice_cost|allocated_amount|amount_delta/);
```

Also assert Sales role receives `project_procurement.view` but not `project_procurement.manage`, and Finance receives view but not broad manage.

- [ ] **Step 2: Add a pre-merge read-only production reconnaissance section to acceptance doc**

Record current production facts without writes:

```sql
-- current PB-3B tables should not exist before migration
select to_regclass('public.customer_project_procurement_requirements');
select to_regclass('public.vendor_invoices');

-- Stone/Sink source truth samples
select ... from public.countertop_configurations ...;
select ... from public.vendor_catalog_items where canonical_product_id is not null ...;

-- confirm no existing procurement ledger is being replaced
select table_name from information_schema.tables
where table_schema='public' and table_name ilike '%procurement%';
```

Document that current Countertop config is Draft-only mutable, so confirmed procurement sync uses stable `slab_quantity`/`sink_product_id` truth.

- [ ] **Step 3: Run all relevant local verification**

From `modulex-admin`:

```bash
node scripts/project-base-contract.mjs
node scripts/project-progress-layout-contract.mjs
node scripts/project-financial-rollup-contract.mjs
node scripts/project-payment-ledger-contract.mjs
node scripts/project-payment-edit-delete-contract.mjs
node scripts/project-finance-simple-flow-contract.mjs
node scripts/project-procurement-contract.mjs
node scripts/countertop-sink-fallback-contract.mjs
npm run smoke:admin-ui-strict:self-test
npm run smoke:admin-ui-strict
npm run typecheck
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 4: Verify Store/Portal remains unchanged**

Run the existing Store/portal regressions that cover shared schema consumers. At minimum use the repository's current CI commands/workflows for Store Chrome/SEO, Dealer/Customer portal order surfaces, and Cabinet journey where available. The expected result is no new public procurement RPC/table projection and no Store source change required for PB-3B.

- [ ] **Step 5: Review migration SQL against production before merge**

Use read-only production queries to verify all referenced columns/FKs/functions still exist with compatible types. Compare current function/security metadata for the Order and Project domains. Do **not** run DDL or permanent mutation before merge.

- [ ] **Step 6: Update acceptance doc with pre-merge evidence**

Include:

```text
Design/spec path
Migration filenames
RBAC matrix
Static/TDD RED -> GREEN evidence
Local typecheck/lint/build
No inventory writes
No payment fields
Production schema preflight
Pending gates: owner merge -> production migration -> rollback smoke -> Advisors -> Admin deploy/UI review
```

- [ ] **Step 7: Keep trackers `[~]` before production acceptance**

Update current branch/PR/status in `docs/PROJECT_BASE_PLAN.md` and `modulex-admin/ADMIN_ROADMAP.md`, but do not change PB-3B to `[x]` before post-merge migration/deploy acceptance.

- [ ] **Step 8: Commit**

```bash
git add docs/acceptance/pb-3b-project-procurement.md \
  modulex-admin/scripts/project-procurement-contract.mjs \
  docs/PROJECT_BASE_PLAN.md \
  modulex-admin/ADMIN_ROADMAP.md \
  .github/workflows/admin-project-base.yml
git commit -m "docs: add PB-3B procurement acceptance"
```

- [ ] **Step 9: Push and create a ready-for-review PR without merging**

```bash
git push -u origin feat/project-procurement-pb3b
gh pr create \
  --base main \
  --head feat/project-procurement-pb3b \
  --title "feat: add PB-3B Project procurement" \
  --body-file /tmp/pb3b-pr-body.md
```

PR body must summarize business behavior, security, TDD evidence, migration status `NOT YET APPLIED`, and owner-owned merge/deploy gate.

- [ ] **Step 10: Wait for all PR CI on final head**

Expected required workflows: Admin Project Base, Admin UI Foundation, Admin Customers UI, Admin A1 Core Operations, and all Store/shared-schema regressions triggered by the diff. Fix only PB-3B regressions; do not sweep unrelated advisor/CI backlog.

---

### Task 8: Post-merge production migration, rollback-only business acceptance, Advisors, deploy, and closeout

**Files:**
- Modify after evidence: `docs/acceptance/pb-3b-project-procurement.md`
- Modify after evidence: `docs/PROJECT_BASE_PLAN.md`
- Modify after evidence: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Gate: start only after the project owner explicitly confirms the PB-3B PR is merged.
- Produces: production-accepted PB-3B and final tracker closeout.

- [ ] **Step 1: Verify merge SHA and production migration absence**

Confirm current `main` contains the PB-3B migrations and CI is green. Check Supabase migration history; none of the PB-3B migrations should have been applied before merge.

- [ ] **Step 2: Apply the three migrations to production in order**

Apply:

```text
20260904102000_customer_project_procurement_core.sql
20260904102500_customer_project_procurement_order_sync.sql
20260904103000_customer_project_procurement_operations.sql
```

If production schema drift makes any migration unsafe, stop and create a forward fix; do not edit an already-applied production migration in place.

- [ ] **Step 3: Run rollback-only Admin happy-path smoke**

Inside one explicit SQL transaction as an Admin/Super Admin identity/test harness:

```text
create or reuse a temporary Project + Draft Order only if safe test fixtures are available
confirm Project-linked Order
verify one requirement per ordinary physical component
for configured Countertop fixture verify Stone qty = slab_quantity and Sink = 1
place commitment with PO and agreed cost
record partial delivery
record vendor invoice allocation
query detailed ledger
ROLLBACK
```

Assertions:

```text
confirmed sync idempotent
55 sqft / 2 slabs -> Stone required qty 2, never 55
Sink config -> separate qty 1 requirement
partial delivery state correct
invoice state/cost correct
no inventory_movements inserted
rollback leaves zero PB-3B test residue
```

- [ ] **Step 4: Run rollback-only shared-invoice smoke across two Projects**

Within one transaction:

```text
Project A commitment -> invoice INV-PB3B-SMOKE allocation A
Project B commitment -> same vendor + same invoice number allocation B
```

Assert one canonical `vendor_invoices` row, two effective Project allocations, each Project detailed read shows only its own invoice cost, and summed allocations do not exceed invoice header total. Roll back and confirm zero residue.

- [ ] **Step 5: Run failure/role smoke**

Verify:

```text
Sales status RPC succeeds
Sales detailed RPC -> 42501
Sales mutation -> 42501
Finance detailed RPC succeeds
Finance invoice record/reversal succeeds in rollback
Finance vendor-order/delivery mutation -> 42501
Vendor Required blocks commitment
quantity above open amount rejected
partial over-delivery rejected
invoice vendor/currency/header mismatch rejected
invoice over-allocation rejected
```

- [ ] **Step 6: Prove no inventory side effect**

Capture `inventory_movements` count before and during rollback-only delivery smoke for the touched products. Count must not change because procurement delivery is not inventory receipt.

- [ ] **Step 7: Run fresh Supabase Security and Performance Advisors**

Record PB-3B-specific findings. Fix blocking RLS/grant/search-path/FK/index findings with a new forward migration. New indexes may show `unused_index` INFO before traffic; document as informational rather than deleting useful covering indexes prematurely.

- [ ] **Step 8: Deploy merged Admin and perform signed-in UI acceptance**

Verify Project -> Procurement for:

```text
Admin: detailed table + vendor/order/delivery/invoice actions
Finance: detailed cost/invoice view + invoice actions, no order/delivery ownership
Sales: sanitized status-only table, no vendor cost/invoice amounts
```

Check loading, empty, populated, error/retry, modal validation, partial delivery, shared invoice number display, mobile/table containment, light/dark readability.

- [ ] **Step 9: Close trackers only after acceptance passes**

Change PB-3B to `[x]` in `docs/PROJECT_BASE_PLAN.md` and the Admin roadmap. Record production migration names, merge SHA, deployment ID, rollback smoke results, role boundaries, Advisor outcome, and zero test residue. Set next package to PB-4 outgoing Finance / Project Expenses.

- [ ] **Step 10: Commit closeout documentation in a small follow-up PR if main is already protected by merge**

```bash
git add docs/acceptance/pb-3b-project-procurement.md docs/PROJECT_BASE_PLAN.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: close PB-3B production acceptance"
```

Do not mark deployment/acceptance complete without evidence.
