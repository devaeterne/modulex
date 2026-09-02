# Countertop Replace / Remove Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized Admin users replace or remove an already configured Countertop on a Draft order without weakening the generic order-revision safety guards.

**Architecture:** Replacement reuses the existing `customer_order_items.id` and the existing `CountertopConfigurator` → `attach_countertop_configuration` path, so no temporary unconfigured Countertop line is created. Removal uses a new authenticated public RPC backed by a private `SECURITY DEFINER` function that is Draft-only, validates a real `countertop_configurations` row, relies on the existing reservation-release trigger, reconciles line numbers/totals, and records `customer_activity` atomically.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Supabase Postgres + PostgREST RPC, existing Modulex Admin shared UI primitives, Node `.mjs` contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-countertop-replace-remove-design.md`

## Global Constraints

- Do not weaken or delete the existing generic revision errors `Configured countertop lines must be changed in the countertop configurator.` and `Configured countertop lines cannot be removed in a generic revision.`
- Replace and Remove are direct Countertop mutations only while the parent order is `draft`.
- Replace preserves the existing `order_item_id` and uses the existing authoritative `calculate_countertop_price` + `attach_countertop_configuration` path.
- Remove must be one transaction and must not expose direct browser DELETE access to `customer_order_items` or `countertop_configurations`.
- Existing reservation triggers remain authoritative; do not create a second reservation engine.
- Existing Cabinet and Service revision behavior remains unchanged.
- Feature UI must use Modulex shared `Button`, `Modal`, `Input`, `Alert`, `FormHint`, `Table` primitives and pass the diff-aware Admin UI strict gate. Do not add feature-local color/background/border/radius/shadow/dark-mode appearance classes.
- The SQL migration is source-controlled and mirrored under `modulex-store/supabase/migrations`, but is not applied to production before merge unless explicitly requested.
- No Store public/Customer/Dealer projection behavior changes in this package.
- Update `modulex-admin/ADMIN_ROADMAP.md` in the same PR before calling the package complete.

---

### Task 1: Add a focused RED contract for Countertop replacement/removal

**Files:**
- Create: `modulex-admin/scripts/order-countertop-replace-remove-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Consumes: existing `EditCustomerOrder`, `CountertopConfigurator`, `order-domain.ts`, generic order-update SQL, and the new SQL/migration paths defined by this plan.
- Produces: `npm run smoke:order-countertop-replace-remove`, also included in `smoke:a1-core-operations`.

- [ ] **Step 1: Create the failing contract**

Create `modulex-admin/scripts/order-countertop-replace-remove-contract.mjs` with these assertions:

```js
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const canonicalSqlPath = "sql/countertop-replace-remove.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260902114500_countertop_replace_remove.sql";
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const orderDomain = read("src/lib/customers/order-domain.ts");
const orderEditing = read("sql/customer-order-editing.sql");
const revisionMigration = read("../modulex-store/supabase/migrations/20260901090000_customer_order_revision_identity.sql");

assert(exists(canonicalSqlPath), "canonical Countertop replace/remove SQL is required");
assert(exists(migrationPath), "shared Supabase migration mirror is required");

for (const sqlPath of [canonicalSqlPath, migrationPath]) {
  const sql = read(sqlPath);
  for (const token of [
    "private.remove_countertop_order_item",
    "public.remove_countertop_order_item",
    "current_user_has_any_role(array['super_admin','admin','sales'])",
    "countertop_configurations",
    "delete from public.customer_order_items",
    "customer_activity",
    "Countertop removed",
    "authenticated",
  ]) assert(sql.includes(token), `${sqlPath} missing ${token}`);
  assert(/status\s*<>\s*'draft'/i.test(sql), `${sqlPath} must reject non-Draft removal`);
  assert(/security definer/i.test(sql), `${sqlPath} must keep the privileged mutation private`);
  assert(/revoke all on function public\.remove_countertop_order_item[\s\S]*from public, anon/i.test(sql), `${sqlPath} must revoke public/anon execute`);
  assert(/grant execute on function public\.remove_countertop_order_item[\s\S]*to authenticated/i.test(sql), `${sqlPath} must grant the reviewed wrapper to authenticated`);
}

for (const token of ["Replace Countertop", "Remove Countertop", "CountertopConfigurator", "orderItemId", "Modal", "removeCountertopOrderItem"]) {
  assert(editOrder.includes(token), `Edit Order Countertop workflow missing ${token}`);
}
assert(orderDomain.includes("export async function removeCountertopOrderItem"), "order domain must own Countertop removal");
assert(orderDomain.includes('.rpc("remove_countertop_order_item"'), "order domain must call the dedicated removal RPC");
assert(!editOrder.includes('.rpc("remove_countertop_order_item"'), "Edit Order must not bypass the order domain adapter");

for (const source of [orderEditing, revisionMigration]) {
  assert(source.includes("Configured countertop lines cannot be removed in a generic revision."), "generic configured-Countertop removal guard must remain fail-closed");
}

console.log("Order Countertop replace/remove contract: PASS");
```

