# PB-3B Project Procurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Project Procurement so confirmed Project Orders automatically create purchasable demand, Admin can place and receive vendor commitments, Admin/Finance can attach shared vendor invoices with Project-specific invoice cost, and Sales sees status only.

**Architecture:** Customer Orders remain demand truth. PB-3B adds separate append-safe procurement requirements, vendor commitments, delivery events, canonical vendor invoices, and invoice allocations. Configured Countertop Stone demand comes from `countertop_configurations.slab_quantity`; configured Sink is a separate component. Synchronization is DB-authoritative and idempotent, vendor payment state remains PB-4/Finance scope, and no procurement operation writes inventory.

**Tech Stack:** PostgreSQL/Supabase migrations + RPCs/RLS, Next.js 16 / React / TypeScript, Supabase JS, Modulex shared Admin UI primitives, Node contract scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-pb-3b-project-procurement-design.md`

## Global Constraints

- Re-check execution-time `main` and open PRs before implementation; preserve parallel Vendor Catalog/Stone work.
- Execute in an isolated worktree/branch. Current design branch: `feat/project-procurement-pb3b`.
- `customer_orders` / `customer_order_items` remain canonical Order truth.
- Draft Orders create no procurement demand. Project-linked confirmed/non-Draft Orders do.
- Standalone Orders with `project_id = null` create no Project Procurement.
- Cancelled Orders have no current open procurement demand; existing commitments/delivery/invoice history remain readable.
- Ordinary physical lines use `customer_order_items.quantity`.
- `SERVICE` lines create no procurement requirement.
- Configured Countertop Stone uses `countertop_configurations.slab_quantity`, never sqft/commercial Order quantity.
- Configured Countertop Sink creates a separate requirement with canonical quantity `1` when present.
- Existing vendor commitments are historical truth; later Order revisions never silently rewrite them.
- Vendor resolution order: approved canonical Vendor Catalog link → product metadata → `Vendor Required`.
- Missing vendor/cost/quantity never fabricates a value; missing cost never becomes `0`.
- `Vendor Order / PO No` is required when placing a commitment.
- Delivery is procurement receipt truth only and creates zero `inventory_movements`.
- Vendor Invoice is vendor-scoped canonical truth and may span multiple Projects; a Project sees only its allocation cost.
- Project Procurement contains no `Paid / Unpaid / Due / Payment Date / Payment Method` state.
- No FX conversion is invented; currency mismatch fails closed.
- PB-2 profitability remains unchanged in PB-3B.
- Sales sees sanitized operational status only; vendor identity/cost and invoice numbers/amounts are internal.
- No Store/Customer Portal/Dealer Portal procurement projection is added.
- Public RPC wrappers remain `SECURITY INVOKER`; private privileged cores use explicit role guards + pinned search path.
- Anon/authenticated direct table access is denied; RLS/grants and covering indexes are part of acceptance.
- Changed Admin UI uses shared primitives and passes `npm run smoke:admin-ui-strict`.
- Inputs follow `ADMIN_VALIDATION_GUIDE.md`; browser validation is only an early UX guard.
- Do not permanently apply production DDL before project-owner merge. After merge: apply migrations, rollback-only business smoke, Advisors, deploy/UI acceptance, then close PB-3B.

---

### Task 1: Establish PB-3B RED contract and active tracking

**Files:**
- Create: `modulex-admin/scripts/project-procurement-contract.mjs`
- Modify: `.github/workflows/admin-project-base.yml`
- Modify: `docs/PROJECT_BASE_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces CI step `Project Procurement contract` and the package-wide RED→GREEN contract script.

- [ ] **Step 1: Re-check baseline and parallel work**

```bash
git fetch origin main
git rev-parse origin/main
gh pr list --state open --limit 50
```

If `main` moved after the design baseline, bring current `main` into the isolated branch before implementation. Do not overwrite unrelated vendor files.

- [ ] **Step 2: Write the initial failing contract**

Create `modulex-admin/scripts/project-procurement-contract.mjs`:

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
assert.equal(exists(syncMigration), true, "PB-3B order-sync migration must exist");
assert.equal(exists(operationsMigration), true, "PB-3B operations migration must exist");
assert.equal(exists(adapter), true, "Project Procurement adapter must exist");
assert.equal(exists(component), true, "Project Procurement tab must exist");

const permissionSource = read(permissions);
assert.match(permissionSource, /project_procurement\.view/);
assert.match(permissionSource, /project_procurement\.manage/);

console.log("Project Procurement contract passed.");
```

- [ ] **Step 3: Verify RED**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
```

Expected: FAIL on the first missing PB-3B migration.

