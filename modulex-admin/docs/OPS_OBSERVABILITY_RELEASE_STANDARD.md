# Modulex Admin — Observability, Audit & Release Standard

Status: **OPS-A1 → OPS-A4 closeout contract**

Production Supabase: `bzjoeernnmvuhzyvbowc`

This document is the operational contract for Modulex Admin. It defines the minimum error visibility, high-risk audit/event shape, canonical migration rollout policy, and Admin release checklist. It intentionally reuses existing audit/event/queue sources instead of creating a new ledger for every domain.

## Operating principles

1. **Operational evidence must be actionable, not verbose.** Prefer stable error/action codes, internal entity IDs, correlation/request IDs, status, attempt counters, and timestamps over raw payloads.
2. **Secrets and PII are never debugging payloads.** Logs reference canonical records; they do not duplicate customer, employee, vendor, OAuth, email, or document contents.
3. **Database truth stays canonical.** Durable domain/audit state belongs in existing Supabase tables. Vercel/runtime logs are diagnostic evidence, not a business ledger.
4. **Known Advisor debt is not equivalent to a release regression.** Every DB-affecting release takes a fresh Security Advisor and Performance Advisor snapshot and blocks on new/untriaged material findings in the changed scope. Existing intentional or separately-owned RBS/PRF findings remain explicitly tracked rather than being hidden or treated as zero.
5. **Production migrations are append-only once shared/applied.** Prefer backward-compatible expansion and a later forward-fix/contract migration over destructive rollback.

---

# OPS-A1 — Error monitoring baseline

## Minimum operational error event

Every production-relevant error path must provide enough safe context to answer **what failed, where, when, for which internal operation, and whether retry is possible**.

Minimum fields, where applicable:

- `occurred_at`: UTC server/database timestamp.
- `surface`: `client`, `server`, `api`, `background_job`, `vendor_sync`, `calendar_sync`, or `email_queue`.
- `severity`: `warning`, `error`, or `critical` for operator-relevant failures.
- `operation`: stable operation/job/route identifier; never a raw request body.
- `error_code`: stable internal/provider-safe code. Do not persist raw provider responses as the primary error field.
- `request_id` / `correlation_id`: request or job identity when available.
- `idempotency_key`: only when the operation already has an idempotency identity and exposing the key does not reveal user data.
- `actor_id`: authenticated internal user/profile ID, or `system` for background work. Do not copy names/emails into logs.
- `entity_type` + `entity_id`: internal identifiers when useful and authorized.
- `attempt` / `max_attempts` / `next_attempt_at`: retry state for queue/job failures.
- `safe_context`: allowlisted technical metadata only; never arbitrary payload/request serialization.

A user-facing message is not the operational event. UI copy remains safe and concise; detailed diagnosis uses the event/queue state and its correlation identity.

## Surface-by-surface baseline

| Surface | Minimum capture | Operator visibility | Retry / escalation expectation |
| --- | --- | --- | --- |
| **Client** | User-safe failure state plus stable operation/error identity. Unhandled render/action failures must not expose raw exception text or request payloads. | Browser diagnostics may assist development, but production-relevant failures must correlate to a server/API request, queue record, or explicit telemetry path before they are considered centrally observable. | Retry only where the mutation is idempotent/retry-safe; otherwise present a safe recovery path. |
| **Server** | Structured server-side error with operation, severity, safe code, correlation/request identity, actor/entity IDs when available. | Vercel/server runtime logs. | `critical` for security/integrity failures; `error` for failed operations; avoid log-and-swallow. |
| **API** | HTTP status + safe public error code; server-side structured event for unexpected `5xx` and material integration failures. | Vercel function logs plus canonical domain/queue record when durable state exists. | Never return stack traces, secrets, provider bodies, or raw DB exceptions to the browser. |
| **Background jobs** | Durable `status`, attempt counter, next-attempt/availability timestamp, terminal failure code/time. | Canonical job/queue table and server logs for execution diagnostics. | Bounded retries; terminal failure remains queryable until resolved/retained by its domain policy. |
| **Vendor sync** | Run/check identity, vendor scope, status, counts, `failed_count`, bounded `error_summary`. | Existing `vendor_catalog_runs` and `vendor_catalog_checks`. | A failed scoped run cannot silently mark unrelated catalog rows missing; retry remains scoped/idempotent. |
| **Calendar sync** | Job/outbox/link status, attempt count, last error time/code, direction/action audit where applicable. | Existing `calendar_sync_jobs`, `calendar_sync_outbox`, `calendar_provider_event_links`, and `calendar_sync_audit`. | Retries remain deduped/bounded; conflict resolution is auditable. |
| **Email queue** | Delivery status, attempts/max attempts, next retry, terminal `failure_code`/safe `last_error`, processed/sent timestamps. | Existing `email_notifications`; support-request delivery also uses `support_request_email_deliveries`. | Failed delivery remains operator-queryable; retries must not create duplicate business events. |