- [ ] **Step 2: Wire the new script into package scripts**

Add:

```json
"smoke:order-countertop-replace-remove": "node scripts/order-countertop-replace-remove-contract.mjs"
```

and append `&& npm run smoke:order-countertop-replace-remove` to `smoke:a1-core-operations`.

- [ ] **Step 3: Run the new contract and prove RED**

Run from `modulex-admin`:

```bash
npm run smoke:order-countertop-replace-remove
```

Expected: FAIL because `sql/countertop-replace-remove.sql` and the mirrored migration do not exist yet and the UI/domain adapter do not expose the new workflow.

- [ ] **Step 4: Commit the RED state**

```bash
git add modulex-admin/scripts/order-countertop-replace-remove-contract.mjs modulex-admin/package.json
git commit -m "test: define countertop replace and remove contract"
```

---

### Task 2: Add the transaction-safe Countertop removal RPC

**Files:**
- Create: `modulex-admin/sql/countertop-replace-remove.sql`
- Create: `modulex-store/supabase/migrations/20260902114500_countertop_replace_remove.sql`

**Interfaces:**
- Produces: `public.remove_countertop_order_item(p_order_item_id uuid, p_reason text default null) returns uuid`.
- Delegates to: `private.remove_countertop_order_item(uuid, text) returns uuid`.
- Relies on: `countertop_configurations.order_item_id -> customer_order_items.id ON DELETE CASCADE`, `trg_customer_order_item_release_on_delete`, existing `customer_orders` tax/commission fields, and `customer_activity`.

- [ ] **Step 1: Inspect the reservation release trigger before writing the delete boundary**

Read `private.release_order_item_reservation_trigger()` in the current schema/migrations and verify its DELETE branch consumes the old item identity and Countertop reservation quantity. Do not change the trigger unless this inspection proves the existing trigger cannot safely release a Draft Countertop reservation.

- [ ] **Step 2: Implement the private removal function**

Both SQL files must contain the same functional definition. Use this boundary:

