# Phase 2.1A Secondary CMS Foundation Implementation Plan

**Goal:** Add the additive Supabase schema, RLS boundaries, published-only public RPCs, and source contracts required by the approved Phase 2.1A design without changing Admin or Store rendering.

**Base:** stacked on `docs/phase-2-1-cms-design` / PR #90.

**Out of scope:** Admin UI, public About/Gallery rendering, navigation/footer CMS, production migration application.

## Task 1 — Add the contract first

Files:
- Create `modulex-store/scripts/secondary-cms-contract.mjs`
- Modify `modulex-store/package.json`

Assertions:
- migration file exists;
- three CMS tables, RLS, anon revokes, authenticated role policies, publish guards, and updated/published timestamp triggers are present;
- four public RPCs use `SECURITY DEFINER`, pinned `search_path`, fixed projections, published-only filtering, and narrow execute grants;
- project ordering and media parent-publication guard are explicit;
- no fake project/content seed is introduced.

Wire the contract into `npm run smoke` as `smoke:secondary-cms-contract`.

## Task 2 — Add the additive migration

Create `modulex-store/supabase/migrations/20260829083000_store_secondary_content_cms.sql`.

Implement:
- `store_pages`, `store_projects`, `store_project_media`;
- slug/status/content/media validation constraints;
- draft-safe project cover fields with publish-time image + alt requirements;
- deterministic indexes;
- updated-at and first-published-at triggers;
- RLS using the existing Store CMS profile/role pattern: sales may read internally, admin/super_admin may write, anon gets no direct table access;
- public published-only RPCs: `get_store_public_page`, `get_store_public_projects`, `get_store_public_project`, `get_store_public_project_media`;
- explicit function revokes/grants.

Do not seed fake projects. A minimal `about` draft may be omitted to avoid introducing content implicitly.

## Task 3 — Record roadmap state

Modify:
- `modulex-store/STORE_ROADMAP.md`
- `modulex-admin/ADMIN_ROADMAP.md`

Mark the Phase 2.1A data/RPC foundation as in progress/reviewable, while keeping Phase 2.0 as the Store primary phase until lint + full smoke evidence closes its exit gate. Do not mark downstream Admin/public UI work complete.

## Task 4 — Review the stacked diff

Compare `docs/phase-2-1-cms-design...phase-2-1/a-secondary-cms-foundation` and confirm only:
- this implementation plan;
- the secondary CMS contract + package script wiring;
- the single additive migration;
- coordinated roadmap updates.

No B/C/D files or runtime page/UI changes.

## Task 5 — Verification and PR

Available evidence in this environment:
- perform static diff/source review through GitHub;
- do not claim local lint/build/smoke execution because no working checkout is available;
- do not apply the migration to production.

Open a **Draft stacked PR** with base `docs/phase-2-1-cms-design`, document the dependency on PR #90, and list the commands still required before merge/deploy:

```bash
cd modulex-store
npm run smoke:secondary-cms-contract
npm run smoke
npm run lint
npm run build
```

After migration deployment, verify public RPCs and anonymous table denial against Supabase before marking Phase 2.1A complete.