The baseline does **not** require a new observability vendor or a new database ledger. If a future telemetry provider is introduced, it must ingest the same safe event shape and redaction rules.

## Secret and PII logging policy

### Never log or persist in operational error context

- Supabase service-role keys, JWTs, session/access/refresh tokens, `Authorization` headers, cookies, password/reset/invite secrets.
- OAuth client secrets, provider access/refresh tokens, webhook secrets, Resend/SMTP/API keys, private signing keys.
- Raw request/response bodies by default, raw provider payloads, SQL connection strings, environment dumps.
- Passwords or authentication credentials in any form.
- Full customer/employee/vendor PII: personal email/phone/address, tax/payroll/bank data, document contents, signature data, free-form notes, uploaded document bodies.

### Allowed diagnostic references

- Internal UUIDs and stable entity IDs when access to the logging system is appropriately restricted.
- Non-secret operation names, route templates, provider names, stable error codes, HTTP status, attempt counts, timestamps.
- Email delivery debugging references the `email_notifications.id` / delivery row ID; it does not repeat the email body or recipient list in runtime logs.
- If a provider error string may contain user data or credentials, map it to a bounded internal `error_code` and retain only an allowlisted summary.

### Redaction rule

Any logging/helper implementation must default to **deny unknown payloads**. A field is logged because it is explicitly allowlisted, not because it was present on an exception/request object. Static CI checks cover direct secret-to-console regressions; runtime review remains required for structured payloads.

---

# OPS-A2 — High-risk audit/event standard

A high-risk mutation is any action that changes money/accounting truth, authorization, lifecycle/status with business consequence, stock/fulfillment truth, external synchronization identity, approval/acceptance, or destructive/reversal state.

## Minimum audit contract

High-risk mutation evidence must resolve the following fields, either in one audit row or by an explicit join to an existing idempotency/request source:

- **actor** — authenticated user/profile ID, or a named system actor for trusted background work.
- **timestamp** — database/server-generated UTC timestamp; never trusted from the browser.
- **entity** — stable entity type plus primary entity ID.
- **action** — stable semantic action (`post`, `void`, `reverse`, `approve`, `status_change`, `role_add`, `sync_conflict_resolved`, etc.).
- **before/after or semantic delta** — full bounded snapshots where appropriate, or a purpose-built semantic delta/event (`from_status` → `to_status`, quantity delta, amount delta, role set change).
- **reason** — required for destructive, reversal/void, cancellation, rejection, privileged override, and other actions where operator intent materially matters. A domain may require it more broadly.
- **request/idempotency identity** — request ID, idempotency key/fingerprint, event key, dedupe key, or equivalent retry identity for retryable/high-value mutations.

The audit record must be immutable/append-safe after creation. Corrections are new events/reversals, not edits that erase prior evidence.

## Existing audit/event sources to reuse

Do **not** create a new domain ledger solely to satisfy OPS-A2. Reuse the narrowest existing source that already owns the business event:

| Domain/family | Existing source(s) | Contract role |
| --- | --- | --- |
| Generic CRUD/audit | `audit_logs` | Generic `old_data`/`new_data`, actor and timestamp where no stronger domain ledger exists. |
| Orders / Projects | `customer_order_status_history`, `customer_project_status_history` | Lifecycle semantic delta, note/reason, actor/time. |
| Inventory | `inventory_movements` / `v_inventory_movement_history` | Append-safe quantity/location movement history and reason/reference. |
| Project payments | `customer_project_payment_audit_log`, `customer_project_payment_requirement_audit_log` | Before/after/allocation snapshots, actor, reason. |
| Procurement | `customer_project_procurement_events`, `customer_project_procurement_delivery_events` | Requirement/commitment/delivery semantic events and correction/reason chain. |
| Change orders / commissions | `customer_project_change_order_events`, `project_commission_events` | Approval/status and amount-delta/reversal evidence. |
| Finance | `finance_transaction_audit`, `finance_payment_instrument_audit`, `finance_idempotency_requests` | Financial before/after, reason, actor plus request fingerprint/idempotency identity. |
| Vendor/AP | `vendor_audit_log`, `vendor_invoice_audit`, `vendor_payment_schedule_audit`, `vendor_invoice_idempotency_requests` | Vendor/Bill/Schedule before/after and retry identity. |
| HR | `hr_employee_history` | Employee lifecycle/data delta and actor/time; payroll money movement remains Finance-owned. |
| Users/RBAC | `user_role_change_audit` | Immutable target/actor/from_roles/to_roles evidence. |
| Calendar | `calendar_sync_audit` plus sync job/outbox/link identities | Direction/action/resolution evidence and retry/correlation state. |
| Email/notifications | `email_notifications.event_key` and queue lifecycle | Business event/dedupe identity; delivery failures are operational queue state, not a new audit ledger. |

