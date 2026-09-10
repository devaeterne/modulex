# PRF — Admin + Supabase Performance Closeout

Date: 2026-09-11  
Production Supabase: `bzjoeernnmvuhzyvbowc`  
Production migration: `20260910230417_prf_admin_supabase_performance_closeout`  
Scope: PRF-A1 → PRF-A4

## Executive result

This closeout is evidence-driven rather than Advisor-count-driven. The production workload justified one new FK index, not all 60 initial FK findings. RLS performance findings were removed without widening authorization. Admin read-path work removes verified serial round-trips and adds shared route loading/error boundaries. Existing server-side pagination and lazy chart behavior are preserved.

| Fresh Performance Advisor | Before | After | Decision |
| --- | ---: | ---: | --- |
| `unindexed_foreign_keys` | 60 | 59 | One workload-justified covering index added; 59 intentionally retained pending future workload evidence. |
| `auth_rls_initplan` | 1 | 0 | Fixed without predicate/role expansion. |
| `multiple_permissive_policies` | 1 | 0 | `store_pages` SELECT overlap removed without effective authorization change. |
| `unused_index` | 469 | 469 | No index was removed merely because it is fresh/low-traffic. |

The post-migration Advisor snapshot was observed at `2026-09-10T23:07:46.212Z`.

## PRF-A1 — Foreign-key index triage

### Selected index

`public.vendor_catalog_items(last_seen_run_id)` was the only current FK that crossed the benefit threshold.

Evidence:

- The catalog is a growing operational table (~3,000 live rows, ~16 MB at closeout).
- `last_seen_run_id` was populated for 3,002/3,002 sampled current rows, unlike the sparse actor/project FK candidates.
- Vendor sync upserts include `last_seen_run_id`; production has both broad and highly selective run IDs.
- A selective one-row run lookup changed from `Seq Scan` over 501 shared blocks to `Index Scan` over 3 shared blocks after the index.
- Same warm sample execution time changed from 1.782 ms to 1.408 ms. This is a single cached sample, so the durable evidence is the plan and buffer reduction, not a latency SLA claim.

Created:

`vendor_catalog_items_last_seen_run_id_idx on public.vendor_catalog_items(last_seen_run_id)`

### Explicit high-volume rejections

| FK | Current evidence | Decision |
| --- | --- | --- |
| `calendar_sync_audit_actor_profile_id_fkey` | ~94,964 live rows / ~36.9 MB; 0/94,961 rows had `actor_profile_id`; parent action is `ON DELETE SET NULL`. | No index. Large table alone is insufficient when the FK is currently empty and production query evidence is not actor-filtered. |
| `calendar_sync_outbox_project_id_fkey` | 3,271 rows, only 11 non-null project IDs, ~93,563 updates; observed queue queries use provider/source/status/next-attempt rather than `project_id`. | No index. Sparse FK plus high write churn makes an extra index net-negative today. |
| `calendar_events_created_by_fkey` | 3,260 rows; 1 non-null; ~91,730 updates. | No index. Sparse actor field and write amplification dominate. |
| `calendar_events_updated_by_fkey` | 3,260 rows; 2 non-null; ~91,730 updates. | No index. Same rationale. |
| `vendor_catalog_items_reviewed_by_fkey` | ~3,000 rows; 1 non-null reviewed actor at triage. | No index. Review-actor lookup benefit is not established. |

### Retained low-volume/empty FK findings

Every remaining Advisor FK was reviewed against current table cardinality, parent action and observed application/query patterns. None currently has join/filter/order/delete-update-parent evidence strong enough to justify another write-maintained index. They remain valid candidates to re-evaluate as data grows.

