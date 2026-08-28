# Phase 2.1D — Shared Store Chrome Design

## Context

The existing public Navbar and Footer contain a small code-owned set of production-safe links plus company/contact/social content from existing Store settings and company profile data. Phase 2.1D makes ordinary primary-navigation and footer-link changes Admin-manageable while keeping security-critical and conversion-critical entry points code-owned.

## Goals

1. Make ordinary primary navigation links configurable without deployment.
2. Make grouped footer links configurable without deployment.
3. Preserve current company/contact/social data ownership.
4. Preserve Account access, Contact CTA, and portal-to-public-site escape paths even when CMS link data is empty or misconfigured.
5. Expose only active, ordered link projections through narrow public RPCs.
6. Add Admin management using the existing Store CMS permission model.

## Explicit Non-Goals

- Account/dealer authentication routes are not configurable CMS destinations.
- The Navbar Account icon is not removable from CMS.
- The Navbar Contact CTA is not made CMS-removable in this phase; its route remains `/contact`.
- Company logo/name/contact/social settings are not moved out of their existing sources.
- No mega-menu, nested navigation tree, localization, audience targeting, or arbitrary HTML footer builder.

## Data Model

### `store_navigation_items`

Columns:

- `id uuid primary key default gen_random_uuid()`
- `label text not null`
- `href text not null`
- `sort_order integer not null default 0`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `updated_by uuid null references auth.users(id) on delete set null`

Public order: `sort_order asc, id asc`.

### `store_footer_links`

Columns:

- `id uuid primary key default gen_random_uuid()`
- `section_key text not null`
- `section_label text not null`
- `section_sort_order integer not null default 0`
- `label text not null`
- `href text not null`
- `sort_order integer not null default 0`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `updated_by uuid null references auth.users(id) on delete set null`

A separate footer-section table is intentionally avoided in Phase 2.1. The shared `section_key`/`section_label` fields provide enough structure for the current footer while keeping the model simple.

Public order: `section_sort_order asc, section_key asc, sort_order asc, id asc`.

## URL Validation

Both tables accept only:

- internal paths beginning with `/`; or
- `http:` / `https:` URLs.

Reject empty labels, empty hrefs, `javascript:` URLs, hash-only placeholders, and legacy `.html` destinations.

Admin validation provides immediate feedback; database constraints/helpers should enforce the essential invariant so malformed data is not publishable merely by bypassing the UI.

## Authorization and Public RPCs

RLS/grants follow the same Store CMS boundary as Package A:

- `admin` / `super_admin`: authenticated management via `store.manage` and matching RLS;
- anonymous users: no direct table CRUD/select.

Public RPCs:

### `get_store_public_navigation()`

Returns active items only:

- `label`
- `href`
- `sort_order`

### `get_store_public_footer_links()`

Returns active items only:

- `section_key`
- `section_label`
- `section_sort_order`
- `label`
- `href`
- `sort_order`

Functions use fixed projections, safe pinned search paths, and the same narrow execute grants as other Store public RPCs.

## Initial Data and Rollout Safety

The migration may seed only the **current already-production-approved** navigation/footer destinations copied from the main branch at implementation time. It must not resurrect Services, Blog, legacy Gallery templates, or other disabled routes.

If seed data is used, the implementation PR must enumerate the exact destinations in its description so reviewers can verify each one against current production behavior.

The public UI also keeps a safe code fallback for an unavailable/empty RPC result. The fallback is the current production-safe link set, not template links. This prevents a transient CMS/RPC problem from creating an empty navigation or removing the user's path back to the public site.

## Admin Management Surface

Add one route:

- `/store/navigation`

Add under the Store group in `modulex-admin/src/layout/AppSidebar.tsx`:

- `Navigation & Footer` → `/store/navigation` → `store.manage`

Logical component:

- `StoreNavigationManager`

The screen has two sections:

1. Primary Navigation
2. Footer Links

Supported actions:

- add item;
- edit label/href;
- set sort order;
- activate/deactivate;
- delete with confirmation.

Footer items additionally edit `section_key`, `section_label`, and `section_sort_order`.

No drag-and-drop dependency is introduced; numeric sort order is sufficient for the first iteration.

## Navbar Rendering

`Navbar.tsx` receives/loads approved public navigation items using the existing root layout/query architecture rather than adding ad-hoc browser-side Supabase calls.

Configurable items fill the ordinary primary navigation region.

Always code-owned:

- logo/home link;
- Account icon/link;
- Contact CTA;
- mobile-menu controls.

This prevents a CMS editing mistake from removing account access or the principal public contact path.

If navigation RPC data is empty/unavailable, render the safe current fallback links.

## Footer Rendering

CMS controls only the ordinary footer link groups.

Existing sources remain authoritative for:

- company name/logo/contact/profile data;
- footer description from current Store site settings;
- social links from current Store site settings.

Footer link records are grouped by `section_key` and ordered by `section_sort_order` + item `sort_order`.

If footer-link RPC data is empty/unavailable, use the current safe footer-link fallback rather than rendering template/demo content.

## Portal Coexistence

Customer and Dealer account/portal pages must continue to expose an intentional route back to the public site.

Regression requirements:

- public Navbar remains available where the current architecture intentionally renders it;
- portal/auth branded home links continue to target `/`;
- Navbar Account icon remains available on public pages;
- configurable links never replace portal authorization/navigation logic inside `PortalShell`;
- CMS cannot point security-critical controls to arbitrary destinations.

## Testing

Database/contract tests prove:

1. anon direct reads/writes are denied;
2. public RPCs return active items only;
3. output order is deterministic;
4. invalid/placeholder hrefs are rejected by the essential validation boundary.

Admin tests/contracts prove:

5. route/nav entry uses `store.manage`;
6. CRUD does not require service-role credentials;
7. inactive items remain editable but are absent publicly.

Store tests/contracts prove:

8. Navbar uses public CMS projection with safe fallback;
9. Account and Contact controls remain code-owned;
10. Footer keeps company/contact/social ownership unchanged;
11. public-navbar/portal regression coverage continues to pass;
12. no disabled/demo route is reintroduced through initial CMS data.

## Phase 2.1 Closeout

Package D is the final Phase 2.1 package. After A → B → C → D are merged/deployed and production-verified:

- update `STORE_ROADMAP.md` Phase 2.1 tasks and exit gate based on actual evidence;
- update `ADMIN_ROADMAP.md` A4.1 based on actual Admin management verification;
- do not mark any exit criterion complete solely because code was merged;
- record the next Store action as Phase 2.2 only when Phase 2.1 exit criteria are all verified.

## Acceptance Criteria

Package D is complete when:

- ordinary primary navigation and footer links can be managed by authorized Admin users without deployment;
- active-only public projections are enforced;
- Account/Contact/public-return paths cannot disappear through CMS configuration;
- Navbar and Footer have safe production fallbacks;
- relevant Admin/Store lint, build, smoke, and live verification pass;
- both roadmaps reflect verified Phase 2.1 status.