- [ ] **Step 4: Wire Project Base CI**

Add after Project Finance simple flow:

```yaml
      - name: Project Procurement contract
        run: node scripts/project-procurement-contract.mjs
```

- [ ] **Step 5: Mark PB-3B active**

`docs/PROJECT_BASE_PLAN.md`: change PB-3B to `[~]` and record confirmed-order sync, no inventory movement, shared vendor invoice, Project-only allocation cost, and Finance-owned payment state.

`modulex-admin/ADMIN_ROADMAP.md`: add/update PB-3B as `[~]` with spec/plan paths. Do not mark complete.

- [ ] **Step 6: Commit RED**

```bash
git add .github/workflows/admin-project-base.yml modulex-admin/scripts/project-procurement-contract.mjs docs/PROJECT_BASE_PLAN.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "test: define PB-3B procurement contract"
```

---

### Task 2: Add canonical procurement schema, component derivation, vendor/cost resolution, and idempotent demand sync

**Files:**
- Create: `modulex-store/supabase/migrations/20260904102000_customer_project_procurement_core.sql`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Tables:
  - `public.customer_project_procurement_requirements`
  - `public.customer_project_procurement_commitments`
  - `public.customer_project_procurement_delivery_events`
  - `public.vendor_invoices`
  - `public.customer_project_procurement_invoice_allocations`
  - `public.customer_project_procurement_events`
- Private functions:
  - `private.get_customer_order_procurement_components(p_order_id uuid)`
  - `private.resolve_customer_project_procurement_vendor(p_product_id uuid)`
  - `private.get_customer_project_procurement_cost(p_product_id uuid)`
  - `private.sync_customer_order_procurement(p_order_id uuid)`

- [ ] **Step 1: Add core-schema RED assertions**

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

Run contract; expected FAIL because core migration is absent.

- [ ] **Step 2: Create current-demand requirement table**

Use `numeric(18,4)` for quantities/money and `varchar(3)` for currencies:

```sql
create table public.customer_project_procurement_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  order_item_id uuid not null,
  source_kind text not null check (source_kind in ('order_item','countertop_stone','countertop_sink')),
  configuration_id uuid null references public.countertop_configurations(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  required_quantity numeric(18,4) null check (required_quantity is null or required_quantity > 0),
  vendor_code text null,
  vendor_name_snapshot text null,
  vendor_source text not null default 'unresolved' check (vendor_source in ('catalog','metadata','manual','unresolved')),
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

`order_item_id` deliberately has no FK: confirmed Order revision may physically replace/delete current `customer_order_items`, while Procurement must preserve the source UUID/history and let sync retire the old current requirement. Project/Order/Product references remain real FKs.

- [ ] **Step 3: Create commitment, delivery, invoice, allocation, and immutable event tables**

Required commitment fields/constraints:

```sql
ordered_quantity numeric(18,4) not null check (ordered_quantity > 0)
agreed_unit_cost numeric(18,4) not null check (agreed_unit_cost >= 0)
currency_code varchar(3) not null
vendor_order_no text not null check (btrim(vendor_order_no) <> '')
status text not null check (status in ('ordered','confirmed','cancelled'))
```

Delivery event:

```sql
quantity_delta numeric(18,4) not null check (quantity_delta <> 0)
event_type text not null check (event_type in ('delivery','correction'))
correction_of_event_id uuid null references public.customer_project_procurement_delivery_events(id) on delete restrict
reason text null
```

Vendor invoice:

```sql
vendor_code text not null
vendor_name_snapshot text not null
invoice_number text not null
invoice_number_key text not null
invoice_date date not null
total_amount numeric(18,4) not null check (total_amount > 0)
currency_code varchar(3) not null
unique(vendor_code, invoice_number_key)
```

Invoice allocation:

```sql
quantity_delta numeric(18,4) not null check (quantity_delta <> 0)
amount_delta numeric(18,4) not null check (amount_delta <> 0)
check ((quantity_delta > 0 and amount_delta > 0) or (quantity_delta < 0 and amount_delta < 0))
reversal_of_allocation_id uuid null references public.customer_project_procurement_invoice_allocations(id) on delete restrict
reason text null
```

`customer_project_procurement_events` stores `project_id`, optional requirement/commitment/invoice/allocation IDs, `event_type`, `before_snapshot`, `after_snapshot`, `reason`, `actor_id`, `created_at`; it is append-only audit.

- [ ] **Step 4: Add covering indexes before Advisor acceptance**

Create at least:

```sql
create index customer_project_procurement_requirements_project_idx on public.customer_project_procurement_requirements(project_id, is_current);
create index customer_project_procurement_requirements_order_idx on public.customer_project_procurement_requirements(order_id, is_current);
create index customer_project_procurement_requirements_product_idx on public.customer_project_procurement_requirements(product_id);
create index customer_project_procurement_requirements_created_by_idx on public.customer_project_procurement_requirements(created_by) where created_by is not null;
create index customer_project_procurement_requirements_updated_by_idx on public.customer_project_procurement_requirements(updated_by) where updated_by is not null;
create index customer_project_procurement_commitments_requirement_idx on public.customer_project_procurement_commitments(requirement_id, status);
create index customer_project_procurement_delivery_commitment_idx on public.customer_project_procurement_delivery_events(commitment_id, created_at);
create index customer_project_procurement_invoice_alloc_commitment_idx on public.customer_project_procurement_invoice_allocations(commitment_id, created_at);
create index customer_project_procurement_invoice_alloc_invoice_idx on public.customer_project_procurement_invoice_allocations(invoice_id, created_at);
create index customer_project_procurement_events_project_idx on public.customer_project_procurement_events(project_id, created_at desc);
```

Also index each actor/reference FK introduced by the final DDL so the package does not knowingly create unindexed-FK Advisor findings.

- [ ] **Step 5: Implement purchasable-component derivation**

`private.get_customer_order_procurement_components` returns ordinary physical items plus configured components without duplication:

```sql
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