| Current table scale | Retained FK constraints | Rationale |
| --- | --- | --- |
| 35 rows | `vendor_catalog_checks_created_by_fkey` | Tiny table; actor filter/parent lifecycle is not a current hotspot. |
| 20 rows | `approval_requests_reviewed_by_fkey`; `vendor_catalog_category_mappings_created_by_fkey`; `vendor_catalog_category_mappings_product_type_id_fkey`; `vendor_catalog_category_mappings_uom_id_fkey`; `vendor_catalog_category_mappings_updated_by_fkey`; `private.countertop_order_item_initiations_created_by_fkey` | Parent checks are negligible at this scale; no sustained query pattern requires a covering FK index yet. |
| 16 rows | `proposal_area_types_created_by_fkey`; `proposal_area_types_updated_by_fkey` | Static/low-growth lookup data; actor indexing would add maintenance without measurable benefit. |
| 7 rows | `customer_project_proposal_revisions_accepted_by_fkey`; `..._created_by_fkey`; `..._rejected_by_fkey`; `..._sent_by_fkey`; `..._superseded_by_fkey`; `..._updated_by_fkey`; `customer_project_proposals_created_by_fkey`; `customer_project_proposals_updated_by_fkey` | Proposal lifecycle rows are tiny; primary proposal/revision access uses canonical proposal/project relationships rather than actor FKs. |
| 4 rows | `system_announcements_created_by_fkey`; `system_announcements_published_by_fkey` | Negligible relation size. |
| 1 row | `customer_project_proposal_artifacts_created_by_fkey`; `customer_project_proposal_artifacts_proposal_id_fkey`; `calendar_business_event_extensions_created_by_fkey`; `calendar_business_event_extensions_updated_by_fkey`; `customer_project_proposal_areas_area_type_id_fkey`; `..._created_by_fkey`; `..._material_product_id_fkey`; `..._pricing_group_revision_fk`; `..._updated_by_fkey`; `support_requests_completed_by_fkey`; `customer_project_proposal_acceptances_created_by_fkey` | Index cost cannot be justified at current cardinality. |
| 0 current live rows / effectively empty | `store_leads_archived_by_fkey`; `customer_project_proposal_pricing_groups_created_by_fkey`; `customer_project_proposal_pricing_groups_updated_by_fkey`; `store_chrome_items_created_by_fkey`; `store_chrome_items_updated_by_fkey`; `company_expenses_created_by_fkey`; `company_expenses_updated_by_fkey`; `store_faq_entries_created_by_fkey`; `store_faq_entries_updated_by_fkey`; `store_lead_conversions_actor_user_id_fkey`; `store_lead_form_options_updated_by_fkey`; `store_process_steps_created_by_fkey`; `store_process_steps_updated_by_fkey`; `store_testimonials_created_by_fkey`; `store_testimonials_updated_by_fkey`; `vendor_compliance_documents_created_by_fkey`; `vendor_compliance_documents_updated_by_fkey`; `vendor_compliance_documents_verified_by_fkey`; `vendor_contacts_created_by_fkey`; `vendor_contacts_updated_by_fkey`; `vendor_source_identities_created_by_fkey`; `vendor_source_identities_updated_by_fkey`; `vendors_created_by_fkey`; `vendors_updated_by_fkey` | No production data path currently benefits. Re-evaluate when cardinality/query frequency becomes material. |

`ON DELETE SET NULL`, `RESTRICT` and `NO ACTION` semantics were considered during triage. A parent-delete/update protection path alone does not justify an index on tiny or effectively empty child relations.

## PRF-A2 — RLS policy performance

### `project_participants_bounded_read`

Before, row-invariant calls used `auth.uid()` directly inside the predicate. After, the same boolean predicate and role helper remain, but all UID checks use `(select auth.uid())`, allowing PostgreSQL/Supabase to evaluate the auth value as an initPlan rather than once per row.

Authorization is unchanged:

- project customer match, or
- project creator match, or
- `super_admin` / `admin` / `project_manager`, or
- participant row creator match.

Fresh Advisor result: `auth_rls_initplan` 1 → 0.

### `store_pages`

Before:

- `store_pages_admin_all`: ALL for `super_admin` / `admin`.
- `store_pages_internal_read`: SELECT for `super_admin` / `admin` / `sales`.

That produced two permissive SELECT policies for Admin roles.

After:

- `store_pages_internal_read` remains the only authenticated SELECT policy (`super_admin`, `admin`, `sales`).
- mutations are split into `store_pages_admin_insert`, `store_pages_admin_update`, and `store_pages_admin_delete`, restricted to `super_admin` / `admin`.

Effective authorization is identical: Sales still receives read only; Admin/Super Admin retain read and mutations. Fresh Advisor result: `multiple_permissive_policies` 1 → 0.

## PRF-A3 — Admin frontend data/load audit

The seven closeout surfaces use thin route wrappers with feature components. Changes were limited to verified critical-path issues.