When the request/idempotency identity is stored in an adjacent table (for example Finance/Vendor idempotency tables or queue/event keys), the domain contract must preserve a deterministic relationship to the audited mutation/result.

## Review rule for new high-risk mutations

A PR introducing or materially changing a high-risk mutation must state:

1. which existing audit/event source records it;
2. where actor/time/entity/action are captured;
3. how before/after or semantic delta is represented;
4. when/where a reason is required;
5. which request/idempotency identity makes retry/correlation safe.

If no existing source can satisfy the contract, prefer the shared `audit_logs` pattern or extend the owning domain's existing event source. Creating a parallel ledger requires an explicit architectural reason.

---

# OPS-A3 — Migration rollout / rollback runbook

## Canonical ownership

- **Canonical Supabase migrations:** `modulex-store/supabase/migrations`.
- `modulex-admin/supabase/migrations` is a **secondary compatibility mirror only where an established mirror already exists**. It must remain a semantic subset of canonical migrations and is never the source used to decide production history.
- Production migration state is read from Supabase project `bzjoeernnmvuhzyvbowc`; chat history, stale roadmap counts, or a local mirror are not authoritative.

## Preflight

Before merge/apply for any DB-affecting release:

1. Re-read execution-time latest `main` SHA and open PRs; resolve overlapping migration/domain work.
2. Compare canonical migration files in the PR with the production migration list; never assume a migration is pending/applied from filename alone.
3. Verify the change is backward compatible with the currently deployed Admin/Store version, or split it into an **expand/contract** sequence.
4. Review RLS/grants/RPC `SECURITY DEFINER`/`search_path`, indexes, constraints, lock/data-volume risk, and idempotency/retry behavior relevant to the change.
5. For data backfills, use bounded/idempotent statements where practical and avoid hard-coded generated IDs.
6. Capture fresh Security Advisor and Performance Advisor results before/after material DDL. Classify changed-scope findings; do not hide known RBS/PRF debt by reporting only counts.
7. CI must pass the applicable domain contracts plus Admin global typecheck/lint/build gates before production rollout.

## Merge / apply / deploy order

Default order for a backward-compatible schema expansion:

1. Merge the PR containing **canonical migration + compatible application code + contract/docs update**.
2. Re-check the merged `main` SHA and production migration state.
3. Apply pending canonical migration(s) from merged `main` to production.
4. Re-run relevant DB acceptance and fresh Advisors.
5. Deploy/promote the Admin/Store application version that consumes the new schema.
6. Run signed-in production smoke and confirm zero test residue.

The schema expansion must remain compatible with the old app during the migration→deploy gap. If that cannot be guaranteed, redesign as expand/contract across releases:

- **Expand:** add nullable/new structures/RPC overloads without breaking old callers.
- **Migrate/deploy:** move readers/writers to the new contract and verify production behavior.
- **Contract:** remove obsolete columns/functions/grants only in a later release after old callers are gone.

## Failed migration handling

- Stop the release; do not continue application deploy on an unknown schema state.
- Inspect Supabase migration history and the actual schema before retrying.
- Never manually delete/forge migration-history rows to make the dashboard look green.
- If a migration failed before it was recorded/applied anywhere shared, it may be corrected before release and rerun after verifying no partial external side effects.
- Once a migration has been applied to production or another shared environment, **do not rewrite/delete the historical migration**. Add an append-only forward-fix migration.
- If a failure involved external systems or non-transactional effects, verify those effects independently; do not assume PostgreSQL rollback reverted them.