This locks `55 sqft / 2 slabs` to Stone required quantity `2`, not `55`.

- [ ] **Step 6: Implement deterministic vendor resolution**

Rules:

1. Read distinct non-empty `vendor_catalog_items.vendor_code` where `canonical_product_id=p_product_id` and `review_status='APPROVED'`.
2. Exactly one distinct catalog vendor → use it.
3. No catalog vendor → fallback to `products.metadata->>'vendor_code'`.
4. Conflicting approved catalog vendors → unresolved; do not choose arbitrarily.
5. Normalize code with `lower(btrim(...))`.
6. Display name order: `products.metadata->>'vendor_name'` → `countertop_stone_product_profiles.vendor_name` → humanized vendor code (`initcap(replace(code,'_',' '))`).

Return `(vendor_code text, vendor_name text, vendor_source text)`.

- [ ] **Step 7: Implement current cost lookup**

Match PB-2 semantics: `product_costs.is_active=true`, valid window contains `now()`, latest `valid_from`, then `created_at`. Return `(amount, currency_code)` or no row. Never `coalesce` missing cost to zero.

- [ ] **Step 8: Implement idempotent sync**

Use per-order `pg_advisory_xact_lock` and lock the Order row.

Behavior:

```text
missing Order -> raise
project_id null -> return 0
draft -> return 0
cancelled -> retire all current requirements with retired_reason='order_cancelled'; preserve commitments; return 0
otherwise derive desired components
```

For each desired `(order_item_id, source_kind)`:

```text
current req + no commitments -> refresh product/qty/vendor/cost; preserve manual vendor only if product unchanged
current req + commitments + same product -> update required qty only; preserve commitment/cost/vendor history
current req + commitments + product changed -> retire old req, create new current req
no current req -> create current req
```

For current requirements absent from desired components: set `is_current=false`, `retired_reason='source_removed'`. Never delete a requirement with historical procurement activity.

- [ ] **Step 9: Enable RLS at table creation**

`alter table ... enable row level security` for all six new public tables. Task 4 adds explicit deny policies/grants.

- [ ] **Step 10: Run contract**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
```

Expected: core assertions GREEN; later files remain RED.

- [ ] **Step 11: Commit**

```bash
git add modulex-store/supabase/migrations/20260904102000_customer_project_procurement_core.sql modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project procurement core model"
```

---

### Task 3: Connect sync to canonical Order lifecycle without browser coupling

**Files:**
- Create: `modulex-store/supabase/migrations/20260904102500_customer_project_procurement_order_sync.sql`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Consumes `private.sync_customer_order_procurement(uuid)`.
- Produces Order/update hooks for confirmation, Project assignment, cancellation, and completed confirmed revisions.

- [ ] **Step 1: Add lifecycle-hook RED assertions**

```js
const sync = read(syncMigration);
assert.match(sync, /customer_orders/);
assert.match(sync, /project_id/);
assert.match(sync, /confirmed/);
assert.match(sync, /cancelled/);
assert.match(sync, /customer_activity/);
assert.match(sync, /order_revised/);
assert.match(sync, /sync_customer_order_procurement/);
```

Expected: RED until sync migration exists.

- [ ] **Step 2: Add `customer_orders` AFTER UPDATE hook**

Call sync when Project-linked truth can change:

```sql
if new.project_id is not null and (
  (new.status in ('confirmed','cancelled') and old.status is distinct from new.status)
  or
  (new.project_id is distinct from old.project_id and new.status <> 'draft')
) then
  perform private.sync_customer_order_procurement(new.id);
