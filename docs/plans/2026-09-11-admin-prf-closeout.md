# Admin PRF Closeout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close PRF-A1 through PRF-A4 with evidence-driven Supabase indexes/RLS fixes, bounded Admin load-path optimizations, repeatable baselines, and one regression-backed pull request.

**Architecture:** Keep authorization semantics and public contracts unchanged. Use production statistics and fresh Supabase Advisor findings to choose only high-value FK indexes, rewrite RLS expressions only for initPlan reuse, split overlapping `store_pages` command policies without changing effective access, and remove only verified serial frontend reads. Preserve existing server-side pagination and lazy chart loading.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Next.js 16, React 19, TypeScript, Node contract tests, GitHub Actions.

---

### Task 1: Establish RED performance contracts

**Files:**
- Modify: `modulex-admin/scripts/admin-production-surface-contract.mjs`

1. Require the Admin route group to expose shared `loading.tsx` and `error.tsx` boundaries.
2. Require profile and role reads to be issued together after session resolution.
3. Require Customers initial reference-data and summary reads to share one parallel batch.
4. Require exactly one canonical PRF migration with the evidence-approved FK index and RLS policy rewrites.
5. Let the existing Admin UI workflow demonstrate RED before the implementation files exist.

### Task 2: Apply production database performance closeout

**Files:**
- Create: `modulex-store/supabase/migrations/<production-version>_prf_admin_supabase_performance_closeout.sql`

1. Add the covering FK index for `vendor_catalog_items.last_seen_run_id` only. Production triage rejected `calendar_sync_audit.actor_profile_id` (0/94,961 non-null), `calendar_sync_outbox.project_id` (11/3,271 non-null plus heavy update churn), sparse Calendar actor FKs, and the remaining tiny/empty FK candidates because current read/parent-lifecycle benefit did not exceed write/storage cost.
2. Rewrite `project_participants_bounded_read` to cache row-invariant `auth.uid()` calls via `(select auth.uid())` without changing the predicate.
3. Replace `store_pages_admin_all` with INSERT/UPDATE/DELETE-only Admin policies and retain `store_pages_internal_read` as the only authenticated SELECT policy.
4. Apply through Supabase migration tooling, then mirror the exact generated migration version and SQL into the repository.
5. Verify indexes and effective policy definitions directly in production.

### Task 3: Remove verified Admin serial reads

**Files:**
- Modify: `modulex-admin/src/lib/supabase/profile.ts`
- Modify: `modulex-admin/src/components/customers/CustomersTable.tsx`

1. Fetch the current profile and role rows concurrently after the user session is known.
2. Include the Customer dashboard summary RPC in the existing initial `Promise.all` batch instead of awaiting it afterward.
3. Preserve the existing summary refresh after Customer creation.

### Task 4: Add route-level failure/loading boundaries

**Files:**
- Create: `modulex-admin/src/app/(admin)/loading.tsx`
- Create: `modulex-admin/src/app/(admin)/error.tsx`

1. Add a consistent Admin route loading state.
2. Add a client error boundary with a retry action and no authorization bypass.

### Task 5: Record repeatable baselines and triage evidence

**Files:**
- Create: `modulex-admin/scripts/prf-performance-baseline.mjs`
- Create: `modulex-admin/docs/PRF_PERFORMANCE_CLOSEOUT.md`

1. Provide a repeatable static load-path baseline for Dashboard, Customers, Orders, Products, Inventory, Finance, and Sales & Production Report.
2. Record the execution-time production workload baseline, selected/rejected FK rationale, RLS before/after shape, and frontend audit findings.
3. Explicitly distinguish structural/read-path measurements from authenticated browser latency; do not fabricate route timings.

### Task 6: Verify and close roadmap

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

1. Run the PRF contract through the existing production-surface smoke path.
2. Require GitHub Actions to run typecheck, lint, and production build.
3. Re-run fresh Supabase Performance Advisor and record before/after warning counts.
4. Mark PRF-A1 through PRF-A4 complete only after fresh database and CI verification.
5. Leave one PR from `perf/prf-admin-supabase-closeout` into `main`.