| Surface | Before | After / decision |
| --- | --- | --- |
| Dashboard | KPI + recent inventory reads already use `Promise.all`; dashboard loader has in-flight dedupe. | No change. Existing concurrent pattern retained. |
| Customers | Profile/types/groups/profiles batch completed, then summary RPC was awaited, then directory load could proceed. | Summary RPC joins the initial independent batch. One serial network stage removed; post-create summary refresh remains. |
| Orders | Authorization/profile resolution and order summary/directory behavior already avoid an unnecessary serialized data chain. | No change. |
| Products | Canonical list uses server-side `get_products_page_v2` pagination; legacy fallback runs only on error; thumbnail media lookup has a real dependency. | No speculative refactor. |
| Inventory | Filter options and stock page already start together via `Promise.all`. | No change. |
| Finance | Overview is delivered by one aggregated `get_finance_overview` RPC. | No change. |
| Sales & Production Report | Report data is one bounded fetch; ApexCharts already loads through `dynamic(..., { ssr: false })`. | Heavy chart library remains lazy; no bundle-wide removal. |

Shared profile lookup also improved across Admin: after session resolution, `profiles` and `user_roles` now run concurrently instead of serially.

Shared Admin route boundaries were missing. `(admin)/loading.tsx` and `(admin)/error.tsx` now provide route-level pending and retry/error handling without bypassing route/RBAC enforcement.

Large client components were inventoried. Vendor import panels are larger outliers (`SinkVendorImportsPanel` ~69 KB source, `StoneVendorImportsPanel` ~46 KB source), but they are not the primary Products list baseline and were not split opportunistically in this closeout. Large stateful Customer/Product/Order components retain server-side pagination/bounded reads rather than being rewritten solely for source size.

## PRF-A4 — Repeatable baseline

Run from the Admin package:

```bash
node scripts/prf-performance-baseline.mjs
```

The script records, for exactly these surfaces, source bytes/lines, client-component status, await sites, `Promise.all` sites, direct Supabase access sites, dynamic imports, heavy-library mentions, and loading/error-state presence:

- Dashboard
- Customers
- Orders
- Products
- Inventory
- Finance
- Sales & Production Report

It also asserts/reports shared Admin loading/error boundary presence.

This is a **repeatable static load-path baseline**, not an authenticated-browser latency benchmark. Route latency was not fabricated because this execution environment did not have an authenticated Admin browser session. Database before/after measurements above are real production `EXPLAIN (ANALYZE, BUFFERS)` samples.

### Structural before/after baseline

| Metric | Before | After |
| --- | ---: | ---: |
| Shared Admin loading boundary | absent | present |
| Shared Admin error boundary | absent | present |
| Profile independent DB-read depth after session | 2 serial reads | 1 concurrent batch |
| Customers independent startup network stages before directory | reference/profile batch + summary stage | one combined reference/profile/summary batch |
| Selected vendor run lookup plan | Seq Scan | Index Scan |
| Selected vendor run lookup shared blocks | 501 | 3 (warm sample) |
| `auth_rls_initplan` Advisor findings | 1 | 0 |
| `multiple_permissive_policies` findings | 1 | 0 |

## Regression contract

`modulex-admin/scripts/prf-performance-contract.mjs` permanently protects the closeout by requiring:

- the shared Admin loading/error boundaries,
- concurrent profile + role reads,
- Customer summary participation in the initial parallel batch,
- exactly one canonical PRF migration,
- the selected `last_seen_run_id` index,
- no speculative Calendar/sparse-actor indexes from this workstream,
- initPlan-compatible `auth.uid()` evaluation,
- and command-specific `store_pages` mutations while preserving the bounded SELECT policy.

The PRF contract is wired into the existing Admin production-surface smoke contract, so normal Admin CI also covers it. The Admin UI workflow additionally runs TypeScript typecheck, lint and production build.

## Closeout rules retained

- A fresh `unused_index` warning is not a deletion instruction; no indexes were removed based solely on Advisor usage counters.
- Future FK indexing must be driven by real cardinality, selectivity, joins/filters/order paths, parent update/delete behavior and write amplification.
- RLS performance changes must preserve the effective authorization set exactly.
- Browser latency should be added later only from repeatable authenticated production/synthetic measurements, not inferred from source structure.
