# Order Manual Service Line Implementation Plan

**Goal:** Add a first-class manual Service order line with required service detail, manual price, no stock reservation, and immutable order/invoice line-note snapshots, while changing Products actions to shared SVG-plus `Countertop`, `Cabinet`, and `Service` buttons.

**Architecture:** Keep Service inside the existing product-oriented order/invoice model by seeding one canonical `SERVICE` product and giving its Product Type a dedicated `manual_service` pricing route. The database remains authoritative for validation, pricing, totals, stock exclusion, and invoice snapshot copying. New/Edit Order share one Service modal and one line-detail presentation instead of duplicating business rules.

**Tech Stack:** Next.js/React/TypeScript, Supabase Postgres + RPC/trigger migrations, shared Admin UI primitives, Node contract tests, GitHub Actions.

**Design:** `modulex-admin/docs/superpowers/specs/2026-09-01-order-manual-service-line-design.md`

---

## Task 1 — Lock the Service contract RED

**Files**
- Create: `modulex-admin/scripts/order-manual-service-line-contract.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `.github/workflows/admin-ui-foundation.yml`

**Step 1: Write the failing contract**

Assert all approved behavior before production code exists:

- migration contains `manual_service`, `customer_order_items.line_note`, `customer_invoice_items.line_note`, stable `SERVICE` Product Type/product seeding, active `PIECE` UOM lookup, PostgREST reload, and no hardcoded generated UOM UUID;
- server-side Service rules require nonblank `line_note`, explicit nonnegative manual price, quantity exactly `1`, `price_source='manual'`, no Price Group lookup, and inventory skip;
- invoice creation copies `line_note` from order item to invoice item;
- New/Edit Order use shared `PlusIcon` and visible labels `Countertop`, `Cabinet`, `Service`; reject literal `+` text and old `Add Countertop` / `Add Products` labels;
- Cabinet picker excludes Product Type codes `STONE`, `SINK`, and `SERVICE`;
- shared Service modal uses `Modal`, `Label`, `TextArea`, `Input`, `Button` and requires detail + price;
- Order Edit/Detail/Print and Invoice Detail/Print render the historical line note.

**Step 2: Register the smoke command**

Add `smoke:order-manual-service-line` to `modulex-admin/package.json` and run it in `.github/workflows/admin-ui-foundation.yml` after the existing Countertop/order contracts.

**Step 3: Verify RED**

Run:

```bash
cd modulex-admin
npm run smoke:order-manual-service-line
```

Expected: FAIL because the migration, Service modal, `line_note`, and Service rendering do not exist yet.

**Step 4: Commit RED**

```bash
git add modulex-admin/scripts/order-manual-service-line-contract.mjs modulex-admin/package.json .github/workflows/admin-ui-foundation.yml
git commit -m "test(admin): define manual service line contract"
```

---

## Task 2 — Add the database domain route and reference data

**Files**
- Create: `modulex-store/supabase/migrations/20260902000000_order_manual_service_line.sql`
- Test: `modulex-admin/scripts/order-manual-service-line-contract.mjs`

**Step 1: Extend the pricing-model domain additively**

In the migration:

- replace `product_types_pricing_model_check` with the existing values plus `manual_service`;
- add nullable `line_note text` to `public.customer_order_items` and `public.customer_invoice_items`;
- resolve active UOM by stable code `PIECE`; fail closed if missing;
- upsert Product Type `SERVICE` / `Service` with pricing model `manual_service` and the resolved UOM;
- upsert one active product SKU/name `SERVICE` / `Service` using stable SKU/code, not generated IDs;
- do **not** create a Product Group price for `SERVICE`.

**Step 2: Make order-item pricing authoritative for `manual_service`**

Update the current canonical trigger/function definitions without changing their unrelated semantics:

- `private.enforce_customer_order_item_pricing_v2()`:
  - preserve product/type/UOM snapshot behavior;
  - for `manual_service`, require trimmed `line_note`, quantity exactly `1`, explicit `unit_price >= 0`, and force `price_source='manual'`;
  - calculate `line_subtotal`, existing line discount, and `line_total` server-side;
  - return before Price Group lookup;
  - keep Countertop gate and standard Price Group route unchanged.
- preserve `private.guard_customer_order_item_trigger()` compatibility, but ensure it does not reinterpret the Service line as Price Group priced.

**Step 3: Update create/update order JSON parsing**

Replace the exact current definitions of the canonical create/update functions while preserving signatures, authorization, fulfillment/status behavior, search paths, grants, revisions, and existing financial rules:

- `private.create_customer_order_core(...)` must parse `line_note`, copy it into the insert, and require explicit `unit_price` for `manual_service`;
- current `private.create_customer_order(...)` / `public.create_customer_order(...)` wrappers remain compatible;
- both current `private.update_customer_order(...)` overloads and the public wrapper must preserve `line_note` and the explicit Service amount through `p_items`;
- standard Price Group lines must remain server authoritative and Countertop lines must remain Countertop-workspace authoritative.

**Step 4: Exclude Service from stock**

Update the current reservation/release trigger functions:

- `private.reserve_order_item_trigger()` returns without reservation when `pricing_model_snapshot='manual_service'`;
- `private.release_order_item_reservation_trigger()` skips release for Service on delete/update;
- do not introduce inventory movement/reservation rows for Service.

**Step 5: Snapshot Service detail into invoices**

Update `private.create_customer_invoice_from_order(...)` so the `customer_invoice_items` insert includes `line_note` copied exactly from `customer_order_items.line_note`. Preserve invoice authorization/status/due-date/totals behavior and grants.

Finish with:

```sql
notify pgrst, 'reload schema';
```

**Step 6: Verify SQL in rollback-only mode before any production deploy**

Apply the migration SQL inside a transaction on a disposable/dev context or production connection with `BEGIN ... ROLLBACK` only. Verify:

- SERVICE type/product resolve by stable code/SKU;
- `$10` Service + nonblank detail is accepted and totals to `$10` before tax/commission;
- blank detail fails;
- absent/negative price fails;
- quantity other than `1` fails;
- no inventory reservation/movement is created;
- standard Price Group product still resolves from Price Group;
- Countertop line still requires Countertop route;
- invoice snapshot receives the exact `line_note`.

Do **not** apply this migration to production in the implementation package without a separate explicit deployment authorization.

**Step 7: Run contract**

```bash
cd modulex-admin
npm run smoke:order-manual-service-line
```

Expected: still RED on UI assertions, but DB-domain assertions GREEN.

**Step 8: Commit**

```bash
git add modulex-store/supabase/migrations/20260902000000_order_manual_service_line.sql
git commit -m "feat(orders): add manual service pricing route"
```

---

## Task 3 — Make the client order model represent Service explicitly

**Files**
- Modify: `modulex-admin/src/lib/customers/order-domain.ts`
- Modify: `modulex-admin/src/lib/customers/types.ts`
- Modify: `modulex-admin/scripts/order-domain-contract.mjs`
- Modify: `modulex-admin/scripts/order-product-pricing-v2-contract.mjs`

**Step 1: Write/extend failing domain assertions**

Require the client payload to carry `line_note` and explicit manual `unit_price` only for the canonical Service route while preserving existing Countertop/Price Group payload behavior.

**Step 2: Extend types without weakening ordinary-product pricing**

Represent order draft items with optional historical `line_note`, product-type/pricing-model snapshots, and explicit Service amount. Prefer a discriminated/helper-based shape so ordinary Cabinet products cannot accidentally serialize a browser-authored manual price.

**Step 3: Update serialization/hydration**

- serialize `line_note` for Service;
- serialize `unit_price` only for Service/manual-service path;
- hydrate existing Service items from saved order data so Edit Order preserves detail and amount;
- preserve Countertop snapshot handling and current Price Group behavior.

**Step 4: Verify**

```bash
cd modulex-admin
npm run smoke:order-domain
npm run smoke:order-product-pricing-v2
```

Expected: PASS.

**Step 5: Commit**

```bash
git add modulex-admin/src/lib/customers/order-domain.ts modulex-admin/src/lib/customers/types.ts modulex-admin/scripts/order-domain-contract.mjs modulex-admin/scripts/order-product-pricing-v2-contract.mjs
git commit -m "feat(admin): model manual service order lines"
```

---

## Task 4 — Build one shared Service entry interaction

**Files**
- Create: `modulex-admin/src/components/customers/ManualServiceLineModal.tsx`
- Create: `modulex-admin/src/components/customers/ServiceLineDetails.tsx`
- Modify: `modulex-admin/scripts/order-manual-service-line-contract.mjs`

**Step 1: Implement `ManualServiceLineModal` with shared primitives only**

Use:

- `Modal` from `src/components/ui/modal`;
- `Label`;
- `TextArea`;
- `Input`;
- `Button`;
- existing shared Alert/FormHint only if validation feedback needs them.

Props should provide `isOpen`, currency code, initial values for edit when needed, `onClose`, and `onSubmit({ lineNote, unitPrice })`.

Validation before submit:

- `lineNote.trim()` required;
- price required, numeric, finite, `>= 0`;
- quantity is never exposed and is always generated as `1` by the caller/server.

Do not put route-local color/dark-mode classes in the feature component.

**Step 2: Implement `ServiceLineDetails`**

Render the saved historical `line_note` as secondary line detail using existing shared typography/hint primitives; do not fetch a live product description.

**Step 3: Verify strict UI**

```bash
cd modulex-admin
npm run smoke:admin-ui-strict:self-test
npm run smoke:order-manual-service-line
```

Expected: contract remains RED only where New/Edit/Detail/Invoice integration is not yet wired.

**Step 4: Commit**

```bash
git add modulex-admin/src/components/customers/ManualServiceLineModal.tsx modulex-admin/src/components/customers/ServiceLineDetails.tsx modulex-admin/scripts/order-manual-service-line-contract.mjs
git commit -m "feat(admin): add manual service line controls"
```

---

## Task 5 — Change New Order to `Countertop / Cabinet / Service`

**Files**
- Modify: `modulex-admin/src/components/customers/NewCustomerOrder.tsx`
- Modify: `modulex-admin/src/components/customers/OrderProductPicker.tsx`
- Modify: `modulex-admin/scripts/customers-ui-contract.mjs`
- Modify: `modulex-admin/scripts/order-manual-service-line-contract.mjs`

**Step 1: Replace Products actions**

Use shared `PlusIcon` from `@/icons` inside existing shared Buttons. Visible labels are exactly:

- `Countertop`
- `Cabinet`
- `Service`

Do not render the word `Add`; do not render a literal text `+`.

**Step 2: Make Cabinet picker explicit**

Extend `OrderProductPicker` with a product-type exclusion contract and use it from New Order to exclude `STONE`, `SINK`, and `SERVICE`. Preserve existing search/pagination/Price Group behavior for eligible Cabinet products.

**Step 3: Add Service flow**

- resolve the canonical active `SERVICE` product by stable SKU/type, fail closed if reference data is missing;
- open `ManualServiceLineModal`;
- append one draft line with Service product id, quantity `1`, manual price, discount default `0`, and required `line_note`;
- render `ServiceLineDetails` under `SERVICE / Service` in the Products table;
- keep quantity visually fixed/noneditable for Service; preserve existing quantity editing for Cabinet products.

**Step 4: Verify**

```bash
cd modulex-admin
npm run smoke:order-manual-service-line
npm run smoke:customers-ui
npm run smoke:order-countertop-initiation
```

Expected: New Order assertions PASS; remaining Edit/Invoice assertions may still be RED.

**Step 5: Commit**

```bash
git add modulex-admin/src/components/customers/NewCustomerOrder.tsx modulex-admin/src/components/customers/OrderProductPicker.tsx modulex-admin/scripts/customers-ui-contract.mjs modulex-admin/scripts/order-manual-service-line-contract.mjs
git commit -m "feat(admin): add Service action to new orders"
```

---

## Task 6 — Add the same Service behavior to Edit Order

**Files**
- Modify: `modulex-admin/src/components/customers/EditCustomerOrder.tsx`
- Modify: `modulex-admin/scripts/order-manual-service-line-contract.mjs`
- Modify: `modulex-admin/scripts/order-lifecycle-editability-contract.mjs`

**Step 1: Hydrate Service lines**

Load/preserve `line_note`, `unit_price`, pricing-model snapshot, and canonical Service identity from the saved order. Existing Service detail must survive opening/saving a Draft order without being rebuilt from live catalog text.

**Step 2: Mirror the three compact actions**

Use the same shared `PlusIcon` + `Countertop`, `Cabinet`, `Service` labels and the same Cabinet exclusions as New Order.

**Step 3: Reuse the Service modal**

Add new Service lines through `ManualServiceLineModal`; when editing Service detail/price, keep qty fixed at `1` and submit through canonical order update RPC. Do not add a direct table mutation.

**Step 4: Preserve Countertop behavior**

Keep `Configure Countertop`, historical Countertop snapshot hydration, Draft-only editability, and existing permissions unchanged.

**Step 5: Verify**

```bash
cd modulex-admin
npm run smoke:order-manual-service-line
npm run smoke:order-lifecycle-editability
npm run smoke:order-countertop-context
```

Expected: PASS for New/Edit/Countertop lifecycle portions.

**Step 6: Commit**

```bash
git add modulex-admin/src/components/customers/EditCustomerOrder.tsx modulex-admin/scripts/order-manual-service-line-contract.mjs modulex-admin/scripts/order-lifecycle-editability-contract.mjs
git commit -m "feat(admin): support Service lines in order editing"
```

---

## Task 7 — Show historical Service detail everywhere commercial documents expose the line

**Files**
- Modify: `modulex-admin/src/components/customers/CustomerOrderDetail.tsx`
- Modify: `modulex-admin/src/components/customers/CustomerOrderPrint.tsx`
- Modify: `modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx`
- Modify: `modulex-admin/src/components/customers/CustomerInvoicePrint.tsx`
- Modify: `modulex-admin/src/lib/customers/types.ts`
- Modify: `modulex-admin/scripts/order-manual-service-line-contract.mjs`

**Step 1: Include `line_note` in reads/types**

Update relevant order/invoice item selects/types so historical `line_note` is loaded from the saved order or invoice item.

**Step 2: Render Order detail + print**

For Service lines, show saved `line_note` directly beneath the Service product name. The printed order must carry the same detail because the user expects the service description on the customer-facing order.

**Step 3: Render Invoice detail + print**

Show `customer_invoice_items.line_note` beneath `Service`; never look back to the mutable order or live product description once an invoice exists.

**Step 4: Verify immutable snapshot semantics**

Contract/SQL test should prove an invoice retains its original Service note even if the Draft/order Service note is later changed where lifecycle rules allow it.

**Step 5: Verify**

```bash
cd modulex-admin
npm run smoke:order-manual-service-line
npm run smoke:a1-core-operations
```

Expected: Service contract PASS end-to-end.

**Step 6: Commit**

```bash
git add modulex-admin/src/components/customers/CustomerOrderDetail.tsx modulex-admin/src/components/customers/CustomerOrderPrint.tsx modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx modulex-admin/src/components/customers/CustomerInvoicePrint.tsx modulex-admin/src/lib/customers/types.ts modulex-admin/scripts/order-manual-service-line-contract.mjs
git commit -m "feat(admin): show Service detail on orders and invoices"
```

---

## Task 8 — Full verification, current-main reconciliation, and draft PR

**Files**
- Modify only if evidence requires it: tracking/CI files touched by the package.

**Step 1: Recheck current `main` before finalizing**

Because `main` may move during implementation, compare `feat/order-manual-service-line` to execution-time `main`. Rebase/rebuild the feature branch cleanly if necessary; do not accidentally reintroduce already-merged commits.

**Step 2: Run focused verification**

```bash
cd modulex-admin
npm run smoke:order-manual-service-line
npm run smoke:order-domain
npm run smoke:order-product-pricing-v2
npm run smoke:order-lifecycle-editability
npm run smoke:order-countertop-context
npm run smoke:order-countertop-initiation
npm run smoke:countertop-domain
npm run smoke:customers-ui
npm run smoke:a1-core-operations
npm run smoke:rbac
npm run smoke:admin-ui-strict:self-test
npm run typecheck
npm run lint
npm run build
```

Expected: all PASS.

Run the strict changed-file gate against the actual merge base using the repository's canonical invocation from CI.

**Step 3: Re-run rollback-only DB acceptance**

Verify valid Service, invalid detail/price/qty, no inventory effect, total reconciliation, invoice note copy, Price Group regression, and Countertop regression. Do not deploy migration to production.

**Step 4: Inspect the final diff**

Confirm:

- no literal `+` glyph used for the action icon;
- no route-local feature colors/dark-mode classes;
- no generated UUID hardcoded for `PIECE`/SERVICE references;
- no browser elevated key/direct item-table bypass;
- no Service Price Group row;
- no relaxation of Countertop pricing gates;
- migration is additive and legacy order/invoice rows remain valid with null `line_note`.

**Step 5: Push and open a draft PR**

PR title:

```text
feat(admin): add manual Service order lines
```

PR body must state:

- `+ Countertop / + Cabinet / + Service` UX (shared SVG plus icon);
- Service detail + manual amount + qty=1;
- non-stock behavior;
- order/invoice immutable `line_note` snapshot;
- exact test evidence;
- DB migration is source-controlled / rollback-tested only and **not production-applied**.

Do not merge or deploy.
