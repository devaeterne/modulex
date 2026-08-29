# Modulex Admin Runtime Configuration

Last reviewed: 2026-08-29
Baseline main: `f6d7f9673dc874b5c254e47c750ff1bd4793c7c3`

This document is the runtime/configuration contract for `modulex-admin`. It records what belongs in source, what belongs in deployment configuration, and which values must never reach the browser bundle.

## Vercel deployment contract

- Vercel project: `modulex`
- Root directory: `modulex-admin`
- Production branch: `main`
- Production hostnames and custom-domain aliases are **configuration-owned** in Vercel. Do not hardcode a Vercel preview hostname, deployment hostname, or Store hostname in Admin source code.
- `NEXT_PUBLIC_SITE_URL` represents the canonical Modulex Admin origin when application code needs an absolute Admin URL. Its concrete value belongs in the target environment configuration.
- `STORE_SITE_URL` is the preferred canonical Oakwell Store origin for server-generated portal activation links. `NEXT_PUBLIC_STORE_URL` is the browser-safe compatibility form when client-side cross-app links require the same origin.
- Portal activation URL generation fails closed when neither Store-origin variable is configured; Admin source must not fall back to a Vercel preview hostname.

The production deployment for merged PR #113 was verified `READY`, targeted `production`, built from merge SHA `f6d7f9673dc874b5c254e47c750ff1bd4793c7c3`, and reported `gitRootDirectory=modulex-admin`. Hostname/custom-domain aliases remain deployment configuration and are not inferred from preview URLs.

## Environment exposure matrix

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project API URL used by the authenticated browser client. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable key used with Auth/RLS. |
| `NEXT_PUBLIC_SITE_URL` | Browser-safe | Canonical Modulex Admin origin supplied by deployment configuration. |
| `NEXT_PUBLIC_STORE_URL` | Browser-safe | Canonical Oakwell Store origin only when browser-side cross-app links require it; server code prefers `STORE_SITE_URL`. |
| `STORE_SITE_URL` | Server runtime | Preferred Oakwell Store origin for Admin-generated portal activation redirects and emails. |
| `SUPABASE_SECRET_KEY` | Server-only | Preferred elevated Supabase key for trusted server code. Bypasses RLS and must never reach the client bundle. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only legacy fallback | Legacy elevated key retained only for compatible deployments. Prefer `SUPABASE_SECRET_KEY`. |
| `RESEND_API_KEY` | Server-only | Transactional email provider credential. |
| `SUPABASE_DB_URL` | Local/CI smoke only | Direct or Session Pooler Postgres connection used by terminal DB smoke tests. |
| `SMOKE_TEST_EMAIL` | Local/CI smoke only | Authenticated Admin smoke-test identity. |
| `SMOKE_TEST_PASSWORD` | Local/CI smoke only | Smoke-test credential; never a browser variable. |

## Public environment allowlist

`NEXT_PUBLIC_` variables are treated as browser-visible by definition. The runtime contract therefore uses a **strict browser-safe allowlist** across all TypeScript/JavaScript source under `src/`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STORE_URL`

Any other `NEXT_PUBLIC_*` reference in source fails `smoke:runtime-config`, including database URLs, passwords, service-role keys, secret Supabase keys, or future privileged values that are not explicitly reviewed into this allowlist.

## Supabase key boundary

The browser client in `src/lib/supabase/client.ts` may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Publishable keys are designed for public application components and rely on Auth/RLS for row-level authorization.

Elevated access lives in `src/lib/supabase/server-admin.ts`, which is protected by `server-only`. It prefers `SUPABASE_SECRET_KEY` and retains `SUPABASE_SERVICE_ROLE_KEY` only as a legacy fallback. Both elevated key types bypass RLS and must never be imported by a Client Component, placed in a `NEXT_PUBLIC_` variable, committed to source control, or logged.

## Store activation origin boundary

`src/lib/runtime/store-origin.ts` is the server-only source of truth for Admin-generated Store activation URLs. It prefers `STORE_SITE_URL`, retains `NEXT_PUBLIC_STORE_URL` only for compatibility, validates that the configured value is an HTTP(S) origin without path/query/hash, and fails closed if no Store origin is configured.

Dealer/customer portal invitation generation must use this helper. The legacy `https://oakwell-phi.vercel.app` fallback is not an accepted production configuration path.

## Repository rules

- `.env*` files are ignored because they may contain credentials.
- `.env.example` is the only tracked env template and contains variable names/comments only, never concrete values.
- `.vercel/` remains local and untracked.
- Do not commit generated deployment credentials, database passwords, smoke-test credentials, secret Supabase keys, or email-provider keys.
- Do not use a Store URL as the Admin canonical origin; Admin and Store origins are separate configuration-owned values.

## Verification

`npm run smoke:runtime-config` enforces package identity, env-file tracking rules, blank `.env.example` values, the strict source-wide `NEXT_PUBLIC_` allowlist, public/server-only Supabase boundaries, Store activation-origin ownership, runtime documentation, and smoke-chain wiring. It is also included in the main Admin `npm run smoke` chain.