end if;
```

This covers normal confirmation/cancellation, assigning an already-confirmed Order to a Project, and `create_project_customer_order(... p_initial_status => 'confirmed')` because Project assignment occurs after canonical Order/items creation.

- [ ] **Step 3: Add completed revision hook**

Existing `private.update_customer_order` inserts `customer_activity.activity_type='order_revised'` only after successful line/totals mutation. Add AFTER INSERT trigger on `public.customer_activity`:

```sql
if new.activity_type = 'order_revised'
   and coalesce(new.metadata->>'order_id','') <> '' then
  v_order_id := (new.metadata->>'order_id')::uuid;
  if exists (
    select 1 from public.customer_orders o
    where o.id = v_order_id
      and o.project_id is not null
      and o.status <> 'draft'
  ) then
    perform private.sync_customer_order_procurement(v_order_id);
  end if;
end if;
```

Current production Countertop configurator mutations are Draft-only, so no confirmed Countertop edit hook is needed; confirmed procurement derives from stable configuration truth.

- [ ] **Step 4: Prevent recursion/stock side effects**

Sync must not insert `customer_activity` and neither hook may insert/call `inventory_movements`.

- [ ] **Step 5: Run contract and commit**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
cd ..
git add modulex-store/supabase/migrations/20260904102500_customer_project_procurement_order_sync.sql modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: sync procurement from confirmed Orders"
```

---

### Task 4: Add operations, shared vendor invoices, append-safe corrections, and DB authorization

**Files:**
- Create: `modulex-store/supabase/migrations/20260904103000_customer_project_procurement_operations.sql`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Reads:
  - `get_customer_project_procurement(p_project_id uuid) returns jsonb`
  - `get_customer_project_procurement_status(p_project_id uuid) returns jsonb`
- Mutations:
  - `set_customer_project_procurement_vendor(p_requirement_id uuid, p_vendor_code text, p_vendor_name text) returns uuid`
  - `create_customer_project_procurement_commitment(p_requirement_id uuid, p_ordered_quantity numeric, p_agreed_unit_cost numeric, p_currency_code text, p_vendor_order_no text) returns uuid`
  - `confirm_customer_project_procurement_commitment(p_commitment_id uuid) returns uuid`
  - `cancel_customer_project_procurement_commitment(p_commitment_id uuid, p_reason text) returns uuid`
  - `record_customer_project_procurement_delivery(p_commitment_id uuid, p_quantity numeric, p_delivered_date date, p_notes text) returns uuid`
  - `correct_customer_project_procurement_delivery(p_delivery_event_id uuid, p_quantity numeric, p_reason text) returns uuid`
  - `record_customer_project_procurement_invoice(p_commitment_id uuid, p_invoice_number text, p_invoice_date date, p_invoice_total numeric, p_currency_code text, p_invoiced_quantity numeric, p_project_invoice_cost numeric) returns uuid`
  - `reverse_customer_project_procurement_invoice_allocation(p_allocation_id uuid, p_reason text) returns uuid`

- [ ] **Step 1: Add operation/security RED assertions**

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

- [ ] **Step 2: Implement detailed Admin/Finance read**

Return JSON:

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
      "sku": "SKU",
      "product_name": "Product",
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

Each commitment includes ordered qty, agreed unit cost/currency, PO, status, effective delivered qty/state, effective invoiced qty/state, effective Project invoice cost, and linked invoices `{allocation_id, invoice_id, invoice_number, invoice_date, project_invoice_cost}`.

Attention priority:

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

- [ ] **Step 3: Implement Sales-safe read**

Return only requirement/product identity, required quantity, ordered/open status, delivery progress/state, invoiced state. Omit vendor identity, expected/agreed cost, PO, invoice number/header/allocation amounts, and Project invoice cost.

- [ ] **Step 4: Implement Admin manual vendor resolution**

Normalize:

```sql
v_vendor_code := lower(nullif(btrim(p_vendor_code), ''));
v_vendor_name := nullif(btrim(p_vendor_name), '');
```

Require both. Admin/Super Admin only. Lock current requirement. If any commitment exists, reject vendor rewrite. Otherwise set `vendor_source='manual'` and append before/after procurement event.

- [ ] **Step 5: Implement commitment creation**

Admin/Super Admin only. Lock requirement + active commitments. Reject non-current requirement, missing vendor, missing quantity, `ordered_quantity<=0`, amount above open quantity, blank PO, invalid agreed cost, invalid three-letter currency. Missing expected/canonical cost does not block ordering once explicit agreed cost is supplied.

