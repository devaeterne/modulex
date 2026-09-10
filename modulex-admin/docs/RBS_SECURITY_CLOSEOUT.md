# RBS — RBAC & Security Hardening Closeout

Date: 2026-09-11
Production Supabase: `bzjoeernnmvuhzyvbowc`
Baseline main: `1291482a7f835a727ba7a1681cbb81478e7b397c`
Scope: RBS-A1 → RBS-A5 only. Performance-only index cleanup is explicitly excluded.

## Executive result

RBS is closed against the production schema and the current Admin permission model.

The closeout does **not** treat a zero Supabase Security Advisor count as the goal. Modulex intentionally exposes guarded `SECURITY DEFINER` RPCs as API boundaries and intentionally keeps RPC/internal tables RLS-enabled with no direct policies. The acceptance gate is instead:

- every exposed `SECURITY DEFINER` has a fixed `search_path`;
- no exposed `SECURITY DEFINER` retains implicit `PUBLIC EXECUTE`;
- anonymous Store projections remain narrow and read-only;
- authenticated elevated RPCs have an authorization chain;
- internal function grants are limited to current public-wrapper dependencies;
- RLS/no-policy tables have no direct `anon` / `authenticated` table grants;
- cross-role negative acceptance remains fail-closed;
- production probes leave zero test residue.

## RBS-A1 — SECURITY DEFINER inventory

### Class 1 — intentional guarded public Store projection/API

The following nine Advisor-reported anonymous `SECURITY DEFINER` functions are intentional Store read APIs and remain callable by `anon` and `authenticated`:

1. `get_store_catalog_products(text,text,integer,integer)`
2. `get_store_product_by_slug(text)`
3. `get_store_public_chrome_items()`
4. `get_store_public_company_locations()`
5. `get_store_public_faq_entries()`
6. `get_store_public_page(text)`
7. `get_store_public_process_steps()`
8. `get_store_public_profile()`
9. `get_store_public_testimonials()`

Evidence:

- all nine have fixed search paths (`pg_catalog, public`, `pg_catalog, store_api_private`, or the stricter empty search path);
- projections are limited to published/active Store-facing data;
- the functions do not expose Product Cost / FOB / margin / internal audit data;
- the functions are read-only projections;
- an `anon` transaction probe successfully executed the Store catalog, chrome, locations, FAQ, process, profile, testimonials, facets, projects and lead-option public contracts after hardening.

These warnings are intentional and must not be “fixed” by breaking the Store public contract.

### Class 2 — authenticated wrapper with internal authorization

Fresh production inventory contains 153 authenticated-callable public `SECURITY DEFINER` functions. Nine are the Class 1 public Store functions above; the remaining **144 are authenticated-only elevated wrappers**.

The closeout inventory query proves:

- authenticated public SECDEF: `153`;
- authenticated-only public SECDEF: `144`;
- exposed SECDEF without fixed `search_path`: `0`;
- authenticated-only SECDEF without a direct auth signal or `private.*` authorization chain: `0`.

The wrappers cover Finance/AP/AR, Vendor, Project/Proposal/Change Order, Leads, notifications and other production domains where RLS bypass is deliberate but the public RPC is the authorization boundary. Representative production negative acceptance verified that an isolated Sales identity is denied Finance, Product Cost mutation and Store CMS mutation, while a non-Admin Finance identity can enter Finance but remains denied Product Cost and Store CMS mutation.

### Internal helper execution

A blanket revoke initially exposed an architectural dependency: many public `SECURITY INVOKER` wrappers intentionally call `private.*` or `store_api_private.*` functions. The follow-up migration therefore restores only dependency-derived grants rather than reopening every internal function.

Final state:

- `private` schema: `anon` USAGE = false; `authenticated` USAGE = true for authenticated wrapper chains;
- `store_api_private` schema: `anon` / `authenticated` USAGE = true for Store wrapper chains;
- internal `PUBLIC EXECUTE` ACL count = `0`;
- internal anon EXECUTE functions = `9`, all matched to current anonymous Store-wrapper dependencies;
- internal authenticated EXECUTE functions = `111`, all matched to current authenticated public-wrapper dependencies;
- internal anon/auth EXECUTE outside the generated wrapper dependency allowlist = `0`.

The internal schemas are implementation namespaces, not the canonical public RPC surface. Grants are dependency-scoped and no blanket `EXECUTE ON ALL FUNCTIONS` grant is restored.

### Class 3 — unnecessary exposure / defects closed

The hardening removed the following unnecessary exposure patterns:

- implicit `PUBLIC EXECUTE` from public `SECURITY DEFINER` functions;
- implicit/broad internal function execution not justified by a current public wrapper dependency;
- accidental anonymous execution of Admin/warehouse helpers:
  - `public.delete_location_if_empty(uuid)`
  - `public.delete_zone_if_empty(uuid)`
  - `public.get_customer_shipping_directory(uuid)`
- two legacy support RPC search paths using `public, pg_temp`; both are normalized to `pg_catalog, public`.

## RBS-A2 — RLS enabled / no-policy inventory

Fresh Advisor reports **41** RLS-enabled/no-policy tables. They are intentionally treated as RPC/internal tables; no permissive policy was added merely to silence the Advisor.

Inventory:

- Calendar/internal sync: `admin_calendars`, `calendar_business_event_extensions`, `calendar_events`, `calendar_integration_credentials`, `calendar_integration_settings`, `calendar_oauth_states`, `calendar_provider_event_links`, `calendar_sync_audit`, `calendar_sync_jobs`, `calendar_sync_outbox`, `calendar_watch_channels`, `google_calendar_event_mirror`, `project_calendar_bindings`, `project_calendar_event_links`.
- Project Change Order: `customer_project_change_order_applications`, `customer_project_change_order_events`, `customer_project_change_order_lines`, `customer_project_change_orders`.
- Project import: `customer_project_import_batches`, `customer_project_import_rows`.
- Proposal: `customer_project_proposal_acceptances`, `customer_project_proposal_areas`, `customer_project_proposal_artifacts`, `customer_project_proposal_order_conversion_areas`, `customer_project_proposal_order_conversion_lines`, `customer_project_proposal_order_conversions`, `customer_project_proposal_pricing_groups`, `customer_project_proposal_revisions`, `customer_project_proposals`, `proposal_area_types`.
- Finance/HR internal state: `finance_idempotency_requests`, `hr_payroll_finance_settlement_effects`, `hr_payroll_finance_settlement_state`.
- Leads/notifications/support: `email_notifications`, `store_lead_conversions`, `support_request_email_deliveries`.
- Vendor: `vendor_audit_log`, `vendor_compliance_documents`, `vendor_contacts`, `vendor_source_identities`, `vendors`.

Before RBS, 40/41 already had no client DML grant; `email_notifications` still had unnecessary direct client privileges. The canonical hardening migration revokes `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` from `anon` and `authenticated` on every current public RLS/no-policy relation.

Final invariant: **41 tables, 0 with direct client table grants**. Their Advisor INFO findings remain intentional because access is RPC/internal rather than direct-table.

## RBS-A3 — Auth hardening

Production leaked-password protection was freshly verified as **disabled**.

The production Supabase organization is on the **Free** plan. Supabase documentation states leaked-password protection / HaveIBeenPwned password screening is a Pro-plan feature, so it cannot be safely enabled in the current plan through this workstream.

No Auth setting was changed. Therefore invitation, recovery, password setup and login semantics were not altered by RBS. Existing Admin regression entry points `smoke:auth-recovery` and `smoke:auth-password-setup` remain the contract. The Advisor warning is registered as **plan-gated**, not silently ignored.

Upgrade action when the project moves to Pro: enable leaked-password protection, then rerun invitation/recovery/password-setup/login acceptance before removing this warning from the register.

## RBS-A4 — Permission matrix negative acceptance

