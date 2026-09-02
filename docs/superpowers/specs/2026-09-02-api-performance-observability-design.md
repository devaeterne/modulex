# Modulex API Performance Observability Design

## Goal

Measure real end-to-end latency for every Next.js API route in `modulex-admin` without logging sensitive business or identity data, then use those measurements to prioritize performance work by actual P50/P95 behavior instead of historical or isolated samples.

## Current evidence

Production DB/RPC/PostgREST benchmarks are green after the Product/Inventory and Product Pricing RLS InitPlan optimizations. `get_cost_margin_page` was re-validated with 100 authenticated runs at P50 54.2 ms, P95 55.4 ms, P99 56.2 ms, max 69.9 ms, with zero runs above 100 ms. Mixed sort scenarios also remained below 80 ms max. The remaining unknown is the Next.js handler layer, where routes may include Supabase Auth Admin, Storage, email delivery, QR generation, or vendor HTTP work that SQL-only measurement cannot represent.

## Scope

Instrument all 15 current `modulex-admin/src/app/api/**/route.ts` handlers through a shared server-only timing utility. Preserve every route's existing request/response semantics, authorization, status codes, payloads, side effects, runtime declarations, and timeout behavior.

The instrumentation must:

- measure wall-clock handler duration with `performance.now()`;
- add a `Server-Timing` response header using a stable metric name;
- emit one structured `console.info` timing event per completed request;
- record only route template, HTTP method, response status, and duration in milliseconds;
- never log request bodies, query-string values, headers, tokens, user IDs, emails, entity IDs, vendor payloads, or response bodies;
- preserve existing response headers when adding `Server-Timing`;
- record durations for success, expected error responses, and thrown-error paths that are converted to responses by the route;
- avoid database schema changes, migrations, new external dependencies, and persistent telemetry tables.

## API

Create `modulex-admin/src/lib/observability/apiTiming.ts` with:

```ts
export type ApiTimingContext = {
  route: string;
  method: string;
};

export async function withApiTiming(
  context: ApiTimingContext,
  handler: () => Promise<Response> | Response
): Promise<Response>;
```

`withApiTiming()` starts a timer, awaits the supplied handler, clones or safely reconstructs the returned response headers, appends `Server-Timing: modulex_api;dur=<duration>`, emits a structured event, and returns an equivalent response. If the supplied handler throws, the helper logs a timing event with status `500` and rethrows so existing route-level error semantics are not silently changed.

Structured log shape:

```ts
{
  event: "modulex_api_timing",
  route: "/api/admin/users",
  method: "GET",
  status: 200,
  duration_ms: 123.45
}
```

## Route integration

Each exported HTTP method becomes a thin timed wrapper around its existing implementation. To minimize behavioral risk, existing route logic should move into a local implementation function when necessary, for example:

```ts
async function getUsers(request: Request) {
  // existing GET body unchanged
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/users", method: "GET" },
    () => getUsers(request)
  );
}
```

Dynamic routes must log their template path, e.g. `/api/vendor-catalog/items/[itemId]/approve`, never the concrete item ID.

## Performance classification

Use production measurements after deployment with these initial budgets:

- Green: interactive API P95 < 300 ms
- Yellow: interactive API P95 300-1000 ms
- Red: interactive API P95 > 1000 ms
- DB read target remains < 100 ms where applicable
- Batch/sync/storage/email routes are evaluated separately by both wall-clock latency and useful work/throughput; they are not treated as interactive failures solely because external work takes longer.

## Verification

TDD must cover the helper before route migration. Tests must prove header preservation, timing header emission, structured log sanitization, success/error status reporting, and throw/rethrow behavior. A route-inventory contract must assert that every current `modulex-admin/src/app/api/**/route.ts` handler uses the timing helper so future endpoints cannot silently bypass measurement.

Final verification requires targeted timing tests, existing Admin smoke/contracts, TypeScript, lint, and production build. After deployment, inspect production Vercel runtime logs and browser `Server-Timing` to build the first route-level scoreboard. No Supabase advisor run is required because this package does not alter schema, RLS, grants, RPCs, or indexes.
