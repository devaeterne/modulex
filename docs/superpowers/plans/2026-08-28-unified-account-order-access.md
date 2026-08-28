# Unified Account & Read-Only Order Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Store login entry for Dealer and Customer portal identities, preserve strict external/internal identity isolation, and expose customer-scoped read-only orders without pricing.

**Architecture:** Keep `customer_portal_users` as the single external membership table. Generalize the trusted Auth account boundary to `dealer_portal` and `customer_portal`, expose one minimal portal-context RPC derived only from `auth.uid()`, and expose order list/detail only through narrow authenticated RPCs that never accept a customer ID. Store routes consume the shared context and route Dealer to `/dealer` and Customer to `/account`; both consume the same non-monetary order contract.

**Tech Stack:** Next.js 16.1.6 App Router / `proxy.ts`, React 19, TypeScript, Supabase Auth + Postgres RPC, `@supabase/ssr@0.10.3`, `@supabase/supabase-js@2.105.3`, Node contract scripts.

**Spec:** `docs/superpowers/specs/2026-08-28-unified-account-order-access-design.md`

## Global Constraints

- No public signup.
- No Store service-role/secret key.
- Never authorize from `user_metadata`.
- Dealer stays `app_metadata.account_type = dealer_portal`; non-Dealer Customer uses `customer_portal`.
- Portal membership/customer is derived from `auth.uid()`, never caller-provided `customer_id`.
- Order RPC responses contain no pricing, tax, totals, payment, commission, profitability, or internal-note fields.
- Existing Dealer activation/login/recovery compatibility remains intact.
- PR must be created with `draft=false`; user merges/deploys manually.

---

### Task 1: Lock the P1.4 contracts before production code

**Files:**
- Create: `modulex-store/scripts/store-portal-contract.mjs`
- Create: `modulex-admin/scripts/store-portal-admin-contract.mjs`
- Modify: `modulex-store/package.json`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Produces static contract assertions for shared portal auth, navbar account entry, protected account routes, generalized Admin provisioning, and non-monetary order RPC migration source.

- [ ] **Step 1:** Add Store failing contract assertions requiring `/account`, shared portal context, account icon, `get_store_portal_orders`, `get_store_portal_order`, and absence of forbidden monetary fields from portal-facing code/migration response builders.
- [ ] **Step 2:** Add Admin failing contract assertions requiring server-derived `dealer_portal` vs `customer_portal`, with no browser-controlled account type.
- [ ] **Step 3:** Wire focused smoke scripts into each package.
- [ ] **Step 4:** Run the focused contracts and confirm they fail because P1.4 production files do not exist yet.

### Task 2: Generalize the database identity boundary and add scoped order RPCs

**Files:**
- Create: `modulex-store/supabase/migrations/20260828213000_store_unified_portal_order_access.sql`
- Create: `modulex-store/tests/smoke/store-portal-order-access.smoke.sql`

**Interfaces:**
- Produces: `public.get_store_portal_context() -> jsonb`
- Produces: `public.get_store_portal_orders(p_limit integer default 25, p_offset integer default 0) -> jsonb`
- Produces: `public.get_store_portal_order(p_order_id uuid) -> jsonb`

- [ ] **Step 1:** Extend `public.handle_new_user()` so both trusted external account types bypass internal profile creation while unmarked internal provisioning stays unchanged.
- [ ] **Step 2:** Add private authorized context resolver validating `auth.uid()`, active portal membership, `portal_enabled`, active customer state, customer type, and matching trusted app metadata.
- [ ] **Step 3:** Add public invoker wrappers with `PUBLIC`/`anon` execute revoked and `authenticated` execute granted.
- [ ] **Step 4:** Add order-list RPC that resolves customer internally and returns only ID, number, status, dates, reference, item count, and fulfillment type.
- [ ] **Step 5:** Add order-detail RPC that checks ownership before returning header + line number/SKU/name/quantity only.
- [ ] **Step 6:** Add rollback smoke coverage for Dealer/Customer context, cross-customer denial, suspended/disabled revocation, internal-user denial, anon execute denial, and forbidden-field absence.

### Task 3: Generalize Admin portal provisioning

**Files:**
- Modify: `modulex-admin/src/app/api/admin/dealer-portal/route.ts`
- Modify: `modulex-admin/src/lib/email/dealer-portal.ts` only if route/copy must become neutral without breaking existing Dealer email behavior.
- Modify: `modulex-admin/scripts/store-portal-admin-contract.mjs`

**Interfaces:**
- Consumes customer `customer_type_id -> customer_types.system_key`.
- Produces server-derived Auth account metadata `dealer_portal | customer_portal`.

- [ ] **Step 1:** Expand the customer lookup to include its type system key.
- [ ] **Step 2:** Derive account type only on the server: `dealer` => `dealer_portal`, all other supported external customer types => `customer_portal`.
- [ ] **Step 3:** Use the derived type in Auth create/linked-user validation and verify no internal profile exists for either external type.
- [ ] **Step 4:** Keep lifecycle state machine, portal enabled gate, audit behavior, and recovery-link flow unchanged.
- [ ] **Step 5:** Run Admin focused contract and existing Dealer portal Admin contract.

