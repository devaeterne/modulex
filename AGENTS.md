# Modulex Agent Instructions

These instructions apply repo-wide unless a more specific `AGENTS.md` overrides them.

## Source of truth

- Always work from the current `main`; parallel Modulex work is common, so never rely on remembered SHAs or stale chat context.
- For Admin work, read `modulex-admin/ADMIN_ROADMAP.md` first. For Store work, read `modulex-store/STORE_ROADMAP.md` first. Cross-surface changes must respect both.
- Preserve existing architecture and contracts unless the task explicitly requires changing them.

## Efficient execution / token discipline

- Be concise and operational. Do not narrate routine tool calls, file reads, or commands.
- Do not perform repo-wide discovery unless the task genuinely requires it. Inspect only files directly relevant to the requested scope.
- Prefer one targeted search/read over repeated broad searches. Do not re-read unchanged files without a reason.
- Reuse established context, contracts, and prior accepted decisions instead of rediscovering them.
- Start with targeted tests/contracts. Run full typecheck/lint/build only at the final gate, after changes that can affect them, or when a project workflow explicitly requires them.
- Do not rerun the same passing test suite when nothing relevant changed.
- Run Supabase Security/Performance Advisors when schema, RLS, grants, functions, RPCs, or material query/index behavior changes; otherwise do not run them just for ceremony.
- Run Vercel/live-production checks only when deployment/runtime acceptance is required or the change can affect production behavior.
- Do not fix unrelated findings unless they block the requested task. Record blockers briefly and stay in scope.
- Avoid speculative refactors, migrations, indexes, abstractions, or cleanup.
- Keep intermediate updates short; if there is no blocker or decision needed, continue working.

## CI workflow governance

- Treat `docs/CI_WORKFLOW_ARCHITECTURE.md` as the source of truth for the approved workflow inventory and responsibility boundaries.
- Before adding any `.github/workflows/*` file, inspect existing workflow path coverage and contract commands for overlap.
- Prefer extending an existing workflow whenever it can own the new contract without violating its responsibility boundary.
- Do not create duplicate workflow wrappers that repeat `npm ci`, lint, typecheck, build, RBAC, production-surface, or an already-owned domain contract.
- A genuinely new workflow file requires explicit user approval before creation. After approval, update the approved inventory and the CI architecture contract in the same change.
- `Admin UI Foundation` is the sole global Admin UI/quality owner, including `AdminUICheck.md`, `ADMIN_UI_GUIDE.md`, Admin UI strict checks, production-surface, RBAC, typecheck, lint, and Admin build.
- The normal broad Store PR gate is `Store Core CI`; GC-5 remains the specialized write-capable exception and must not be made interruptible.
- Run `npm run smoke:ci-workflow-architecture` when workflow files or CI governance documentation change.

## Safety and production discipline

- Never expose service-role/elevated credentials to browser code.
- Do not weaken RLS/RPC/grant boundaries to make implementation easier.
- Prefer read-only or rollback-only production acceptance. Do not mutate production business data unless the task explicitly requires it and the change is reviewed/safe.
- For migrations, verify current production data satisfies new constraints before applying them.
- Preserve backward compatibility across Admin, Store, and shared Supabase boundaries when rollout order matters.

## Roadmap and completion

- Mark roadmap work `[~]` while active and `[x]` only after its stated verification criteria pass.
- Do not declare a package CLOSED before required production deployment/acceptance is complete.
- Keep final reports compact (normally 10–15 lines): what changed, tests, migration/deploy status, blockers, branch, commit SHA, and PR.

## Admin UI consistency

- Before changing Admin UI, read `modulex-admin/docs/ADMIN_UI_GUIDE.md`.
- Reuse existing shared Modulex components; do not create route-specific buttons, inputs, cards, tables, badges, modals, or page headers when a shared component exists.
- Do not copy TailAdmin demo markup into production business surfaces.
- Do not override shared component appearance with arbitrary Tailwind. If a required state is missing, extend the reviewed shared variant API.
- New reusable visual patterns belong in the shared UI layer first.
- Every new or modified Admin feature UI file must pass `npm run smoke:admin-ui-strict` in addition to the existing Admin UI regressions.
- Do not add feature-level strict-gate suppression comments or ignore flags. If a valid state is missing, extend the reviewed shared primitive/token API and its centralized contract instead of bypassing the gate.
- UI-changing PRs must run the Admin UI regression contract.

## Admin validation and mutation consistency

- Before changing an Admin form, input, or mutation, read `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md` and verify the authoritative DB/RPC contract first.
- Frontend validation is an early UX guard only; DB constraints, RPC validation, lifecycle triggers, grants, and RLS remain authoritative.
- Normalize empty strings, whitespace, identifiers, enums, booleans, numbers, dates, and optional fields explicitly. Never cast a non-UUID identifier to UUID.
- Prevent duplicate submits. Use the existing idempotency boundary for sensitive stock, order, and pricing mutations, and do not bypass an existing RPC with direct table writes.
- Optimistic UI requires explicit rollback/error reconciliation; failed mutations must not leave success state or stale local data.
- Preserve append-safe audit/history semantics. Physical delete is not the default for historical, referenced, or audited business entities.
- Protected actions must be authorized across UI, route/server boundary, RPC/function, grants, RLS, and DB lifecycle guards; hiding a button or checking `authenticated` alone is not authorization.
- Data-heavy screens must expose loading, empty, populated, error/retry, and permission-denied states and must honor server-side pagination/filter/search contracts.
- Shared schema/RPC changes require Admin, Store, Customer Portal, and Dealer Portal regression checks where those consumers can be affected.