Snapshot vendor identity into commitment. Default UI quantity is open quantity; DB still validates.

- [ ] **Step 6: Implement confirmation/cancellation**

`ordered -> confirmed` stores actor/time + event.

Cancellation requires reason and is permitted only when effective delivered qty = 0 and effective invoiced qty = 0. Never delete commitment; set cancelled metadata and append event. Derived open quantity becomes available again.

- [ ] **Step 7: Implement append-safe delivery and correction**

Admin/Super Admin only. Positive receipt inserts `quantity_delta>0`; reject resulting effective delivery above ordered qty.

Correction inserts negative delta referencing original positive event, requires reason, rejects double/excess correction and total effective delivery below zero.

No function inserts `inventory_movements`.

- [ ] **Step 8: Implement one-step shared invoice create/reuse + Project allocation**

Admin/Finance/Super Admin.

Normalize:

```sql
v_invoice_number := nullif(btrim(p_invoice_number), '');
v_invoice_key := lower(regexp_replace(v_invoice_number, '\s+', ' ', 'g'));
v_currency := upper(btrim(p_currency_code));
```

Use commitment vendor as invoice vendor; caller cannot supply another vendor. Advisory-lock `(vendor_code, invoice_key)`.

If invoice absent: create header. If present: require same vendor, currency, date, and total within `0.0001`; reject mismatch rather than rewriting canonical invoice.

Allocation guards:

```text
invoiced_quantity > 0
project_invoice_cost > 0
commitment not cancelled
currency = commitment currency
resulting commitment invoiced qty <= ordered qty
resulting total invoice allocated amount <= vendor invoice total
```

Insert positive allocation row and return allocation UUID. Same canonical invoice may therefore have allocations from many Projects.

- [ ] **Step 9: Implement append-safe allocation reversal**

Admin/Finance/Super Admin. Require reason. Insert negative row referencing original positive allocation. Reject double reversal and any result below zero.

- [ ] **Step 10: Apply security model**

Every table:

```sql
alter table public.<table_name> enable row level security;
revoke all on table public.<table_name> from public, anon, authenticated;
```

Create explicit restrictive deny policies for anon/authenticated to avoid RLS-no-policy Advisor findings. Public wrappers are `SECURITY INVOKER`, execute revoked from `public`/`anon`, granted to `authenticated`. Private cores are `SECURITY DEFINER` with pinned `search_path`.

Role matrix:

```text
Detailed read: super_admin, admin, finance
Status read:   super_admin, admin, finance, sales
Vendor/order/delivery mutations: super_admin, admin
Invoice record/reversal:          super_admin, admin, finance
```

All business role denials use SQLSTATE `42501`.

- [ ] **Step 11: Make event audit immutable**

BEFORE UPDATE/DELETE on `customer_project_procurement_events` raises SQLSTATE `23514` with `Project procurement audit rows are immutable.`

- [ ] **Step 12: Run contract and commit**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
cd ..
git add modulex-store/supabase/migrations/20260904103000_customer_project_procurement_operations.sql modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project procurement operations"
```

---

### Task 5: Add explicit Admin permissions and typed procurement adapter

**Files:**
- Create: `modulex-admin/src/lib/customers/project-procurement.ts`
- Modify: `modulex-admin/src/lib/auth/permissions.ts`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**
- Types: `ProjectProcurementAttentionState`, `ProjectProcurementDeliveryState`, `ProjectProcurementInvoiceState`, `ProjectProcurementInvoiceLink`, `ProjectProcurementCommitment`, `ProjectProcurementRequirement`, `ProjectProcurementLedger`, `ProjectProcurementStatusRow`.
- Functions: `loadProjectProcurement`, `loadProjectProcurementStatus`, `resolveProjectProcurementVendor`, `createProjectProcurementCommitment`, `confirmProjectProcurementCommitment`, `cancelProjectProcurementCommitment`, `recordProjectProcurementDelivery`, `correctProjectProcurementDelivery`, `recordProjectProcurementInvoice`, `reverseProjectProcurementInvoiceAllocation`.

- [ ] **Step 1: Add adapter/permission RED assertions**

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
```

- [ ] **Step 2: Add permissions**

Add:

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
warehouse/shipping -> no PB-3B procurement permission
```

Finance invoice mutation uses existing `finance.manage` plus DB role guard; do not grant broad `project_procurement.manage` to Finance.

- [ ] **Step 3: Define typed models**

Example:

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

Keep nullable expected cost as `number | null`; parsing must not turn missing cost into zero.

- [ ] **Step 4: Add exact normalization helpers**

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

function nonNegativeNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} cannot be negative.`);
  return value;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter code.");
  return normalized;
}

function normalizeIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} is invalid.`);
  return value;
}
```

- [ ] **Step 5: Add actual early permission guards**

```ts
async function currentProfileOrThrow() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile) throw new Error("Profile could not be loaded.");
  return profile;
}

async function requireProcurementManage() {
  const profile = await currentProfileOrThrow();
  if (!hasPermission(profile.roles, "project_procurement.manage")) {
    throw new Error("You do not have permission to manage Project procurement.");
  }
  return profile;
}

async function requireProcurementInvoiceManage() {
  const profile = await currentProfileOrThrow();
  if (
    !hasPermission(profile.roles, "project_procurement.manage") &&
    !hasPermission(profile.roles, "finance.manage")
  ) {
    throw new Error("You do not have permission to manage Project vendor invoices.");
  }
  return profile;
}
```

DB/RPC authorization remains authoritative.

- [ ] **Step 6: Implement RPC adapters**

Use exact Task 4 RPC argument names. `recordProjectProcurementInvoice` input:

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

`loadProjectProcurementStatus` is the only read called by Sales UI. Detailed adapter is for Admin/Finance only.

- [ ] **Step 7: Verify and commit**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
npm run typecheck
cd ..
git add modulex-admin/src/lib/customers/project-procurement.ts modulex-admin/src/lib/auth/permissions.ts modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project procurement client boundary"
```

---

### Task 6: Replace Project Procurement placeholder with role-aware UI

**Files:**
- Create: `modulex-admin/src/components/customers/project-detail/ProjectProcurementTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectProcurementOrderActions.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectProcurementReceiptInvoiceActions.tsx`
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`

**Interfaces:**

```ts
type ProjectProcurementTabProps = {
  projectId: string;
  canViewProcurement: boolean;
  canViewDetails: boolean;
  canManageProcurement: boolean;
  canManageInvoices: boolean;
};
```

- [ ] **Step 1: Add UI RED assertions**

```js
const workspace = read("modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx");
const procurementUi = read(component);
assert.match(workspace, /ProjectProcurementTab/);
for (const label of ["Vendor", "Product", "Vendor Cost", "Delivery", "Invoiced", "Invoice No", "Invoice Cost", "PO No"]) {
  assert.match(procurementUi, new RegExp(label));
}
assert.match(procurementUi, /Vendor Required/);
assert.match(procurementUi, /Open to Purchase/);
assert.match(procurementUi, /Excess Ordered/);
```

- [ ] **Step 2: Compute workspace permissions from current profile**

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

No permission → explicit permission-denied state and no RPC call.

- [ ] **Step 3: Build Sales-safe branch first**

When `canViewDetails=false`, call only `loadProjectProcurementStatus`.

Columns:

```text
Product | Required | Ordered | Delivery | Invoiced
```

Do not render vendor, PO, costs, invoice number, invoice amount. Implement loading, empty (`No confirmed Project purchases yet.`), error/retry, permission-denied states using shared primitives.

- [ ] **Step 4: Build detailed Admin/Finance table**

Approved primary columns:

```text
Vendor | Product | Qty | Vendor Cost | Delivery | Invoiced | Invoice No | Invoice Cost | PO No | Actions
```

Rules:

- Stone/Sink configured components show separate source labels.
- Vendor Cost = agreed commitment cost when ordered; otherwise expected cost; missing displays `Cost Required`, never `$0.00`.
- Delivery displays effective `delivered / ordered` and status.
- Invoice Cost sums effective allocations for that commitment only.
- Multiple invoice numbers render compactly.
- Shared invoice header total never appears as the Project's cost.
- Attention states: `Vendor Required`, `Cost Required`, `Quantity Required`, `Open to Purchase`, `Excess Ordered`.
- Cancelled historical commitments remain readable.

- [ ] **Step 5: Implement Admin vendor/order actions**

`ProjectProcurementOrderActions.tsx` uses shared Modal/Input/Label/Button/Alert.

Vendor modal:

```text
Vendor Code
Vendor Name
```

Create Order modal:

```text
PO / Vendor Order No
Quantity (default open quantity)
Agreed Unit Cost
Currency (default expected currency when present)
```

Hide from Finance/Sales. Add Confirm and Cancel actions; Cancel requires reason. Disable duplicate submit and reject obvious invalid quantity/currency before RPC.

- [ ] **Step 6: Implement delivery/invoice/correction actions**

Admin delivery modal:

```text
Received Quantity
Delivery Date (YYYY-MM-DD, default today)
Notes
```

