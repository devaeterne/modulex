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