## Rollback vs append-only forward-fix

**Forward-fix is the default after production DDL.** Use rollback only when all of the following are true:

- the reversal is pre-understood and bounded;
- it does not discard valid production data or audit history;
- both currently deployed and target application versions remain compatible;
- the rollback itself is represented by a new canonical migration/evidence when schema history has already advanced.

Do not implement a rollback by editing an already-applied SQL file. Destructive `DROP`, type narrowing, grant removal, column renames/removals, and data transformations should normally use expand/contract rather than emergency reversal.

## Advisor gate

A DB-affecting release records both **Security Advisor** and **Performance Advisor** evidence after DDL. Release is blocked for:

- a new material `WARN`/security exposure in changed scope;
- a newly introduced RLS/grant/RPC authorization regression;
- a new high-impact performance finding caused by the change and left untriaged;
- inability to explain why a changed-scope finding is intentional.

Existing warnings owned by open RBS/PRF workstreams remain visible in the release record; they are not silently waived and do not require an artificial zero-count baseline.

---

# OPS-A4 — Admin release checklist

Use this checklist for every Admin release that changes application code, shared Supabase behavior, or production-operational contracts.

## 1. Source / conflict preflight

- [ ] Record execution-time **latest main** SHA immediately before release.
- [ ] Query **open PRs** and check conflicts/overlap in the touched domains/migrations.
- [ ] Confirm the release commit is based on current `main`; rebase/update when required.

## 2. CI / executable contracts

- [ ] Required GitHub CI is green for the release commit.
- [ ] Admin global gates pass: `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] Relevant smoke/domain contracts pass, including `ops-observability-release-contract.mjs` for this standard.
- [ ] Documentation references and roadmap/acceptance state are internally consistent.

## 3. Migration gate

- [ ] Identify every canonical migration under `modulex-store/supabase/migrations` introduced by the release.
- [ ] Compare against production `list_migrations`; do not apply a duplicate or skip an expected migration.
- [ ] Verify backward compatibility / expand-contract plan.
- [ ] Apply only from merged canonical history; verify resulting production migration state.

If the release has no migration, explicitly record **No migration** rather than skipping this gate silently.

## 4. Advisor gate

- [ ] Capture fresh **Security Advisor** after DB changes (or record fresh pre-release snapshot for a no-DDL release when security context matters).
- [ ] Capture fresh **Performance Advisor** after DB changes.
- [ ] Triage new/changed-scope findings; link existing known RBS/PRF debt rather than claiming zero warnings.

## 5. Vercel deploy

- [ ] Confirm the expected commit is deployed/promoted to the correct Admin production project/environment.
- [ ] Vercel deployment is Ready/healthy; no build/runtime configuration error is present.
- [ ] Verify server-only secrets remain server-only; no secret was moved to `NEXT_PUBLIC_*` to fix a deployment.

## 6. Signed-in production smoke

- [ ] Sign in with an authorized test/operator account.
- [ ] Exercise the release's highest-risk read/write path plus one authorization-negative path when relevant.
- [ ] Confirm API/server errors expose safe user messages and leave operator-correlatable evidence.
- [ ] Verify affected background/vendor/calendar/email queue state when the release touches those surfaces.

## 7. Zero test residue

- [ ] Remove or rollback every test customer/order/project/vendor/payment/calendar/email/etc. record created for acceptance.
- [ ] Confirm no queue/job remains artificially pending/failed due to the smoke.
- [ ] Confirm no test file/object/document remains in storage.

Production acceptance should be read-only or rollback-only whenever possible.

## 8. Roadmap / acceptance handoff

- [ ] Update `modulex-admin/ADMIN_ROADMAP.md` in the same PR when a coded roadmap item closes.
- [ ] Update/add the relevant acceptance evidence and note intentional warnings/deferred debt.
- [ ] Record release SHA, migration result, Advisor status, Vercel result, signed-in smoke result, and residue result so operation does not depend on chat history.

## Release record template

```text
Release SHA:
Open PR conflict check:
CI:
Canonical migration(s):
Production migration result:
Security Advisor:
Performance Advisor:
Vercel deployment:
Signed-in smoke:
Zero test residue:
Roadmap/acceptance update:
Operator / timestamp:
```

## Hard blockers

Do not call a release complete while any of these is unresolved: failed required CI, unknown production migration state, a material new security regression, failed Vercel deploy, failed signed-in high-risk smoke, or known test residue.