Admin delivery correction:

```text
Correction Quantity
Reason
```

Admin/Finance invoice modal:

```text
Invoice No
Invoice Date
Vendor Invoice Total
Currency
Invoiced Quantity
Invoice Cost for this Project/product
```

Copy explains `Vendor Invoice Total` is the whole vendor invoice and `Invoice Cost` is this Project/product allocation. Add allocation reversal as secondary action requiring reason. No payment controls/fields.

- [ ] **Step 7: Replace only Procurement placeholder**

Import/render `ProjectProcurementTab` for `activeTab === "Procurement"`. Keep `ProjectPendingDomainTab` for Documents/other staged domains.

- [ ] **Step 8: Verify and commit**

```bash
cd modulex-admin
node scripts/project-procurement-contract.mjs
npm run smoke:admin-ui-strict
npm run typecheck
cd ..
git add modulex-admin/src/components/customers/project-detail/ProjectProcurementTab.tsx modulex-admin/src/components/customers/project-detail/ProjectProcurementOrderActions.tsx modulex-admin/src/components/customers/project-detail/ProjectProcurementReceiptInvoiceActions.tsx modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx modulex-admin/scripts/project-procurement-contract.mjs
git commit -m "feat: add Project Procurement workspace"
```

---

### Task 7: Final pre-merge verification, acceptance artifact, trackers, and PR

**Files:**
- Create: `docs/acceptance/pb-3b-project-procurement.md`
- Modify: `modulex-admin/scripts/project-procurement-contract.mjs`
- Modify: `docs/PROJECT_BASE_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces final pre-merge evidence; PB-3B remains `[~]` until post-merge production acceptance.

- [ ] **Step 1: Add final source invariants**

```js
assert.doesNotMatch(core, /insert\s+into\s+public\.inventory_movements/i);
assert.doesNotMatch(ops, /insert\s+into\s+public\.inventory_movements/i);
assert.doesNotMatch(ops, /paid_amount|payment_date|payment_method/i);
assert.match(core, /countertop_configurations/);
assert.match(core, /slab_quantity/);
assert.match(ops, /vendor_invoices/);
assert.match(ops, /invoice_number_key/);
assert.match(ops, /amount_delta/);
```

Also assert Sales role contains `project_procurement.view` and not `project_procurement.manage`; Finance contains view and not broad manage.

- [ ] **Step 2: Run exact read-only production preflight SQL**

```sql
select
  to_regclass('public.customer_project_procurement_requirements') as requirements_table,
  to_regclass('public.vendor_invoices') as vendor_invoices_table;

select
  cc.id,
  cc.order_id,
  cc.order_item_id,
  cc.stone_product_id,
  cc.sink_product_id,
  cc.slab_quantity,
  cc.sqft
from public.countertop_configurations cc
order by cc.created_at desc
limit 10;

select
  vci.canonical_product_id,
  vci.vendor_code,
  vci.review_status,
  p.sku,
  pt.code as product_type_code
from public.vendor_catalog_items vci
join public.products p on p.id = vci.canonical_product_id
join public.product_types pt on pt.id = p.product_type_id
where vci.canonical_product_id is not null
  and vci.review_status = 'APPROVED'
  and pt.code in ('STONE','SINK')
order by vci.updated_at desc
limit 20;

select table_name
from information_schema.tables
where table_schema='public'
  and table_name ilike '%procurement%'
order by table_name;
```

Expected before migration: no PB-3B tables; existing Stone/Sink sources prove current derivation inputs.

- [ ] **Step 3: Run full relevant Admin verification**

```bash
cd modulex-admin
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
npm run smoke:rbac
npm run smoke:order-domain
npm run smoke:order-lifecycle
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 4: Run shared Store/Portal regressions**

```bash
cd modulex-store
npm run smoke:store-portal
npm run smoke:portal-experience
npm run smoke:portal-auth-rpc-guard
npm run smoke:gc6-cabinet-journey
npm run lint
npm run build
```

Expected: no Store/Portal code/projection change required by PB-3B.

- [ ] **Step 5: Write acceptance doc**

`docs/acceptance/pb-3b-project-procurement.md` records:

```text
spec + plan paths
migration filenames
RBAC matrix
RED -> GREEN contract evidence
Countertop 55 sqft / slab_quantity semantics
no inventory writes
no Project payment fields
shared vendor invoice / Project allocation rule
pre-merge production schema preflight
local Admin + Store verification
pending gates: owner merge -> production DDL -> rollback smoke -> Advisors -> Admin deploy/UI review
```

- [ ] **Step 6: Keep trackers active, commit, push, PR**

