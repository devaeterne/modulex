# Modulex Admin Runtime Configuration

Last reviewed: 2026-09-11
Baseline main: `02f2bce3433df43c7b4fb10d611ed99e7406a822`

This is the canonical runtime/environment contract for `modulex-admin`: what belongs in source, what belongs in deployment configuration, and which values must never reach the browser bundle.

It is **not** the release/deployment checklist. Use `OPS_OBSERVABILITY_RELEASE_STANDARD.md` for verification, migration, Advisor, Vercel deploy and production-smoke sequencing. Old deployment SHAs/PRs in acceptance evidence are historical proof only and never define the current deployment.

## Vercel deployment contract

- Vercel project: `modulex`.
- Root directory: `modulex-admin`.
- Production branch: `main`.
- Production hostnames/custom domains are Vercel configuration, not source-code constants.
- `NEXT_PUBLIC_SITE_URL` is the canonical Admin origin when application code needs an absolute Admin URL; its concrete value belongs in target environment configuration.
- `STORE_SITE_URL` is the preferred Store origin for server-generated portal links. `NEXT_PUBLIC_STORE_URL` is the browser-safe compatibility form only when client-side cross-app links require the same origin.
- Portal activation URL generation fails closed when no valid Store origin is configured; source must not fall back to preview/deployment hostnames.
- A Vercel `READY` result is release evidence for a specific SHA only. Always verify the expected current release SHA rather than reusing an older successful deployment as proof.

## Environment exposure matrix

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Shared Supabase project API URL used by authenticated browser clients. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable key used with Auth/RLS. |
| `NEXT_PUBLIC_SITE_URL` | Browser-safe | Canonical Modulex Admin origin supplied by deployment configuration. |
| `NEXT_PUBLIC_STORE_URL` | Browser-safe | Store origin only where client-side cross-app linking requires it. |
| `STORE_SITE_URL` | Server runtime | Preferred Store origin for Admin-generated portal activation redirects/emails. |
| `SUPABASE_SECRET_KEY` | Server-only | Preferred elevated Supabase key for trusted server code; bypasses RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only legacy fallback | Legacy elevated key retained for compatible deployments; prefer `SUPABASE_SECRET_KEY`. |
| `RESEND_API_KEY` | Server-only | Transactional email provider credential. |
| `SUPABASE_DB_URL` | Local/CI smoke only | Direct/pooled Postgres connection for terminal DB acceptance/smoke. |
| `SMOKE_TEST_EMAIL` | Local/CI smoke only | Authorized Admin smoke identity. |
| `SMOKE_TEST_PASSWORD` | Local/CI smoke only | Smoke credential; never a browser variable. |

Provider/integration variables not listed here remain server-only unless an explicit reviewed contract classifies them as browser-safe.

## Public environment allowlist

`NEXT_PUBLIC_` variables are browser-visible by definition. The runtime contract therefore uses a strict browser-safe allowlist across application source:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STORE_URL`

Any other `NEXT_PUBLIC_*` source reference must be reviewed into this contract and its executable guard before use. Database URLs, passwords, service-role/secret keys, OAuth/provider secrets and smoke credentials must never be browser-exposed.

## Supabase key boundary

The browser client in `src/lib/supabase/client.ts` may use only browser-safe Supabase configuration. Publishable keys depend on Auth/RLS/RPC/data-policy enforcement; they do not grant business authority by themselves.

Elevated access in trusted server code prefers `SUPABASE_SECRET_KEY` and may retain `SUPABASE_SERVICE_ROLE_KEY` only as a legacy-compatible fallback. Both bypass RLS and must never be imported by Client Components, placed in `NEXT_PUBLIC_*`, committed, serialized into browser responses, or logged.

The route/domain/public projection model is documented in `ADMIN_PRODUCTION_SURFACE.md`; runtime configuration does not widen those boundaries.

## Store activation origin boundary

`src/lib/runtime/store-origin.ts` is the server-only source of truth for Admin-generated Store activation URLs. It prefers `STORE_SITE_URL`, retains `NEXT_PUBLIC_STORE_URL` only where compatibility requires it, validates an HTTP(S) origin without path/query/hash, and fails closed when no Store origin exists.

Dealer/customer invitation generation must use the established helper/boundary. A preview hostname is not an accepted production fallback.

## Repository rules

- `.env*` files are ignored because they may contain credentials.
- `.env.example` is the tracked template and contains names/comments only, never real secret values.
- `.vercel/` is local and untracked.
- Do not commit deployment credentials, database passwords, smoke credentials, secret Supabase keys, provider secrets or OAuth tokens.
- Do not use the Store URL as the Admin canonical origin; Admin and Store origins are separate configuration values.
- Do not document a concrete secret value in an acceptance file merely to prove configuration.

## Verification

`npm run smoke:runtime-config` enforces package/runtime identity, env-file tracking rules, blank template values, browser-safe `NEXT_PUBLIC_*` usage, public/server-only Supabase boundaries, Store-origin ownership, runtime documentation and smoke-chain wiring.

For release-level evidence, follow `OPS_OBSERVABILITY_RELEASE_STANDARD.md`: configuration correctness, expected deployed SHA, Vercel health, and safe signed-in smoke are distinct gates.