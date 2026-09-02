# Modulex API Performance Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe end-to-end timing instrumentation to every current `modulex-admin` Next.js API route so production P50/P95 latency can be ranked using real handler durations.

**Architecture:** A single server-only `withApiTiming()` wrapper measures each route handler, appends a `Server-Timing` response header, and emits a sanitized structured log event. Route implementations keep their existing authorization, response, mutation, external-call, and error semantics; a contract test enforces complete coverage of the 15 current route files.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.9, Node.js 22, existing Node contract-script pattern, Vercel runtime logs.

**Spec:** `docs/superpowers/specs/2026-09-02-api-performance-observability-design.md`

## Global Constraints

- Instrument all 15 current `modulex-admin/src/app/api/**/route.ts` files.
- Log only route template, HTTP method, response status, and duration in milliseconds.
- Never log request bodies, query values, headers, tokens, user IDs, emails, entity IDs, vendor payloads, or response bodies.
- Preserve existing route authorization, status codes, payloads, side effects, runtime declarations, max durations, and error behavior.
- Dynamic routes must log template paths such as `/api/vendor-catalog/items/[itemId]/approve`, never concrete IDs.
- No database migration, schema change, new telemetry table, or new package dependency.
- `Server-Timing` metric name is `modulex_api`.
- Existing response headers must be preserved.

---

### Task 1: Build and behavior-test the timing helper

**Files:**
- Create: `modulex-admin/src/lib/observability/apiTiming.ts`
- Create: `modulex-admin/scripts/api-timing-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Produces: `withApiTiming(context: { route: string; method: string }, handler: () => Promise<Response> | Response): Promise<Response>`
- Produces log events shaped as `{ event: "modulex_api_timing", route, method, status, duration_ms }`.
- Produces response header `Server-Timing: modulex_api;dur=<number>`.

- [ ] **Step 1: Write the failing runtime contract**

Create `modulex-admin/scripts/api-timing-contract.mjs`. Use the installed `typescript` package to transpile `src/lib/observability/apiTiming.ts` in memory, import the transpiled module from a `data:` URL, replace `console.info` temporarily, and assert these behaviors:

```js
const success = await withApiTiming(
  { route: "/api/test", method: "GET" },
  () => new Response("ok", { status: 201, headers: { "x-existing": "keep" } })
);
assert.equal(success.status, 201);
assert.equal(success.headers.get("x-existing"), "keep");
assert.match(success.headers.get("server-timing") ?? "", /^modulex_api;dur=\d+(?:\.\d+)?$/);
assert.equal(events[0].event, "modulex_api_timing");
assert.equal(events[0].route, "/api/test");
assert.equal(events[0].method, "GET");
assert.equal(events[0].status, 201);
assert.equal(typeof events[0].duration_ms, "number");
assert.deepEqual(Object.keys(events[0]).sort(), ["duration_ms", "event", "method", "route", "status"]);
```

Also assert an explicit `404` response logs status 404, and a thrown `Error("boom")` logs status 500 then rethrows the same error object.

- [ ] **Step 2: Run the contract to verify RED**

Run:

```bash
cd modulex-admin
node scripts/api-timing-contract.mjs
```

Expected: FAIL because `src/lib/observability/apiTiming.ts` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Create `modulex-admin/src/lib/observability/apiTiming.ts`:

```ts
import "server-only";

export type ApiTimingContext = {
  route: string;
  method: string;
};

type TimingEvent = {
  event: "modulex_api_timing";
  route: string;
  method: string;
  status: number;
  duration_ms: number;
};

function durationMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function emitTiming(context: ApiTimingContext, status: number, duration: number) {
  const event: TimingEvent = {
    event: "modulex_api_timing",
    route: context.route,
    method: context.method,
    status,
    duration_ms: duration,
  };
  console.info(event);
}

