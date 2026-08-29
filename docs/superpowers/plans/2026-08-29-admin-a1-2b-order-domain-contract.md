# Admin A1.2B Order Domain Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Admin order create, edit, and detail flows consume one shared application-level order domain adapter while preserving the existing database RPC, RLS, approval, revision, fulfillment, and snapshot behavior.

**Architecture:** Add a client-compatible `src/lib/customers/order-domain.ts` adapter as the single application boundary for order context/detail reads, price reads, and create/update/status mutations. Existing React components keep presentation/form state but no longer own Supabase order queries or mutation RPC names. No database migration is required because the current production RPCs remain authoritative.

**Tech Stack:** Next.js 16.1.6, React 19, TypeScript 5.9, Supabase JS 2.105, Node contract smoke scripts, GitHub Actions.

**Spec:** `modulex-admin/ADMIN_ROADMAP.md` — A1.2B “verify create/edit/detail flows use one domain contract”.

## Global Constraints

- Preserve `create_customer_order`, `update_customer_order`, and `set_customer_order_status` as the database mutation boundaries.
- Do not weaken or bypass existing RLS, RPC authorization, revision, approval, fulfillment, or snapshot behavior.
- Do not add a Supabase migration for this package unless implementation proves one is strictly required.
- Keep UI behavior and routes stable.
- Follow RED → GREEN TDD and run the new targeted contract before production code.
- Do not merge or deploy automatically.
- `modulex-admin/ADMIN_ROADMAP.md` is currently owned by parallel GC-3 closeout PR #134; do not edit it in this implementation branch. Roadmap acceptance/closeout will be handled after the parallel closeout is merged.

---

### Task 1: Add the failing A1.2B structural contract

**Files:**
- Create: `modulex-admin/scripts/order-domain-contract.mjs`
- Temporary verification: `.github/workflows/a12b-order-domain-contract.yml`

**Interfaces:**
- Consumes: current create/edit/detail component source files.
- Produces: structural acceptance contract requiring one shared `order-domain` adapter and prohibiting direct order mutation RPC calls in the three UI components.

- [ ] **Step 1: Write the failing contract**

The script must assert that:
- `src/lib/customers/order-domain.ts` exists.
- it exports create-context, edit-context, detail, price, create, update, and status operations;
- `NewCustomerOrder.tsx`, `EditCustomerOrder.tsx`, and `CustomerOrderDetail.tsx` import from `@/lib/customers/order-domain`;
- those components no longer contain direct `.rpc("create_customer_order")`, `.rpc("update_customer_order")`, or `.rpc("set_customer_order_status")` calls;
- order/customer/item/history/detail reads are centralized in the adapter rather than duplicated in core UI components.

- [ ] **Step 2: Run the contract on the branch**

Expected: FAIL because `src/lib/customers/order-domain.ts` does not exist yet.

---

### Task 2: Add the shared order domain adapter

**Files:**
- Create: `modulex-admin/src/lib/customers/order-domain.ts`

**Interfaces:**
- Produces:
  - `loadCreateOrderContext(customerId: string)`
  - `loadEditOrderContext(customerId: string, orderId: string)`
  - `loadOrderDetail(customerId: string, orderId: string)`
  - `loadOrderPrices(priceGroupId: string, currencyCode: string)`
  - `createCustomerOrder(input)`
  - `updateCustomerOrder(input)`
  - `setCustomerOrderStatus(input)`
  - shared typed context/result and mutation input types.

- [ ] **Step 1: Implement query helpers and shared result types**

Create context loads the active customer, active addresses, available non-internal price groups, active payment methods, active products, and tax rules. Edit context additionally loads the scoped order/items and permits active/inactive products so existing lines remain editable. Detail loads scoped customer/order/items/status history/pending approval count.

- [ ] **Step 2: Implement mutation wrappers**

Normalize optional text with trim-to-null, blank IDs to null, and numeric form values to numbers before invoking the existing RPCs. Throw Supabase errors so UI components handle one consistent error path.