Canonical roles:

- `super_admin`
- `admin`
- `sales`
- `finance`
- `hr`
- `warehouse`
- `shipping`

`modulex-admin/scripts/rbac-smoke.mjs` now permanently checks route/sidebar permission parity plus a seven-role negative matrix.

Key boundaries locked by the test and production metadata/probes:

- Store CMS: Admin/Super Admin only.
- Product Cost / cost-margin: Admin/Super Admin only; Finance has Finance operations and selling-pricing visibility, not internal Product Cost.
- Sales: no Finance and no Product Cost; Lead operations remain allowed.
- HR: Personnel domain only; no Finance/Pricing/Store/Inventory expansion.
- Warehouse: stock/inventory operations allowed; Warehouse/Zone/Location master mutation remains Admin/Super Admin only.
- Shipping: shipment operations and inventory read; no stock mutation/master mutation/Finance/Store CMS.
- Customer-visible order pricing RPC returns only `customer_visible_unit_price`, `customer_visible_discount_amount`, `customer_visible_line_subtotal`, and `customer_visible_line_total`; no cost, FOB or margin fields.
- `product_costs` SELECT/INSERT/UPDATE policies are guarded by `super_admin/admin` only.

Production transaction-safe negative probes:

- isolated Sales → Finance overview: denied;
- isolated Sales → Product Cost mutation: denied;
- isolated Sales → Store lead-form/CMS mutation: denied;
- Finance → Finance overview: allowed;
- Finance → Product Cost mutation: denied;
- Finance → Store lead-form/CMS mutation: denied.

No fixture rows were created; probes were read-only or rolled back.

## RBS-A5 — Closeout evidence

### Canonical migrations

- `20260910230012_rbs_security_hardening.sql`
- `20260910230609_rbs_wrapper_dependency_repair.sql`

Both are append-only and match production migration history. The second migration is intentionally separate: it repairs discovered wrapper dependencies without rewriting already-applied history.

### Fresh final Security Advisor

Observed at: `2026-09-10T23:09:57.327Z`

| Finding | Count | Closeout decision |
| --- | ---: | --- |
| RLS enabled / no policy | 41 | Intentional RPC/internal tables; direct client grants = 0 |
| anon executable SECURITY DEFINER | 9 | Intentional narrow Store public read APIs |
| authenticated executable SECURITY DEFINER | 153 | 9 public Store + 144 authenticated elevated wrappers with authorization chain |
| leaked password protection disabled | 1 | Verified; Pro-plan gated on current Free project |

### Search path / grants / escalation checks

- exposed SECDEF without fixed search path: `0`;
- public SECDEF with implicit `PUBLIC EXECUTE`: `0`;
- internal function with `PUBLIC EXECUTE`: `0`;
- internal client EXECUTE outside current public-wrapper dependency allowlist: `0`;
- public RLS/no-policy table with direct anon/auth table privileges: `0`;
- accidental anon Admin/warehouse wrappers listed above: revoked;
- public Store read contracts: anon smoke passed after both migrations.

### Rollback / residue

The hardening SQL and dependency repair were first exercised inside rollback transactions. Production role probes were also executed transaction-safely. No RBS test entity, lead, pricing row, cost row, warehouse row or Finance transaction was persisted.

## Intentional warning register

The final Advisor warnings are retained only where the warning describes an intentional architecture rather than an exploitable grant:

1. Nine anonymous Store read SECDEF APIs — required public projection boundary.
2. 153 authenticated SECDEF APIs — elevated wrapper boundary with fixed search path and internal authorization chain; negative role probes remain mandatory.
3. 41 RLS/no-policy tables — RPC/internal access only; direct client table grants are revoked.
4. Leaked-password protection — current Free-plan limitation; enable and retest when Pro is adopted.

Any future migration that adds a public SECDEF, an RLS/no-policy relation, or an internal wrapper dependency must either fit one of these documented contracts or update this register and the RBAC smoke in the same PR.