export async function withApiTiming(
  context: ApiTimingContext,
  handler: () => Promise<Response> | Response
): Promise<Response> {
  const startedAt = performance.now();
  try {
    const response = await handler();
    const duration = durationMs(startedAt);
    response.headers.set("Server-Timing", `modulex_api;dur=${duration}`);
    emitTiming(context, response.status, duration);
    return response;
  } catch (error) {
    emitTiming(context, 500, durationMs(startedAt));
    throw error;
  }
}
```

If a response implementation proves to have immutable headers in contract/build verification, replace only the response reconstruction detail while preserving status/body/headers; do not alter route semantics.

- [ ] **Step 4: Run the contract to verify GREEN**

Run:

```bash
cd modulex-admin
node scripts/api-timing-contract.mjs
```

Expected: PASS with a concise success line.

- [ ] **Step 5: Wire the contract into package scripts**

Add:

```json
"smoke:api-timing": "node scripts/api-timing-contract.mjs"
```

and add `npm run smoke:api-timing` to the normal `smoke` chain near `smoke:api`.

- [ ] **Step 6: Re-run the focused gate**

Run:

```bash
cd modulex-admin
npm run smoke:api-timing
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add modulex-admin/src/lib/observability/apiTiming.ts modulex-admin/scripts/api-timing-contract.mjs modulex-admin/package.json
git commit -m "feat(admin): add API timing helper"
```

---

### Task 2: Add route-inventory coverage before migrating routes

**Files:**
- Modify: `modulex-admin/scripts/api-timing-contract.mjs`

**Interfaces:**
- Consumes: `withApiTiming()` from Task 1.
- Produces: a repository contract that fails if any current or future `src/app/api/**/route.ts` file lacks timing instrumentation.

- [ ] **Step 1: Add the failing route-inventory assertion**

Recursively discover every `route.ts` under `modulex-admin/src/app/api`. Assert there are currently exactly 15 route files and each file contains both an import of `withApiTiming` and at least one `withApiTiming(` call. Also assert dynamic route source uses the literal template `/api/vendor-catalog/items/[itemId]/approve`.

The current route inventory is:

```text
src/app/api/admin/dealer-portal/route.ts
src/app/api/admin/email-notifications/process/route.ts
src/app/api/admin/email-notifications/route.ts
src/app/api/admin/products/qr/route.ts
src/app/api/admin/store-media/import/route.ts
src/app/api/admin/store-media/route.ts
src/app/api/admin/users/route.ts
src/app/api/requests/notify-created/route.ts
src/app/api/vendor-catalog/bulk/approve/route.ts
src/app/api/vendor-catalog/bulk/eligible/route.ts
src/app/api/vendor-catalog/category-mappings/route.ts
src/app/api/vendor-catalog/check/route.ts
src/app/api/vendor-catalog/items/[itemId]/approve/route.ts
src/app/api/vendor-catalog/sync/route.ts
src/app/api/vendor-catalog/vendors/route.ts
```

- [ ] **Step 2: Run to verify RED**

Run:

```bash
cd modulex-admin
npm run smoke:api-timing
```

Expected: FAIL listing uninstrumented route files.

- [ ] **Step 3: Commit only the RED contract**

```bash
git add modulex-admin/scripts/api-timing-contract.mjs
git commit -m "test(admin): require API timing coverage"
```

---

### Task 3: Instrument Admin and request-center route handlers

**Files:**
- Modify: `modulex-admin/src/app/api/admin/dealer-portal/route.ts`
- Modify: `modulex-admin/src/app/api/admin/email-notifications/process/route.ts`
- Modify: `modulex-admin/src/app/api/admin/email-notifications/route.ts`
- Modify: `modulex-admin/src/app/api/admin/products/qr/route.ts`
- Modify: `modulex-admin/src/app/api/admin/store-media/import/route.ts`
- Modify: `modulex-admin/src/app/api/admin/store-media/route.ts`
- Modify: `modulex-admin/src/app/api/admin/users/route.ts`
- Modify: `modulex-admin/src/app/api/requests/notify-created/route.ts`

**Interfaces:**
- Consumes: `withApiTiming()` from Task 1.
- Each route must pass a static template string and explicit HTTP method.

- [ ] **Step 1: Wrap every exported HTTP method without changing route bodies**

Use local implementation functions where needed. Example pattern:

```ts
import { withApiTiming } from "@/lib/observability/apiTiming";

async function handleGet(request: Request) {
  // existing exported GET body, unchanged
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/email-notifications", method: "GET" },
    () => handleGet(request)
  );
}
```

Use these route templates exactly:

```text
/api/admin/dealer-portal
/api/admin/email-notifications/process
/api/admin/email-notifications
/api/admin/products/qr
/api/admin/store-media/import
/api/admin/store-media
/api/admin/users
/api/requests/notify-created
```

Wrap every method exported by each file (`GET`, `POST`, `PATCH`, `DELETE` as applicable). Do not merge method implementations or alter existing error catches.

- [ ] **Step 2: Run focused contracts**

Run:

```bash
cd modulex-admin
npm run smoke:api-timing
npm run smoke:admin-users
npm run smoke:dealer-portal-admin
npm run smoke:media-library-admin
npm run smoke:requests-admin
```

Expected: timing contract still fails only for remaining vendor-catalog routes; all existing domain contracts PASS.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
cd modulex-admin
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add modulex-admin/src/app/api/admin modulex-admin/src/app/api/requests
git commit -m "feat(admin): instrument core API routes"
```