- [ ] **Step 3: Preserve current permission semantics**

Create/edit context must require `super_admin`, `admin`, or `sales`. Detail must require `orders.view` and return whether the active role has `orders.manage`.

---

### Task 3: Refactor create flow to the domain adapter

**Files:**
- Modify: `modulex-admin/src/components/customers/NewCustomerOrder.tsx`

**Interfaces:**
- Consumes: `loadCreateOrderContext`, `loadOrderPrices`, `createCustomerOrder`.

- [ ] **Step 1: Replace duplicated bootstrap queries**

Use `loadCreateOrderContext(customerId)` and populate the same defaults: customer price group/base price fallback, cash/first payment method, default billing/shipping addresses, and pickup fulfillment for `pickup_level`.

- [ ] **Step 2: Replace price query**

Use `loadOrderPrices(priceGroupId, customer.currency_code || "USD")` rather than hardcoding a direct `product_prices` query in the component.

- [ ] **Step 3: Replace mutation RPC**

Call `createCustomerOrder(...)`; preserve all current client-side validation and navigation behavior.

---

### Task 4: Refactor edit flow to the domain adapter

**Files:**
- Modify: `modulex-admin/src/components/customers/EditCustomerOrder.tsx`

**Interfaces:**
- Consumes: `loadEditOrderContext`, `loadOrderPrices`, `updateCustomerOrder`.

- [ ] **Step 1: Replace duplicated bootstrap queries**

Populate existing form state from the adapter result and preserve cancelled-order handling and role-dependent approval copy.

- [ ] **Step 2: Replace price query and mutation RPC**

Use `loadOrderPrices` with the order currency and `updateCustomerOrder` for revisions. Preserve `0 => approval requested` and positive revision-number navigation semantics.

---

### Task 5: Refactor detail flow to the domain adapter

**Files:**
- Modify: `modulex-admin/src/components/customers/CustomerOrderDetail.tsx`

**Interfaces:**
- Consumes: `loadOrderDetail`, `setCustomerOrderStatus`.

- [ ] **Step 1: Replace direct detail queries and permission bootstrap**

Use one adapter call to receive customer, order, items, history, pending approval count, and `canManage`.

- [ ] **Step 2: Replace status mutation RPC**

Call `setCustomerOrderStatus` and preserve `approval_requested` success messaging and reload behavior.

---

### Task 6: Wire and verify the contract

**Files:**
- Modify: `modulex-admin/package.json`
- Remove after verification: `.github/workflows/a12b-order-domain-contract.yml`

**Interfaces:**
- Produces: `npm run smoke:order-domain`, included in `npm run smoke`.

- [ ] **Step 1: Run targeted contract GREEN**

Expected: `PASS: order domain contract`.

- [ ] **Step 2: Run deterministic Admin verification**

Run at minimum:
- `npm ci`
- `npm run smoke:order-domain`
- `npm run smoke:order-list`
- `npm run smoke:customer-detail`
- `npm run smoke:production-surface`
- `npm run lint`
- `npm run build`
- `git diff --check`

- [ ] **Step 3: Review branch diff against the pinned base**

Base SHA: `c0adbfbb431973a3acb4a94902341ac64b11c1de`.

Expected implementation files:
- `docs/superpowers/plans/2026-08-29-admin-a1-2b-order-domain-contract.md`
- `modulex-admin/package.json`
- `modulex-admin/scripts/order-domain-contract.mjs`
- `modulex-admin/src/lib/customers/order-domain.ts`
- `modulex-admin/src/components/customers/NewCustomerOrder.tsx`
- `modulex-admin/src/components/customers/EditCustomerOrder.tsx`
- `modulex-admin/src/components/customers/CustomerOrderDetail.tsx`

No GC-3 files and no roadmap file should be present in the implementation diff.

- [ ] **Step 4: Open a PR without merging**

PR should clearly state no schema migration is required and include RED/GREEN/full verification evidence.