```sql
create or replace function private.remove_countertop_order_item(
  p_order_item_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.customer_order_items%rowtype;
  v_order public.customer_orders%rowtype;
  v_config public.countertop_configurations%rowtype;
  v_offset integer;
  v_line_no integer := 0;
  v_row record;
  v_order_subtotal numeric(18,4);
  v_taxable numeric(18,4);
  v_tax_amount numeric(18,4);
  v_total numeric(18,4);
  v_commission_amount numeric(18,4);
  v_grand_total numeric(18,4);
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to remove countertop order items.' using errcode = '42501';
  end if;

  select oi.* into v_item
  from public.customer_order_items oi
  where oi.id = p_order_item_id
  for update;

  if v_item.id is null then
    raise exception 'Countertop order item not found.';
  end if;

  select o.* into v_order
  from public.customer_orders o
  where o.id = v_item.order_id
  for update;

  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status <> 'draft' then
    raise exception 'Countertop order items can only be removed from draft orders.';
  end if;

  select c.* into v_config
  from public.countertop_configurations c
  where c.order_item_id = p_order_item_id
  for update;

  if v_config.id is null then
    raise exception 'Order item is not a configured countertop.';
  end if;

  delete from public.customer_order_items
  where id = p_order_item_id;

  select coalesce(max(line_no), 0) + count(*) + 1000
    into v_offset
  from public.customer_order_items
  where order_id = v_order.id;

  update public.customer_order_items
  set line_no = line_no + v_offset
  where order_id = v_order.id;

  for v_row in
    select id from public.customer_order_items
    where order_id = v_order.id
    order by line_no, id
  loop
    v_line_no := v_line_no + 1;
    update public.customer_order_items set line_no = v_line_no where id = v_row.id;
  end loop;

  select coalesce(sum(i.line_total), 0)
    into v_order_subtotal
  from public.customer_order_items i
  where i.order_id = v_order.id;

  if coalesce(v_order.discount_amount, 0) > v_order_subtotal then
    raise exception 'Order discount cannot exceed subtotal.';
  end if;

  v_taxable := greatest(v_order_subtotal - coalesce(v_order.discount_amount, 0), 0);
  v_tax_amount := round(v_taxable * (coalesce(v_order.tax_rate, 0) / 100), 4);
  v_total := round(v_taxable + v_tax_amount, 4);
  v_commission_amount := round(v_total * (coalesce(v_order.payment_commission_percent, 0) / 100), 4);
  v_grand_total := round(v_total + v_commission_amount, 4);

  update public.customer_orders
  set item_count = (select count(*) from public.customer_order_items where order_id = v_order.id),
      subtotal = round(v_order_subtotal, 4),
      tax_amount = v_tax_amount,
      total_amount = v_total,
      payment_commission_amount = v_commission_amount,
      grand_total = v_grand_total
  where id = v_order.id;

  insert into public.customer_activity(customer_id, activity_type, title, description, metadata)
  values (
    v_order.customer_id,
    'order_updated',
    'Countertop removed',
    v_order.order_number || ' countertop line ' || v_item.line_no || ' removed',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_item_id', v_item.id,
      'line_no', v_item.line_no,
      'sku', v_item.sku_snapshot,
      'product_name', v_item.product_name_snapshot,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'countertop_snapshot', v_config.pricing_snapshot
    )
  );

  return v_order.id;
end;
$$;
```

When implementing, preserve equivalent semantics if a current canonical helper already exists for total reconciliation; prefer calling that reviewed helper instead of duplicating formulas only if its signature is safe and it is already used for order-item deletion.

- [ ] **Step 3: Add the public wrapper and least-privilege grants**