---

### Task 4: Instrument Vendor Catalog route handlers

**Files:**
- Modify: `modulex-admin/src/app/api/vendor-catalog/bulk/approve/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/bulk/eligible/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/category-mappings/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/check/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/items/[itemId]/approve/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/sync/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/vendors/route.ts`

**Interfaces:**
- Consumes: `withApiTiming()` from Task 1.
- Dynamic approval route emits only `/api/vendor-catalog/items/[itemId]/approve`.

- [ ] **Step 1: Wrap every exported Vendor Catalog HTTP method**

Use these route templates exactly:

```text
/api/vendor-catalog/bulk/approve
/api/vendor-catalog/bulk/eligible
/api/vendor-catalog/category-mappings
/api/vendor-catalog/check
/api/vendor-catalog/items/[itemId]/approve
/api/vendor-catalog/sync
/api/vendor-catalog/vendors
```

Preserve `runtime`, `dynamic`, `maxDuration`, adapter calls, category mapping behavior, concurrency controls, and all existing mutation semantics.

- [ ] **Step 2: Run timing contract to verify GREEN route coverage**

Run:

```bash
cd modulex-admin
npm run smoke:api-timing
```

Expected: PASS; all 15 route files are instrumented.

- [ ] **Step 3: Run Vendor Catalog regression contracts**

Run the existing Vendor Catalog focused workflow/contract commands present on current `main`. At minimum run the repo's vendor-catalog sync/approval contracts used by `.github/workflows/admin-vendor-catalog-sync.yml`; do not invent a new test surface if the workflow already names the canonical scripts.

Expected: PASS.

- [ ] **Step 4: Run TypeScript**

```bash
cd modulex-admin
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modulex-admin/src/app/api/vendor-catalog
git commit -m "feat(admin): instrument vendor catalog APIs"
```

---

### Task 5: Roadmap, full verification, and production measurement handoff

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces: documented operational contract and deploy/measurement acceptance criteria.

- [ ] **Step 1: Update Admin roadmap**

Add an observability/performance note recording:

```text
- [~] API timing observability: all 15 Next.js Admin API route handlers emit sanitized `modulex_api_timing` logs and `Server-Timing` without changing business behavior. Complete after production deployment and first route P95 scoreboard.
```

Update `Last reviewed` and the relevant next-action text without overwriting unrelated active Vendor Catalog work.

- [ ] **Step 2: Run final focused and global gates**

Run:

```bash
cd modulex-admin
npm run smoke:api-timing
npm run typecheck
npm run lint
npm run smoke
npm run build
```

Expected: all PASS. Do not run Supabase advisors because there is no schema/RLS/RPC/index change.

- [ ] **Step 3: Inspect the final diff**

Verify:

```text
- exactly 15 route files are covered;
- no request/response payload logging exists;
- no user/email/token/entity identifiers are included in timing events;
- every dynamic route uses a template path;
- no route authorization or mutation logic changed;
- package dependencies are unchanged.
```

- [ ] **Step 4: Commit roadmap/verification bookkeeping**

```bash
git add modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs(admin): track API timing observability"
```

- [ ] **Step 5: Open a non-draft PR**

PR title:

```text
perf(admin): add API timing observability
```

PR body must summarize the sanitized log/header contract, enumerate verification commands, state that no DB/schema changes are included, and note that production P95 classification requires deployment traffic.

- [ ] **Step 6: Post-deploy acceptance**

After merge/deploy, inspect Vercel production runtime logs for `modulex_api_timing` and browser/network `Server-Timing`. Build a scoreboard using at least 20 observations per interactive route where natural traffic exists:

```text
Green  = P95 < 300 ms
Yellow = P95 300-1000 ms
Red    = P95 > 1000 ms
```

Evaluate sync/email/storage routes separately with workload/throughput context. Only after this scoreboard exists should any Next.js handler optimization begin.