### Task 4: Build shared Store portal authorization and unified login

**Files:**
- Create: `modulex-store/src/lib/portal/auth.ts`
- Create: `modulex-store/src/app/account/(auth)/login/actions.ts`
- Create: `modulex-store/src/app/account/(auth)/login/AccountLoginForm.tsx`
- Create: `modulex-store/src/app/account/(auth)/login/page.tsx`
- Create: `modulex-store/src/app/account/session/clear/route.ts`
- Create: `modulex-store/src/app/account/(portal)/actions.ts`
- Create: `modulex-store/src/app/account/(portal)/layout.tsx`
- Create: `modulex-store/src/app/account/(portal)/page.tsx`
- Modify: `modulex-store/src/lib/dealer/auth.ts`
- Modify: `modulex-store/src/app/dealer/(auth)/login/actions.ts`
- Modify: `modulex-store/src/proxy.ts`
- Modify: `modulex-store/src/lib/supabase/proxy.ts`
- Modify: `modulex-store/src/components/StoreChrome.tsx`

**Interfaces:**
- Produces `PortalContext` with `portal_kind: dealer | customer`.
- Produces `readStorePortalSession()` and route-specific required-context helpers.

- [ ] **Step 1:** Implement shared server auth using `getClaims()` plus `get_store_portal_context()`; do not use `getSession()` as authorization.
- [ ] **Step 2:** Implement `/account/login` password action. Authenticate first, then route by trusted metadata + DB-derived `portal_kind`; on mismatch/denial sign out with generic error.
- [ ] **Step 3:** Make Dealer auth consume the same shared context while still requiring Dealer kind and preserving #78 unauthenticated-vs-denied behavior.
- [ ] **Step 4:** Add protected Customer `/account` shell and common sign-out/session-clear behavior.
- [ ] **Step 5:** Expand proxy/session refresh matcher to `/dealer/:path*` and `/account/:path*` only.
- [ ] **Step 6:** Make StoreChrome hide marketing chrome for protected account/dealer routes without hiding the public `/account/login` entry page incorrectly.

### Task 5: Add the Store navbar account icon

**Files:**
- Modify: `modulex-store/src/components/Navbar.tsx`

**Interfaces:**
- Produces one accessible `Account` link to `/account` using inline SVG and no new dependency.

- [ ] **Step 1:** Add one inline user/account SVG adjacent to Contact on desktop.
- [ ] **Step 2:** Ensure the entry remains accessible/responsive with `aria-label="Account"` and closes mobile navigation consistently.
- [ ] **Step 3:** Preserve Contact analytics and existing burger behavior.

### Task 6: Add shared read-only order UI for Dealer and Customer

**Files:**
- Create: `modulex-store/src/lib/portal/orders.ts`
- Create: `modulex-store/src/components/portal/PortalOrderList.tsx`
- Create: `modulex-store/src/components/portal/PortalOrderDetail.tsx`
- Create: `modulex-store/src/app/account/(portal)/orders/page.tsx`
- Create: `modulex-store/src/app/account/(portal)/orders/[id]/page.tsx`
- Create: `modulex-store/src/app/dealer/(portal)/orders/page.tsx`
- Create: `modulex-store/src/app/dealer/(portal)/orders/[id]/page.tsx`
- Modify: `modulex-store/src/app/account/(portal)/page.tsx`
- Modify: `modulex-store/src/app/dealer/(portal)/page.tsx`
- Modify: `modulex-store/src/app/dealer/(portal)/layout.tsx`

**Interfaces:**
- `getPortalOrders(limit?, offset?)` calls `get_store_portal_orders`.
- `getPortalOrder(orderId)` calls `get_store_portal_order`.

- [ ] **Step 1:** Parse and validate minimized JSON RPC outputs into focused TypeScript types.
- [ ] **Step 2:** Add dashboard recent-order section and Orders navigation to both portal kinds.
- [ ] **Step 3:** Add list page with status/date/reference/item-count/fulfillment only.
- [ ] **Step 4:** Add detail page with allowed header fields and SKU/product/quantity lines only.
- [ ] **Step 5:** Treat denied/foreign order as unavailable without ownership disclosure.

### Task 7: Verify, harden, and prepare the PR

**Files:**
- Temporary verification workflow if local GitHub DNS remains unavailable; remove it before final PR diff.

- [ ] **Step 1:** Run Store focused P1.4 contract and full Store smoke suite.
- [ ] **Step 2:** Run Admin P1.4 contract plus existing dealer-portal/admin recovery contracts.
- [ ] **Step 3:** Run changed-file lint and production `next build` for Store and Admin.
- [ ] **Step 4:** Apply the reviewed migration to production only after source/static checks pass.
- [ ] **Step 5:** Run rollback-only DB smoke and verify fixture cleanup.
- [ ] **Step 6:** Run Supabase Security Advisor and Performance Advisor and review new findings.
- [ ] **Step 7:** Review final branch diff for forbidden monetary fields, secrets, caller-supplied customer IDs, and regressions to #78.
- [ ] **Step 8:** Open a normal ready PR (`draft=false`) and do not merge or trigger Vercel deployment.