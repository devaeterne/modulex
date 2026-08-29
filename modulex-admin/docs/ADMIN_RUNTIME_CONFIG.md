# Modulex Admin Runtime Configuration

Last reviewed: 2026-08-29
Baseline main: `23e5d365876dc65dae9a46645f0627d8f38bc683`

This document is the runtime/configuration contract for `modulex-admin`. It records what belongs in source, what belongs in deployment configuration, and which values must never reach the browser bundle.

## Vercel deployment contract

- Vercel project: `modulex`
- Root directory: `modulex-admin`
- Production branch: `main`
- Production hostnames and custom-domain aliases are **configuration-owned** in Vercel. Do not hardcode a Vercel preview hostname, deployment hostname, or Store hostname in Admin source code.
- `NEXT_PUBLIC_SITE_URL` represents the canonical Modulex Admin origin when application code needs an absolute Admin URL. Its concrete value belongs in the target environment configuration.

The latest verified production deployment before this package was `READY`, targeted `production`, built from `main`, and reported `gitRootDirectory=modulex-admin`. The connected Vercel deployment API exposed that deployment metadata, but the project/domain-detail endpoint did not expose the custom-domain alias in this session. Therefore this repository does not claim an unverified hostname as canonical.

## Environment exposure matrix

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project API URL used by the authenticated browser client. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable key used with Auth/RLS. |
| `NEXT_PUBLIC_SITE_URL` | Browser-safe | Canonical Modulex Admin origin supplied by deployment configuration. |
| `SUPABASE_SECRET_KEY` | Server-only | Preferred elevated Supabase key for trusted server code. Bypasses RLS and must never reach the client bundle. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only legacy fallback | Legacy elevated key retained only for compatible deployments. Prefer `SUPABASE_SECRET_KEY`. |
| `RESEND_API_KEY` | Server-only | Transactional email provider credential. |
| `SUPABASE_DB_URL` | Local/CI smoke only | Direct or Session Pooler Postgres connection used by terminal DB smoke tests. |
| `SMOKE_TEST_EMAIL` | Local/CI smoke only | Authenticated Admin smoke-test identity. |
| `SMOKE_TEST_PASSWORD` | Local/CI smoke only | Smoke-test credential; never a browser variable. |

## Supabase key boundary

The browser client in `src/lib/supabase/client.ts` may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Publishable keys are designed for public application components and rely on Auth/RLS for row-level authorization.

Elevated access lives in `src/lib/supabase/server-admin.ts`, which is protected by `server-only`. It prefers `SUPABASE_SECRET_KEY` and retains `SUPABASE_SERVICE_ROLE_KEY` only as a legacy fallback. Both elevated key types bypass RLS and must never be imported by a Client Component, placed in a `NEXT_PUBLIC_` variable, committed to source control, or logged.

## Repository rules

- `.env*` files are ignored because they may contain credentials.
- `.env.example` is the only tracked env template and contains variable names/comments only, never concrete values.
- `.vercel/` remains local and untracked.
- Do not commit generated deployment credentials, database passwords, smoke-test credentials, secret Supabase keys, or email-provider keys.
- Do not use a Store URL as the Admin canonical origin.

## Verification

`npm run smoke:runtime-config` enforces package identity, env-file tracking rules, blank `.env.example` values, public/server-only Supabase boundaries, runtime documentation, and smoke-chain wiring. It is also included in the main Admin `npm run smoke` chain.