```sql
create or replace function public.remove_countertop_order_item(
  p_order_item_id uuid,
  p_reason text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.remove_countertop_order_item($1, $2);
$$;

revoke all on function private.remove_countertop_order_item(uuid,text) from public, anon, authenticated;
grant execute on function private.remove_countertop_order_item(uuid,text) to authenticated;
revoke all on function public.remove_countertop_order_item(uuid,text) from public, anon;
grant execute on function public.remove_countertop_order_item(uuid,text) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the focused contract**

```bash
npm run smoke:order-countertop-replace-remove
```

Expected: still FAIL on missing domain/UI behavior, while SQL assertions pass.

- [ ] **Step 5: Commit the DB boundary**

```bash
git add modulex-admin/sql/countertop-replace-remove.sql modulex-store/supabase/migrations/20260902114500_countertop_replace_remove.sql
git commit -m "feat: add safe countertop removal rpc"
```

Do **not** apply this migration to production in this task.

---

### Task 3: Centralize removal in the Order domain adapter

**Files:**
- Modify: `modulex-admin/src/lib/customers/order-domain.ts`
- Modify: `modulex-admin/scripts/order-domain-contract.mjs`

**Interfaces:**
- Produces: `removeCountertopOrderItem(orderItemId: string, reason?: string | null): Promise<string>`.
- Consumes: `public.remove_countertop_order_item`.

- [ ] **Step 1: Extend the order-domain contract first**

Add `removeCountertopOrderItem` to the exported-function list in `scripts/order-domain-contract.mjs` and add:

```js
assert(domain.includes('.rpc("remove_countertop_order_item"'), "order domain adapter must own configured Countertop removal");
assert(!editOrder.includes('.rpc("remove_countertop_order_item"'), "Edit Order must not call configured Countertop removal RPC directly");
```

- [ ] **Step 2: Run the domain contract and prove RED**

```bash
npm run smoke:order-domain
```

Expected: FAIL because `removeCountertopOrderItem` is not exported yet.

- [ ] **Step 3: Add the domain function**

In `src/lib/customers/order-domain.ts`:

```ts
export async function removeCountertopOrderItem(orderItemId: string, reason?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc("remove_countertop_order_item", {
    p_order_item_id: orderItemId,
    p_reason: nullableText(reason),
  });

  if (error) throw error;
  return String(data);
}
```

- [ ] **Step 4: Run both focused contracts**

```bash
npm run smoke:order-domain
npm run smoke:order-countertop-replace-remove
```

Expected: order-domain PASS; replace/remove still FAIL only on missing UI tokens/behavior.

- [ ] **Step 5: Commit the domain adapter**

```bash
git add modulex-admin/src/lib/customers/order-domain.ts modulex-admin/scripts/order-domain-contract.mjs
git commit -m "feat: expose countertop removal through order domain"
```

---

### Task 4: Add Replace + Remove UI without exposing the generic removal path

**Files:**
- Modify: `modulex-admin/src/components/customers/EditCustomerOrder.tsx`
- Reuse without redesign: `modulex-admin/src/components/countertop/CountertopConfigurator.tsx`

**Interfaces:**
- Consumes: `removeCountertopOrderItem`, existing `CountertopConfigurator({ orderId, orderItemId, orderContext, onAttached, onClose })`.
- Produces: configured Countertop row actions `Replace Countertop` and `Remove Countertop` for Draft orders only.

- [ ] **Step 1: Import the shared modal and removal adapter**

Add:

```ts
import { Modal } from "@/components/ui/modal";
```

and include `removeCountertopOrderItem` in the existing order-domain import.

- [ ] **Step 2: Add explicit workflow state**

Use state with domain identity rather than table indexes:

```ts
const [replaceCountertopItemId, setReplaceCountertopItemId] = useState<string | null>(null);
const [removeCountertopTarget, setRemoveCountertopTarget] = useState<{ id: string; sku: string; name: string } | null>(null);
const [countertopRemovalReason, setCountertopRemovalReason] = useState("");
const [isRemovingCountertop, setIsRemovingCountertop] = useState(false);
```

Keep the existing `isCountertopOpen` state for adding a brand-new Countertop.

- [ ] **Step 3: Make attach refresh preserve unsaved form fields**

Refactor the existing `handleCountertopAttached` reload to update only authoritative order-line state needed by the Countertop mutation:

```ts
async function refreshCountertopOrderLines() {
  const context = await loadEditOrderContext(customerId, orderId);
  setOrder(context.order);
  setProducts(context.products as Product[]);
  setCountertopSummaries(context.countertopSummaries);
  setItems(context.items.map(mapDraftItem));
  return context;
}
```

Do not reset local `priceGroupId`, addresses, notes, tax, discounts, payment method, commission, expected date, or revision reason here; those may contain unsaved revision edits.

Update `handleCountertopAttached` to call the helper, close both add/replace editors, and surface the real error message on failure.

- [ ] **Step 4: Add the dedicated removal handler**

```ts
async function confirmCountertopRemoval() {
  if (!removeCountertopTarget) return;
  setErrorMessage(null);
  setIsRemovingCountertop(true);
  try {
    await removeCountertopOrderItem(removeCountertopTarget.id, countertopRemovalReason);
    await refreshCountertopOrderLines();
    setRemoveCountertopTarget(null);
    setCountertopRemovalReason("");
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : "Unable to remove the configured Countertop.");
  } finally {
    setIsRemovingCountertop(false);
  }
}
```

- [ ] **Step 5: Replace the configured Countertop row action branch**

Inside each product row derive:

```ts
const isConfiguredCountertop = model === "countertop_material_band" && Boolean(item.id && countertopSummary);
const canMutateConfiguredCountertop = isConfiguredCountertop && order.status === "draft" && canManageCountertop;
```

Action behavior:

```tsx
{isService ? <Button size="sm" variant="outline" onClick={() => openExistingService(index)}>Edit Service</Button> : null}
{canMutateConfiguredCountertop && item.id ? (
  <>
    <Button size="sm" variant="outline" onClick={() => setReplaceCountertopItemId(item.id)}>Replace Countertop</Button>
    <Button
      size="sm"
      variant="danger"
      onClick={() => setRemoveCountertopTarget({
        id: item.id!,
        sku: product?.sku ?? "Countertop",
        name: product?.name ?? "Configured Countertop",
      })}
    >
      Remove Countertop
    </Button>
  </>
) : isConfiguredCountertop ? (
  <FormHint>Countertop configuration changes are available on Draft orders only.</FormHint>
) : (
  <Button size="sm" variant="danger" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
)}
```

This is the critical fail-closed UI rule: a configured Countertop never falls through to generic `Remove`, even when the order is Confirmed or otherwise not directly mutable.

Also show the header-level **Countertop** add action only when `order.status === "draft" && canManageCountertop`.

- [ ] **Step 6: Render the replacement configurator against the existing item ID**

```tsx
{replaceCountertopItemId ? (
  <CountertopConfigurator
    orderId={order.id}
    orderItemId={replaceCountertopItemId}
    orderContext={{
      orderNumber: order.order_number,
      lineNo: items.findIndex((item) => item.id === replaceCountertopItemId) + 1,
      sku: productMap.get(items.find((item) => item.id === replaceCountertopItemId)?.product_id ?? "")?.sku,
      productName: productMap.get(items.find((item) => item.id === replaceCountertopItemId)?.product_id ?? "")?.name,
    }}
    onAttached={handleCountertopAttached}
    onClose={() => setReplaceCountertopItemId(null)}
  />
) : null}
```

The implementation may compute the selected item/product in a memo for readability; the invariant is that `orderItemId` is the existing configured line identity.

- [ ] **Step 7: Add shared Modal confirmation for removal**

Use only shared primitives and layout classes:

```tsx
<Modal
  isOpen={Boolean(removeCountertopTarget)}
  onClose={() => {
    if (isRemovingCountertop) return;
    setRemoveCountertopTarget(null);
    setCountertopRemovalReason("");
  }}
  className="w-full max-w-xl p-6"
  ariaLabel="Remove configured Countertop"
