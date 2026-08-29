# Store lint/smoke verification — 2026-08-29

Verification source: GitHub Actions run `33240052150` on commit `2374b7873ef42c9e60654d040366acdae6d742bf`.

- `npm run lint`: PASS with 0 errors and 11 warnings.
- `npm run smoke`: PASS.
  - public production contract: PASS
  - secondary CMS contract: PASS
  - client smoke: 7/7 PASS
  - public API smoke: 10/10 PASS
  - dealer activation/auth/store portal/portal experience/auth RPC guard/public navbar contracts: PASS
- `npm run build`: PASS.
  - Next.js 16.1.6 compiled successfully.
  - TypeScript completed successfully.
  - static generation completed 34/34 routes.

The lint fix excludes shipped legacy/vendor browser bundles under `public/assets/js/**` from application-source linting and removes the remaining first-party lint errors without changing the intended runtime behavior.