Update current branch/PR notes but keep PB-3B `[~]`.

```bash
git add docs/acceptance/pb-3b-project-procurement.md modulex-admin/scripts/project-procurement-contract.mjs docs/PROJECT_BASE_PLAN.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: add PB-3B procurement acceptance"
git push -u origin feat/project-procurement-pb3b
```

Create ready-for-review PR titled `feat: add PB-3B Project procurement`; body must state migrations are **NOT YET APPLIED**, all security/role boundaries, RED/GREEN evidence, and owner-owned merge/deploy gate. Do not merge.

- [ ] **Step 7: Wait for final-head CI**

Require all workflows triggered by the diff to be green. Fix only PB-3B regressions; do not sweep unrelated backlog.

---

### Task 8: Post-merge production migration, rollback-only acceptance, Advisors, deploy, and closeout

**Files:**
- Modify after evidence: `docs/acceptance/pb-3b-project-procurement.md`
- Modify after evidence: `docs/PROJECT_BASE_PLAN.md`
- Modify after evidence: `modulex-admin/ADMIN_ROADMAP.md`

**Gate:** Start only after project owner explicitly confirms the PB-3B PR is merged.

- [ ] **Step 1: Verify merged main + migration history**

Confirm current `main` contains the PB-3B migration files and PR CI is green. Confirm migrations were not applied pre-merge.

- [ ] **Step 2: Apply production migrations in order**

```text
20260904102000_customer_project_procurement_core.sql
20260904102500_customer_project_procurement_order_sync.sql
20260904103000_customer_project_procurement_operations.sql
```

If production drift blocks safe application, stop and add a forward migration; never rewrite an already-applied migration.

- [ ] **Step 3: Rollback-only Admin happy-path smoke**

Inside one explicit transaction/test identity:

```text
use/create safe Project + Draft Order fixture
confirm Project-linked Order
call sync twice and prove idempotency
for ordinary physical item prove Order quantity is used
for configured Countertop prove Stone qty = slab_quantity and Sink qty = 1
place commitment with PO + agreed cost
record partial delivery
record vendor invoice allocation
read detailed ledger
ROLLBACK
```

Assertions:

```text
55 sqft / 2 slabs => Stone required qty 2, never 55
partial delivery state correct
invoice state/cost correct
inventory_movements count unchanged
rollback leaves zero PB-3B business residue
```

- [ ] **Step 4: Rollback-only shared-invoice smoke across two Projects**

Use the same vendor + invoice number for Project A and Project B commitments. Assert one canonical `vendor_invoices` row, two effective allocations, each Project detailed read shows only its own invoice cost, aggregate allocation <= invoice header total. Roll back and prove zero residue.

- [ ] **Step 5: Rollback-only failure/role smoke**

Verify:

```text
Sales status RPC succeeds
Sales detailed RPC -> 42501
Sales mutation -> 42501
Finance detailed RPC succeeds
Finance invoice record/reversal succeeds
Finance vendor/order/delivery mutation -> 42501
Vendor Required blocks commitment
quantity above open amount rejected
over-delivery rejected
invoice currency/header mismatch rejected
invoice over-allocation rejected
cancelled Order retires current open demand while preserving historical commitment rows
```

- [ ] **Step 6: Prove no inventory side effect**

Capture relevant `inventory_movements` count before and during procurement delivery smoke; count must remain unchanged.

- [ ] **Step 7: Run Security + Performance Advisors**

Fix only PB-3B blocking RLS/grant/search-path/FK/index findings with a new forward migration. New low-traffic indexes may legitimately show `unused_index` INFO; document rather than delete prematurely.

- [ ] **Step 8: Deploy merged Admin and perform signed-in UI acceptance**

```text
Admin: detailed table + vendor/order/delivery/invoice actions
Finance: detailed cost/invoice view + invoice actions, no vendor-order/delivery ownership
Sales: sanitized status-only table, no vendor/PO/cost/invoice numbers/amounts
```

Also verify loading/empty/error/retry, modal validation, partial delivery, shared invoice number display, responsive table containment, light/dark readability.

- [ ] **Step 9: Close PB-3B only after all evidence passes**

Set PB-3B `[x]` in both trackers. Record production migration names, merge SHA, Admin deployment ID, rollback smoke results, role boundaries, Advisor outcome, and zero residue. Next package becomes PB-4 outgoing Finance / Project Expenses.

- [ ] **Step 10: Commit closeout docs in a small follow-up PR when required**

```bash
git add docs/acceptance/pb-3b-project-procurement.md docs/PROJECT_BASE_PLAN.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: close PB-3B production acceptance"
```

Do not claim package closure without production migration + deploy + acceptance evidence.