>
  <div className="space-y-5">
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Remove Countertop</h3>
      <FormHint>
        This immediately removes the configured Countertop from this Draft order and releases its reservation. The action is recorded in customer activity.
      </FormHint>
      {removeCountertopTarget ? <FormHint>{removeCountertopTarget.sku} · {removeCountertopTarget.name}</FormHint> : null}
    </div>
    <Field label="Removal reason" hint="Optional; saved with the activity record.">
      <Input value={countertopRemovalReason} onChange={(event) => setCountertopRemovalReason(event.target.value)} />
    </Field>
    <div className="flex justify-end gap-2">
      <Button variant="outline" disabled={isRemovingCountertop} onClick={() => {
        setRemoveCountertopTarget(null);
        setCountertopRemovalReason("");
      }}>Cancel</Button>
      <Button variant="danger" disabled={isRemovingCountertop} onClick={confirmCountertopRemoval}>
        {isRemovingCountertop ? "Removing…" : "Remove Countertop"}
      </Button>
    </div>
  </div>
</Modal>
```

If strict UI flags the modal heading appearance, use an existing shared heading/section primitive rather than adding route-local appearance tokens.

- [ ] **Step 8: Run the focused and UI contracts**

```bash
npm run smoke:order-countertop-replace-remove
npm run smoke:order-domain
npm run smoke:countertop-domain
npm run smoke:countertop-ui
npm run smoke:admin-ui-strict:self-test
ADMIN_UI_STRICT_FILES=src/components/customers/EditCustomerOrder.tsx npm run smoke:admin-ui-strict
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 9: Commit the UI workflow**

```bash
git add modulex-admin/src/components/customers/EditCustomerOrder.tsx
git commit -m "feat: add countertop replace and remove actions"
```

---

### Task 5: Verify SQL behavior without mutating production

**Files:**
- Review only: the two new SQL files.
- Optional acceptance record if useful: `modulex-admin/docs/acceptance/countertop-replace-remove.md`.

**Interfaces:**
- Verifies the migration source and current production prerequisites. It does not apply the new migration before merge.

- [ ] **Step 1: Run read-only production prerequisite checks**

Verify in production Supabase:

```sql
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.countertop_configurations'::regclass
  and conname = 'countertop_configurations_order_item_id_fkey';
```

Expected: `ON DELETE CASCADE`.

Verify the DELETE release trigger exists on `customer_order_items` and inspect `private.release_order_item_reservation_trigger()` to confirm the current Countertop reservation quantity path is used.

