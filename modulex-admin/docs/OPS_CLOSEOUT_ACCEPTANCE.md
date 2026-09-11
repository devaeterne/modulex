# OPS / Observability & Release Closeout Acceptance

Date: 2026-09-11

Scope: `OPS-A1` → `OPS-A4`

Production Supabase: `bzjoeernnmvuhzyvbowc`

## Execution-time baseline

- Starting `main`: `015b9c4d2811d4e7ba3d141590f271876909d7ef`
- Open PRs at start: **0**
- Latest production migration observed at start: `20260910231259_order_margin_assessment_hardening`
- Admin production Vercel project `modulex` was **READY** at deployment `dpl_GaxpPQVP6U8r6JZq3bAsimxm8ana`, commit `7054111be7b18cb88ccafe97f8923b6601b64c09` (`perf(admin): close PRF performance workstream (#445)`). This is a pre-existing deployed-SHA lag behind the starting `main`; this OPS PR does not promote production. OPS-A4 therefore requires an explicit expected-SHA/deployed-SHA check instead of assuming `main` is live.
- This OPS closeout introduces **no production schema migration**. It standardizes existing observability/audit/release contracts and adds CI-enforced documentation/migration-ownership checks.

## Fresh production Advisor snapshot

Captured before OPS implementation on 2026-09-11. These numbers are evidence of the execution-time baseline, not permanent release thresholds.

### Security Advisor

| Finding | Level | Count | Ownership / release interpretation |
| --- | --- | ---: | --- |
| `rls_enabled_no_policy` | INFO | 41 | Existing RBS inventory/intentional RPC-only review; not created by OPS. |
| `anon_security_definer_function_executable` | WARN | 9 | Existing RBS SECURITY DEFINER inventory. Release blocks on new/changed-scope exposure, not on pretending the baseline is zero. |
| `authenticated_security_definer_function_executable` | WARN | 153 | Existing RBS SECURITY DEFINER inventory. Same changed-scope rule. |
| `auth_leaked_password_protection` | WARN | 1 | Existing RBS auth-hardening item. |

### Performance Advisor

| Finding | Level | Count | Ownership / release interpretation |
| --- | --- | ---: | --- |
| `unindexed_foreign_keys` | INFO | 59 | Existing PRF index triage. New changed-scope regressions must still be assessed. |
| `unused_index` | INFO | 470 | Existing PRF inventory; not a delete-all instruction. |

The Admin release checklist therefore requires a fresh Advisor snapshot plus **changed-scope triage**. It does not require all historical Advisor findings to be zero before unrelated safe releases can proceed.

## Production observability sources verified

The production schema already provides durable error/job state for the integration surfaces OPS-A1 names:

- Vendor sync: `vendor_catalog_runs`, `vendor_catalog_checks` (`status`, counts, `failed_count`, bounded `error_summary`, timestamps).
- Calendar sync: `calendar_sync_jobs`, `calendar_sync_outbox`, `calendar_provider_event_links` (`status`, attempts, `last_error_at`, `last_error_code`) and `calendar_sync_audit`.
- Email queue: `email_notifications` (`status`, attempts/max attempts, `failure_code`, `last_error`, retry/processed/sent timestamps) and `support_request_email_deliveries`.

Client/server/API visibility remains governed by the safe structured-error contract in `OPS_OBSERVABILITY_RELEASE_STANDARD.md`; runtime logs are diagnostic and do not replace business/audit ledgers.

## Existing audit/event sources verified

OPS-A2 reuses existing production sources instead of creating a new ledger per domain. Verified families include:

- `audit_logs`
- `customer_order_status_history`
- `customer_project_status_history`
- `customer_project_payment_audit_log`
- `customer_project_payment_requirement_audit_log`
- `customer_project_procurement_events`
- `customer_project_procurement_delivery_events`
- `customer_project_change_order_events`
- `project_commission_events`
- `finance_transaction_audit`
- `finance_payment_instrument_audit`
- `finance_idempotency_requests`
- `vendor_audit_log`
- `vendor_invoice_audit`
- `vendor_payment_schedule_audit`
- `vendor_invoice_idempotency_requests`
- `hr_employee_history`
- `user_role_change_audit`
- `calendar_sync_audit`

These sources collectively cover actor/time/entity/action and domain-appropriate before/after or semantic delta. Request/idempotency identity may live in an adjacent canonical idempotency/event/queue source when that is the established domain design.

## Migration ownership decision

Canonical Supabase ownership remains:

`modulex-store/supabase/migrations`

`modulex-admin/supabase/migrations` is a secondary compatibility mirror only. The executable OPS contract checks that every SQL file in the Admin mirror has a same-semantic-name canonical counterpart, preventing the mirror from becoming an orphan source of production truth.

## Executable enforcement

`modulex-admin/scripts/ops-observability-release-contract.mjs` enforces the closeout at repository level. It verifies:

- OPS-A1 required surfaces and secret/PII policy remain documented.
- OPS-A2 minimum audit fields and existing-source reuse remain explicit.
- OPS-A3 canonical migration ownership, expand/contract, failed-migration and forward-fix rules remain explicit.
- Admin migration mirror remains a semantic subset of canonical migrations.
- OPS-A4 retains latest-main, open-PR conflict, CI, migration, Security/Performance Advisor, Vercel, signed-in smoke, zero-residue, and roadmap/acceptance gates.
- `ADMIN_ROADMAP.md` keeps OPS-A1 → OPS-A4 closed.
- The approved Admin global CI workflow continues to execute the OPS contract.
- Direct source logging of high-risk secret environment values is rejected by a narrow static guard.

## Closeout result

- OPS-A1: **closed** — minimum operational error visibility and secret/PII logging rules are defined against current runtime/queue sources.
- OPS-A2: **closed** — minimum high-risk audit contract is defined and mapped to existing audit/event/idempotency sources without a new per-domain ledger.
- OPS-A3: **closed** — canonical migration ownership, preflight, merge/apply order, compatibility, failure handling, rollback/forward-fix, and Advisor gates are documented and partially executable.
- OPS-A4: **closed** — Admin release checklist is documented and repository-enforced; CI remains the evidence source for typecheck/lint/build/contracts.

No production data mutation was required for this closeout, so acceptance leaves zero database/storage test residue by construction.
