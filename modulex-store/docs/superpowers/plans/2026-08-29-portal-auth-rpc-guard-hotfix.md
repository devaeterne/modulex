# Portal Auth RPC Guard Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unauthenticated App Router child renders from invoking authenticated-only Customer/Dealer portal RPCs before the protected layout redirect completes.

**Architecture:** Keep layout guards as the UI boundary, but make the data-access boundary independently safe. Shared Customer/Dealer portal data helpers will obtain an authorized portal client only after `requireStorePortalContext()` succeeds; Dealer-only helpers will require `requireDealerPortalContext()` before creating the Supabase client. This avoids page-by-page guard duplication and protects future call sites.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Supabase SSR/RPC, Node contract tests.

**Spec:** Production incident observed on 2026-08-29: unauthenticated requests render the login shell but child page loaders log authenticated-only RPC failures on `/account`, `/account/shipments`, `/dealer`, and `/dealer/catalog`.

## Global Constraints

- Preserve `anon EXECUTE=false` for protected portal RPCs; do not weaken database authorization.
- Do not add service-role credentials to Store.
- Preserve existing neutral portal redirects and data isolation.
- Keep the hotfix scoped to portal data-access authorization and its regression contract.
- Production merge and production deployment remain user-controlled.

---

### Task 1: Add a regression contract for authorized portal data access

**Files:**
- Create: `modulex-store/scripts/portal-auth-rpc-guard-contract.mjs`
- Modify: `modulex-store/package.json`

**Interfaces:**
- Consumes: existing portal helper files under `src/lib/portal/`.
- Produces: `npm run smoke:portal-auth-rpc-guard`, asserting that protected RPC helpers create Supabase clients only through authorization-aware factories.

- [ ] **Step 1: Write the failing contract**

Create a Node contract that checks `orders.ts` and `fulfillment.ts` for `createAuthorizedPortalClient()` backed by `requireStorePortalContext()`, and `dealer.ts` for `createAuthorizedDealerClient()` backed by `requireDealerPortalContext()`. Each exported protected data function must use its authorized factory instead of calling `createServerSupabaseClient()` directly.

- [ ] **Step 2: Run the contract and verify RED**

Run: `node scripts/portal-auth-rpc-guard-contract.mjs`
Expected: FAIL because the current helpers call `createServerSupabaseClient()` directly and contain no authorization-aware client factory.

- [ ] **Step 3: Wire the contract into Store smoke**

Add `smoke:portal-auth-rpc-guard` to `package.json` and include it in the aggregate `smoke` command.

---

### Task 2: Guard shared Customer/Dealer portal RPC helpers

**Files:**
- Modify: `modulex-store/src/lib/portal/orders.ts`
- Modify: `modulex-store/src/lib/portal/fulfillment.ts`
- Test: `modulex-store/scripts/portal-auth-rpc-guard-contract.mjs`

**Interfaces:**
- Consumes: `requireStorePortalContext()` and `createServerSupabaseClient()`.
- Produces: local `createAuthorizedPortalClient()` used by every protected order/fulfillment RPC helper.

- [ ] **Step 1: Implement the minimal authorized client factory**

```ts
async function createAuthorizedPortalClient() {
  await requireStorePortalContext();
  return createServerSupabaseClient();
}
```

Replace direct client creation in every exported order and fulfillment data helper with `await createAuthorizedPortalClient()`.

- [ ] **Step 2: Run the guard contract**

Run: `node scripts/portal-auth-rpc-guard-contract.mjs`
Expected: shared helper assertions pass; Dealer helper assertion remains failing until Task 3.

---

### Task 3: Guard Dealer-only portal RPC helpers

**Files:**
- Modify: `modulex-store/src/lib/portal/dealer.ts`
- Test: `modulex-store/scripts/portal-auth-rpc-guard-contract.mjs`

**Interfaces:**
- Consumes: `requireDealerPortalContext()` and `createServerSupabaseClient()`.
- Produces: local `createAuthorizedDealerClient()` used by every Dealer-only protected RPC helper.

- [ ] **Step 1: Implement the minimal Dealer authorized client factory**

```ts
async function createAuthorizedDealerClient() {
  await requireDealerPortalContext();
  return createServerSupabaseClient();
}
```

Replace direct client creation in Dealer data helpers with `await createAuthorizedDealerClient()`.

- [ ] **Step 2: Run RED/GREEN contract verification**

Run: `npm run smoke:portal-auth-rpc-guard`
Expected: PASS.

---

### Task 4: Verify Store and preview behavior

**Files:**
- No production code changes beyond Tasks 1-3.

**Interfaces:**
- Consumes: completed hotfix branch.
- Produces: evidence that the branch is safe to review/merge.

- [ ] **Step 1: Run Store smoke**

Run: `npm run smoke`
Expected: PASS.

- [ ] **Step 2: Run scoped lint**

Run ESLint over the three modified TypeScript helpers and the contract script.
Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Verify preview route gates**

Request unauthenticated `/account`, `/account/shipments`, `/account/installations`, `/dealer`, `/dealer/catalog`, `/dealer/documents`, and `/dealer/account` on the branch preview. Expected: account/dealer login shell as appropriate, with no new portal data-loader runtime errors on the preview deployment.

- [ ] **Step 5: Open a ready PR**

PR title: `fix: guard portal RPC loaders before auth redirect`

Document the production reproduction, root cause, unchanged database authorization boundary, and verification results. Do not merge the PR.