- [ ] **Step 2: Validate SQL syntax/security structurally through contract and source review**

Run:

```bash
npm run smoke:order-countertop-replace-remove
npm run smoke:countertop-domain
```

Expected: PASS. Do not call `apply_migration` yet.

- [ ] **Step 3: Record pre-merge migration status**

Roadmap/PR wording must explicitly say:

```text
Migration 20260902114500_countertop_replace_remove is source-controlled but intentionally unapplied before merge. Production currently retains the existing fail-closed generic revision behavior until this PR is merged and the migration is applied.
```

---

### Task 6: Full regression, roadmap closeout, and PR handoff

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- No functional Store roadmap status mutation unless implementation unexpectedly changes Store runtime/projections.

**Interfaces:**
- Produces: review-ready PR from `feat/countertop-replace-remove` to `main`; no merge.

- [ ] **Step 1: Run the complete relevant local/CI-equivalent verification**

From `modulex-admin`:

```bash
npm run smoke:order-countertop-replace-remove
npm run smoke:a1-core-operations
npm run smoke:order-domain
npm run smoke:order-lifecycle
npm run smoke:countertop-domain
npm run smoke:countertop-ui
npm run smoke:admin-ui-strict:self-test
npm run smoke:admin-ui-strict
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key npm run build
```

Expected: all PASS with no new lint errors.

- [ ] **Step 2: Update Admin roadmap in the same branch**

Under A1.2 Orders or the Countertop/Stone/Sink follow-up, add an in-progress entry stating:

```markdown
- [~] Add explicit configured Countertop replace/remove workflow to Draft order revisions.
  - Replace preserves the existing order item identity and reuses canonical Countertop pricing/attach.
  - Remove uses a dedicated Draft-only authenticated RPC; generic order revision guards remain fail-closed.
  - Migration `20260902114500_countertop_replace_remove` is source-controlled but intentionally unapplied before merge.
  - Store public/Customer/Dealer projections are unchanged; the shared migration directory contains only the DB deployment mirror.
```

After branch CI is green, append the exact workflow run IDs and keep `[~]` until post-merge production migration/advisor/deploy acceptance. Do not mark `[x]` before production DDL and signed-in acceptance are completed.

- [ ] **Step 3: Commit roadmap evidence**

```bash
git add modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: track countertop replace and remove rollout"
```

- [ ] **Step 4: Open the PR**

PR title:

```text
feat: add countertop replace and remove workflow
```

PR body must include:

```markdown
## What changed
- Configured Draft Countertops now expose Replace Countertop and Remove Countertop instead of generic Remove.
- Replace keeps the existing order_item_id and uses the canonical configurator/attach path.
- Remove uses a dedicated Draft-only authenticated RPC, releases reservation through the existing trigger, reconciles totals/line numbers, and records customer activity.
- Generic update_customer_order Countertop guards remain unchanged.

## Database
- Adds migration `20260902114500_countertop_replace_remove`.
- Migration is intentionally NOT applied to production before merge.
- No Store public/Customer/Dealer projection changes.

## Verification
- Include exact passing contract/typecheck/lint/build/Actions run IDs.

## After merge
1. Apply `20260902114500_countertop_replace_remove` to production Supabase.
2. Run Supabase Security Advisor and Performance Advisor.
3. Signed-in smoke: Draft configured Countertop Replace preserves item ID; Remove deletes configuration/item, releases reservation, reconciles totals, and writes activity.
```

- [ ] **Step 5: Wait for GitHub Actions and debug any failures systematically**

Relevant expected workflows include at least Admin A1 Core Operations, Admin Customers UI, and Admin UI Foundation when their path filters match. For any failure, inspect the failing job/step logs, identify one root cause, make the smallest corrective commit, and rerun. Do not weaken contracts to make CI green.

- [ ] **Step 6: Final pre-handoff verification**

Confirm the PR is open, mergeable, and all feature-relevant CI is green. Confirm migration is still unapplied to production. Do not merge.

- [ ] **Step 7: Handoff to the user**

Report the PR number/link, the exact workflow evidence, and state clearly:

```text
Migration is included but intentionally not applied yet. After you merge, I can apply it and run the Supabase advisor + signed-in acceptance checks.
```
