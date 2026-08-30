# GC-8A Store Chrome & Technical SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ordinary public Store navigation/footer business links into typed, published CMS data; keep destinations code-owned and fail-closed; preserve Customer/Dealer portal chrome; and correct the Oakwell ↔ Granite & Cabinet Center technical SEO identity without interfering with the parallel Admin A1 workstream.

**Architecture:** Add a focused `store_chrome_items` domain with Admin-only mutation and a narrow published public RPC. Store resolves `destination_key` through a single code-owned mapper, supplies published/resolved items to Navbar/Footer with safe fallback, and keeps Gallery readiness and portal behavior as additional code-owned gates. SEO work stays in the Store metadata/structured-data layer and does not replace the production canonical host with mutable company data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL/RLS/RPC, GitHub Actions, ESLint, Vercel.

**Spec:** `modulex-store/docs/superpowers/specs/2026-08-30-gc8a-store-chrome-seo-design.md`

## Global Constraints

- [ ] Do not modify `modulex-admin/ADMIN_ROADMAP.md`.
- [ ] Do not modify Admin A1 customer/order/fulfillment, pricing, tax/shipping, inventory lifecycle, shipment, or status-transition files.
- [ ] Admin changes are limited to the existing Store Site Content surface and Store-specific helper/component files.
- [ ] Before implementation begins, fetch current `main`; before PR creation, fetch it again. Any parallel A1 commits are authoritative and must be preserved.
- [ ] Do not add arbitrary internal or external hrefs to the chrome CMS. Business data stores `destination_key`; code maps keys to approved public routes.
- [ ] Keep `account` as a code-owned utility action. Keep the Contact CTA code-owned in this package.
- [ ] Keep Gallery visibility additionally gated by current Gallery readiness.
- [ ] Keep the public Navbar on `/account/*` and `/dealer/*`; keep the public Footer omitted there; do not alter portal sidebar/header business behavior.
- [ ] GraniteCenterVA/WordPress remains migration/source evidence only. Runtime Granite URLs are permitted only for explicitly attributed source/provenance links such as GC-7 testimonial source links.
- [ ] GC-8B owns Lighthouse/Core Web Vitals tuning and the deeper keyboard/mobile accessibility audit. Do not expand GC-8A into that package.

---

## Task 1 — Establish RED contract and the chrome data boundary

**Files:**
- Create: `modulex-store/scripts/gc8a-store-chrome-seo-contract.mjs`
- Modify: `modulex-store/package.json`
- Create after RED is captured: `modulex-store/supabase/migrations/20260830110000_gc8a_store_chrome.sql`

- [ ] **Step 1: Write the failing GC-8A contract before implementation.**

The contract must read Store and Store-specific Admin files from the repo root and assert at minimum:

```js
const migrationPath = "modulex-store/supabase/migrations/20260830110000_gc8a_store_chrome.sql";
const destinationsPath = "modulex-store/src/lib/store/chrome/destinations.ts";
const queriesPath = "modulex-store/src/lib/store/chrome/queries.ts";
const navbarPath = "modulex-store/src/components/Navbar.tsx";
const footerPath = "modulex-store/src/components/Footer.tsx";
const chromePath = "modulex-store/src/components/StoreChrome.tsx";
const layoutPath = "modulex-store/src/app/layout.tsx";
const structuredDataPath = "modulex-store/src/lib/seo/structured-data.ts";
const metadataHelperPath = "modulex-store/src/lib/seo/metadata.ts";
const adminChromePath = "modulex-admin/src/components/store/StoreChromeSettings.tsx";
const adminChromeLibPath = "modulex-admin/src/lib/store/chrome.ts";
```

Required contract assertions:

```js
assert(exists(migrationPath), "GC-8A migration is missing");
assert(exists(destinationsPath), "Store chrome destination mapper is missing");
assert(exists(queriesPath), "Store chrome public query boundary is missing");
assert(exists(adminChromePath), "Store chrome Admin editor is missing");
```

Also assert the migration contains:
- `create table if not exists public.store_chrome_items`
- placement check for `primary_nav`, `footer_products`, `footer_company`
- status check for `draft`, `published`
- destination-key check limited to the eight approved keys
- unique `(placement, destination_key)`
- `revoke all on table public.store_chrome_items from anon`
- `get_store_public_chrome_items`
- `security definer`
- `set search_path = ''`
- public RPC selects only published rows and public fields.

Assert current hard-coded Navbar/Footer lists are gone from consumer components and that the new data props/functions are present.

- [ ] **Step 2: Register the smoke script before implementation.**

Add to `modulex-store/package.json`:

```json
"smoke:gc8a-store-chrome-seo": "node scripts/gc8a-store-chrome-seo-contract.mjs"
```

Insert it in the full `smoke` chain after `smoke:gc7-social-proof` and before the remaining Gallery/SEO/portal regressions.

- [ ] **Step 3: Run RED and record the expected failure.**

Run:

```bash
cd modulex-store
node scripts/gc8a-store-chrome-seo-contract.mjs
```

Expected result: non-zero exit, with the first missing implementation assertion such as `GC-8A migration is missing`. Do not create implementation files until this RED evidence exists.

If the working environment cannot execute the repository locally, create a branch-scoped GitHub Actions verification workflow that runs only this contract, capture the failure, then evolve that same workflow into the final GC-8A verification workflow. Do not claim RED without observed failure output.

- [ ] **Step 4: Implement the migration.**

Create `20260830110000_gc8a_store_chrome.sql` with this shape:

```sql
create table if not exists public.store_chrome_items (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('primary_nav','footer_products','footer_company')),
  destination_key text not null check (destination_key in (
    'home','about','products','showroom','cabinet_process','gallery','contact','dealer_apply'
  )),
  label text not null check (length(btrim(label)) > 0),
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (placement, destination_key)
);
```

Follow the existing Store CMS trigger/policy conventions for `updated_at` and Admin mutation. Enable RLS. Revoke direct anon access. Authenticated write policies must follow the same current Store-content role rule used by the existing Site Content CMS; do not invent a new A1 permission model.

Create a hardened public function:

```sql
create or replace function public.get_store_public_chrome_items()
returns table (
  id uuid,
  placement text,
  destination_key text,
  label text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    item.id,
    item.placement,
    item.destination_key,
    item.label,
    item.sort_order
  from public.store_chrome_items as item
  where item.status = 'published'
  order by item.placement, item.sort_order, item.label, item.id;
$$;
```

Revoke default function execution, then grant execute only to `anon` and `authenticated` as intentionally public projection access.

- [ ] **Step 5: Commit the RED test + schema boundary.**

Commit only the test/package/migration slice with a focused message such as:

```text
test(store): define GC-8A chrome data contract
```

Do not mark the contract GREEN yet; later assertions intentionally remain unsatisfied until Tasks 2–5.

---

## Task 2 — Implement destination resolution and Store public query boundary

**Files:**
- Create: `modulex-store/src/lib/store/chrome/destinations.ts`
- Create: `modulex-store/src/lib/store/chrome/queries.ts`
- Modify: `modulex-store/scripts/gc8a-store-chrome-seo-contract.mjs`

- [ ] **Step 1: Define stable Store chrome types and the code-owned route map.**

In `destinations.ts` define:

```ts
export type StoreChromePlacement =
  | "primary_nav"
  | "footer_products"
  | "footer_company";

export type StoreChromeDestinationKey =
  | "home"
  | "about"
  | "products"
  | "showroom"
  | "cabinet_process"
  | "gallery"
  | "contact"
  | "dealer_apply";

export type StoreChromeItem = {
  id: string;
  placement: StoreChromePlacement;
  destinationKey: StoreChromeDestinationKey;
  label: string;
  sortOrder: number;
};

export type ResolvedStoreChromeItem = StoreChromeItem & {
  href: string;
};
```

Use one immutable route map:

```ts
export const STORE_CHROME_DESTINATIONS: Record<StoreChromeDestinationKey, string> = {
  home: "/",
  about: "/about",
  products: "/products",
  showroom: "/showroom",
  cabinet_process: "/cabinet-process",
  gallery: "/gallery",
  contact: "/contact",
  dealer_apply: "/dealers/apply",
};
```

Implement:

```ts
export function resolveStoreChromeDestination(key: string): string | null
export function resolveStoreChromeItems(items: StoreChromeItem[]): ResolvedStoreChromeItem[]
```

`resolveStoreChromeDestination` must return `null` for any unknown key. `resolveStoreChromeItems` must trim labels, reject empty labels/unresolved keys, preserve placement/order fields, and sort deterministically by `sortOrder`, then label/id.

Define safe code-owned fallback data for exactly the current live public chrome:
- primary: Home, About, Products, Showroom, Gallery, Dealers
- footer products: Product Catalog, Product Support
- footer company: About Us, Showroom, Contact

Fallback is used only when the public RPC fails, not when a successful RPC intentionally returns an empty published set.

- [ ] **Step 2: Test real fail-closed behavior, not only source strings.**

In `gc8a-store-chrome-seo-contract.mjs`, use the installed TypeScript compiler to transpile `destinations.ts` in-memory and execute the isolated module. Verify:

```js
assert.equal(resolveStoreChromeDestination("products"), "/products");
assert.equal(resolveStoreChromeDestination("account"), null);
assert.equal(resolveStoreChromeDestination("https://example.com"), null);
assert.equal(resolveStoreChromeDestination("/dealer/orders"), null);
```

Also verify `resolveStoreChromeItems()` drops an invalid destination and a blank label.

- [ ] **Step 3: Implement the public RPC wrapper.**

In `queries.ts`, use `callPublicRpc` and map snake_case to camelCase:

```ts
export async function getStorePublicChromeItems(): Promise<StoreChromeItem[]> {
  const rows = await callPublicRpc<StoreChromeItemRpc[]>(
    "get_store_public_chrome_items",
    {},
    { revalidate: 60 },
  );

  return rows.map(mapStoreChromeItem);
}
```

Do not expose status/audit/provenance fields through this Store type.

- [ ] **Step 4: Run the focused contract.**

```bash
cd modulex-store
npm run smoke:gc8a-store-chrome-seo
```

The test may still fail on Navbar/Footer/Admin/SEO assertions, but mapper/RPC assertions must now pass. Do not weaken later assertions to force GREEN.

- [ ] **Step 5: Commit the Store chrome domain.**

```text
feat(store): add typed public chrome destination domain
```

---

## Task 3 — Make Navbar/Footer consume published chrome data without breaking portals

**Files:**
- Modify: `modulex-store/src/app/layout.tsx`
- Modify: `modulex-store/src/components/StoreChrome.tsx`
- Modify: `modulex-store/src/components/Navbar.tsx`
- Modify: `modulex-store/src/components/Footer.tsx`
- Modify: `modulex-store/scripts/gc8a-store-chrome-seo-contract.mjs`
- Existing regression: `modulex-store/scripts/portal-public-navbar-contract.mjs`

- [ ] **Step 1: Load chrome once at the root shell.**

Add `getStorePublicChromeItems()` to `RootLayout`'s `Promise.allSettled` alongside company/marketing/site/gallery.

Rules:
- fulfilled RPC, including an empty list → use the returned list as authoritative published state;
- rejected RPC → log one shell error and use `SAFE_STORE_CHROME_FALLBACK`;
- resolve items through the shared destination mapper before crossing into client components.

Pass resolved items to `StoreChrome` as `chromeItems`.

- [ ] **Step 2: Group items in `StoreChrome` without changing portal behavior.**

`StoreChromeProps` gains:

```ts
chromeItems: ResolvedStoreChromeItem[];
```

Derive:

```ts
const primaryNavigation = chromeItems.filter((item) => item.placement === "primary_nav");
const footerProducts = chromeItems.filter((item) => item.placement === "footer_products");
const footerCompany = chromeItems.filter((item) => item.placement === "footer_company");
```

Preserve the exact account/dealer route detection and shell split. Portal branches still render `Navbar` + `<main>` only.

- [ ] **Step 3: Replace the hard-coded Navbar business list.**

`Navbar` receives:

```ts
navigationItems: ResolvedStoreChromeItem[];
```

Render `.map()` entries. Apply one extra filter:

```ts
const visibleNavigationItems = navigationItems.filter(
  (item) => item.destinationKey !== "gallery" || galleryReady,
);
```

Do not move the Account icon or Contact CTA into CMS in this task. Preserve current analytics and mobile-close behavior. Preserve semantic `<ul>/<li>` structure.

- [ ] **Step 4: Replace hard-coded footer business links.**

`Footer` receives `productLinks` and `companyLinks` of `ResolvedStoreChromeItem[]`.

Create a small renderer that uses `TrackedLink` only when the resolved destination is `contact`; use `Link` for other internal destinations. Keep Contact email/phone/address and social URL logic exactly data-owned as today.

Do not convert structural headings (`Products`, `Company`, `Contact`) in GC-8A.

- [ ] **Step 5: Strengthen the contract.**

Assert:
- Navbar consumes `navigationItems` and no longer contains six hard-coded business `<li>` entries;
- Footer consumes `productLinks` / `companyLinks` instead of the previous hard-coded arrays;
- Gallery still checks `galleryReady`;
- Account and Contact CTA stay code-owned;
- `StoreChrome` still checks both `/dealer` and `/account` prefixes and omits Footer in that branch.

- [ ] **Step 6: Run Store shell regressions.**

```bash
cd modulex-store
npm run smoke:gc8a-store-chrome-seo
npm run smoke:portal-public-navbar
npm run smoke:gc7-social-proof
npm run smoke:gc6-cabinet-journey
npm run smoke:gc5-gallery-projects
npm run smoke:gc3-company-public
```

All existing regressions must pass before moving on.

- [ ] **Step 7: Commit the Store shell consumer slice.**

```text
feat(store): render CMS-managed public chrome
```

---

## Task 4 — Add Store-only Admin management inside existing Site Content

**Files:**
- Create: `modulex-admin/src/lib/store/chrome.ts`
- Create: `modulex-admin/src/components/store/StoreChromeSettings.tsx`
- Modify: `modulex-admin/src/components/store/StoreContentSettings.tsx`
- Modify: `modulex-admin/src/app/(admin)/store/content/page.tsx`
- Do **not** modify: `modulex-admin/ADMIN_ROADMAP.md`
- Do **not** modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Do **not** modify: `modulex-admin/src/lib/auth/permissions.ts`

- [ ] **Step 1: Define the Admin-side allowlist with the same keys.**

`modulex-admin/src/lib/store/chrome.ts` defines:

```ts
export const STORE_CHROME_PLACEMENTS = [
  { value: "primary_nav", label: "Primary navigation" },
  { value: "footer_products", label: "Footer — Products" },
  { value: "footer_company", label: "Footer — Company" },
] as const;

export const STORE_CHROME_DESTINATIONS = [
  { key: "home", label: "Home", href: "/" },
  { key: "about", label: "About", href: "/about" },
  { key: "products", label: "Products", href: "/products" },
  { key: "showroom", label: "Showroom", href: "/showroom" },
  { key: "cabinet_process", label: "Cabinet Planning", href: "/cabinet-process" },
  { key: "gallery", label: "Gallery", href: "/gallery" },
  { key: "contact", label: "Contact", href: "/contact" },
  { key: "dealer_apply", label: "Dealer Application", href: "/dealers/apply" },
] as const;
```

Add row types and helpers for loading/updating `store_chrome_items`. No arbitrary href parameter exists in mutation helpers.

- [ ] **Step 2: Implement `StoreChromeSettings` as a focused child editor.**

The component should:
- load all chrome rows using the authenticated Supabase client;
- group rows by placement;
- show label, destination dropdown, sort order, and status;
- allow editing label, destination from the allowlist only, and sort order;
- allow explicit Draft / Publish / Unpublish actions;
- update `updated_by` from the current authenticated profile/session using the same pattern as existing Store content settings;
- set/clear `published_at` consistently on publish/unpublish;
- display mutation errors instead of optimistic silent failure.

Creation/deletion is not required in GC-8A. The initial managed row set is seeded by the migration rollout, and the approved design only requires editing destination/label/order and draft/publish lifecycle. Do not expand the UI into arbitrary menu construction.

- [ ] **Step 3: Mount the child editor in the existing Store Site Content page.**

Import and render `<StoreChromeSettings />` from `StoreContentSettings.tsx` after the existing homepage/footer settings blocks, keeping the current `canEdit` / Store CMS authorization pattern.

Update `/store/content/page.tsx` metadata description so it mentions navigation/footer configuration, but keep the same route.

No new sidebar item or new permission matcher is needed because `/store/content` already requires `store.manage`.

- [ ] **Step 4: Make the GC-8A contract compare Store/Admin destination-key sets.**

The contract must ensure both code-owned allowlists contain the same eight destination keys and must fail if Admin contains `account`, `/dealer/*`, arbitrary URL inputs, or a free-text href field.

- [ ] **Step 5: Run Admin Store-only verification.**

```bash
cd modulex-admin
npm run smoke:rbac
npx eslint \
  src/components/store/StoreChromeSettings.tsx \
  src/components/store/StoreContentSettings.tsx \
  src/lib/store/chrome.ts \
  "src/app/(admin)/store/content/page.tsx"
npm run build
```

Do not run or edit A1 business contracts unless a global workflow runs them automatically. If a global workflow reports an A1 failure unrelated to changed files, investigate but do not rewrite A1 behavior to silence it.

- [ ] **Step 6: Commit the Store-only Admin slice.**

```text
feat(admin): manage Store navigation and footer content
```

---

## Task 5 — Correct technical SEO identity and remove duplicate branded titles

**Files:**
- Create: `modulex-store/src/lib/seo/metadata.ts`
- Modify: `modulex-store/src/lib/seo/structured-data.ts`
- Modify: `modulex-store/src/app/about/page.tsx`
- Modify: `modulex-store/src/app/gallery/page.tsx`
- Modify: `modulex-store/src/app/showroom/page.tsx`
- Modify: `modulex-store/src/app/cabinet-process/page.tsx`
- Modify: `modulex-store/src/app/products/[slug]/page.tsx`
- Modify: `modulex-store/scripts/seo-showroom-cms-contract.mjs`
- Modify: `modulex-store/scripts/gc8a-store-chrome-seo-contract.mjs`
- Review only unless a defect is found: `modulex-store/src/app/sitemap.ts`
- Review only unless a defect is found: `modulex-store/src/app/robots.ts`
- Review only unless a defect is found: `modulex-store/src/config/site.ts`

- [ ] **Step 1: Add one CMS/product SEO-title helper.**

Create:

```ts
import type { Metadata } from "next";

export function resolveManagedSeoTitle(
  seoTitle: string | null | undefined,
  fallbackTitle: string,
): Metadata["title"] {
  const managed = seoTitle?.trim();
  return managed ? { absolute: managed } : fallbackTitle;
}
```

Rationale: a managed SEO title is already the full title operators expect Google to see. It must bypass the root `%s | Oakwell Cabinetry` template. A plain fallback title continues to use the root template.

- [ ] **Step 2: Apply the helper to all indexable managed-title surfaces discovered in the audit.**

Use `resolveManagedSeoTitle(page.seoTitle, page.title)` in:
- About
- Gallery
- Showroom
- Cabinet Process

Use `resolveManagedSeoTitle(product.seoTitle, product.displayName)` on product detail pages.

Keep Home's existing `title: { absolute: title }` because homepage settings already produce a complete managed title.

OpenGraph titles remain explicit strings and do not use Next title templates.

- [ ] **Step 3: Re-model Organization JSON-LD as Oakwell-facing with parent identity.**

`createOrganizationJsonLd(company)` must derive:

```ts
const brandName = company?.companyName?.trim() || siteConfig.name;
const parentName = company?.legalName?.trim();
const hasDistinctParent = Boolean(
  parentName && parentName.localeCompare(brandName, undefined, { sensitivity: "accent" }) !== 0,
);
```

Return the public site Organization with:

```ts
{
  "@type": "Organization",
  "@id": new URL("#organization", siteConfig.url).toString(),
  name: brandName,
  url: siteConfig.url,
  logo,
  email: verifiedCompanyEmail,
  telephone: verifiedCompanyPhone,
  address: verifiedCompanyAddress,
  brand: {
    "@type": "Brand",
    name: brandName,
    url: siteConfig.url,
    logo,
  },
  parentOrganization: hasDistinctParent
    ? {
        "@type": "Organization",
        name: parentName,
      }
    : undefined,
}
```

Do not set `legalName: brandName`; Oakwell is not being asserted as a separate legal entity. Do not make the parent the public Organization `name`.

Keep `createLocalBusinessJsonLd()` working and parented to the Oakwell public organization `@id`.

- [ ] **Step 4: Update stale Showroom SEO regression expectations.**

Replace the current assertion that merely searches for `legalName` with assertions that require:
- Store Organization name derives from `companyName` / brandName;
- `parentOrganization` exists when `legalName` differs;
- `Brand` remains Oakwell-facing;
- LocalBusiness helper remains intact.

- [ ] **Step 5: Audit canonical/robots/sitemap rules without changing correct behavior.**

GC-8A contract must assert:
- `siteConfig.url` is still derived from `NEXT_PUBLIC_SITE_URL` or `VERCEL_PROJECT_PRODUCTION_URL`, not `company.website`;
- public managed pages specify exactly one `alternates.canonical` for their own route;
- showroom noindex remains conditional on published showroom readiness;
- Gallery/Cabinet Process noindex/notFound readiness remains fail-closed;
- `/api/`, `/account/`, `/dealer/` remain disallowed in robots;
- Gallery/Showroom/Cabinet Process remain conditionally included in sitemap based on published readiness;
- product detail canonical remains `/products/${product.slug}`.

Only modify `sitemap.ts`, `robots.ts`, or `site.ts` if one of these assertions exposes an actual defect.

- [ ] **Step 6: Add the Granite runtime dependency audit.**

The contract should scan runtime Store source roots (for example `src/app`, `src/components`, `src/lib`, `src/config`) and reject `granitecenterva.com` when it is used as a media URL, image source, fetch endpoint, API endpoint, background URL, or hard-coded content backend.

Allow clearly attributed GC-7 source-link behavior where `testimonial.sourcePageUrl` arrives from the published RPC and is rendered as a source citation. Do not reject docs/migrations/provenance simply because they record the source URL.

- [ ] **Step 7: Run SEO + existing regressions.**

```bash
cd modulex-store
npm run smoke:gc8a-store-chrome-seo
npm run smoke:seo-showroom
npm run smoke:public-production
npm run smoke:portal-public-navbar
npm run smoke:gc7-social-proof
npm run smoke:gc6-cabinet-journey
npm run smoke:gc5-gallery-projects
npm run smoke:gc3-company-public
```

- [ ] **Step 8: Commit the SEO slice.**

```text
fix(store): align Oakwell parent identity and managed SEO titles
```

---

## Task 6 — Apply production schema/data through a draft-first gate

**Production system:** Supabase project `bzjoeernnmvuhzyvbowc`

- [ ] **Step 1: Apply the GC-8A migration through `Supabase.apply_migration`.**

Use migration name `gc8a_store_chrome` and the exact SQL committed in `20260830110000_gc8a_store_chrome.sql`.

Do not use DDL through ad-hoc `execute_sql` when `apply_migration` is available.

- [ ] **Step 2: Insert exactly the current live 11 chrome rows as `draft`.**

Primary navigation:

| placement | destination_key | label | sort_order |
|---|---|---|---:|
| primary_nav | home | Home | 10 |
| primary_nav | about | About | 20 |
| primary_nav | products | Products | 30 |
| primary_nav | showroom | Showroom | 40 |
| primary_nav | gallery | Gallery | 50 |
| primary_nav | dealer_apply | Dealers | 60 |

Footer Products:

| placement | destination_key | label | sort_order |
|---|---|---|---:|
| footer_products | products | Product Catalog | 10 |
| footer_products | contact | Product Support | 20 |

Footer Company:

| placement | destination_key | label | sort_order |
|---|---|---|---:|
| footer_company | about | About Us | 10 |
| footer_company | showroom | Showroom | 20 |
| footer_company | contact | Contact | 30 |

Do not publish `cabinet_process` merely because it is allowlisted. The approved initial live navigation remains unchanged.

- [ ] **Step 3: Verify the draft gate before publication.**

Use SQL/read checks to prove:
- table row count = 11;
- all 11 rows are `draft`;
- `get_store_public_chrome_items()` returns 0 rows;
- anon direct `select` on `store_chrome_items` is denied;
- anon can execute the intentionally narrow public RPC.

Do not proceed if draft rows leak through the public projection.

- [ ] **Step 4: Publish only the approved 11 rows.**

Use a controlled DML update setting `status = 'published'` and `published_at = now()` for those seeded rows.

- [ ] **Step 5: Verify the published projection exactly.**

Prove:
- RPC returns exactly 11 rows;
- counts are 6 primary + 2 footer products + 3 footer company;
- each placement is in expected sort order;
- no `/account`, `/dealer/*`, external URL, or unknown destination is representable in the projection;
- anon direct table read remains denied.

Record these counts in the PR body/roadmap status, not as runtime constants in Store code beyond the safe fallback.

---

## Task 7 — Close GC-7 roadmap state, run full verification, and prepare a conflict-safe PR

**Files:**
- Modify: `modulex-store/STORE_ROADMAP.md`
- Modify: `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`
- Create: `.github/workflows/gc8a-store-chrome-seo.yml` if a durable package CI workflow does not already exist
- Explicitly do **not** modify: `modulex-admin/ADMIN_ROADMAP.md`

- [ ] **Step 1: Update only Store/migration roadmap state.**

Record:
- GC-7 = production-accepted after PR #167 / commit `74013f90561e023b0453aea57cd010456de2c597` and live homepage verification;
- GC-8A = `[~]` while PR/live acceptance remains pending;
- typed nav/footer CMS, parent-identity SEO correction, and CI/data gate evidence;
- GC-8B remains next for accessibility/mobile/Lighthouse/CWV.

Do not edit Admin roadmap in this workstream.

- [ ] **Step 2: Add/run durable GC-8A CI.**

Store job:

```bash
cd modulex-store
npm ci
npm run smoke:gc8a-store-chrome-seo
npm run smoke:seo-showroom
npm run smoke:public-production
npm run smoke:portal-public-navbar
npm run smoke:gc7-social-proof
npm run smoke:gc6-cabinet-journey
npm run smoke:gc5-gallery-projects
npm run smoke:gc3-company-public
npx eslint \
  src/lib/store/chrome/destinations.ts \
  src/lib/store/chrome/queries.ts \
  src/components/Navbar.tsx \
  src/components/Footer.tsx \
  src/components/StoreChrome.tsx \
  src/app/layout.tsx \
  src/lib/seo/metadata.ts \
  src/lib/seo/structured-data.ts \
  src/app/about/page.tsx \
  src/app/gallery/page.tsx \
  src/app/showroom/page.tsx \
  src/app/cabinet-process/page.tsx \
  "src/app/products/[slug]/page.tsx"
npm run build
```

Admin Store-only job:

```bash
cd modulex-admin
npm ci
npm run smoke:rbac
npx eslint \
  src/components/store/StoreChromeSettings.tsx \
  src/components/store/StoreContentSettings.tsx \
  src/lib/store/chrome.ts \
  "src/app/(admin)/store/content/page.tsx"
npm run build
```

The workflow must not add writes to production. Production migration/data rollout stays an explicit connector operation, not CI side effect.

- [ ] **Step 3: Re-read `main` immediately before PR creation.**

Compare:

```text
main...feat/gc8a-store-chrome-seo
```

If the branch is behind because the A1 conversation merged work:
1. inspect changed filenames from the new `main` commits;
2. treat A1 files and `modulex-admin/ADMIN_ROADMAP.md` on `main` as authoritative;
3. if there is no file overlap, recreate/rebase the GC-8A changes on a clean branch based on latest `main` rather than merging stale Admin content;
4. if a Store-specific file overlaps, resolve only that Store-specific file and preserve unrelated A1 changes verbatim.

Required pre-PR state:
- `behind_by = 0`;
- diff contains no `modulex-admin/ADMIN_ROADMAP.md`;
- diff contains no customer/order/fulfillment/pricing/tax-shipping/A1 domain file;
- GC-8A CI green on the final head SHA.

- [ ] **Step 4: Inspect the final diff for scope and placeholders.**

Fail the package if diff includes:
- A1 business files;
- arbitrary free-text href support;
- hard-coded Granite runtime media/backend URLs;
- unsupported `legalName` claim for Oakwell;
- `TODO`, `FIXME`, `PLACEHOLDER`, temporary workflow helpers, debug prints, or dead test scaffolding.

- [ ] **Step 5: Open the GC-8A PR only after final-head verification.**

Suggested title:

```text
feat(store): deliver GC-8A managed chrome and technical SEO
```

PR body must include:
- design + implementation-plan paths;
- 11-row draft/public gate evidence;
- anon direct table denial;
- route allowlist behavior;
- portal regression result;
- Oakwell → parent Granite structured-data behavior;
- title-duplication fix coverage;
- Store/Admin build status;
- explicit statement that `ADMIN_ROADMAP.md` and Admin A1 business files were not changed.

---

## Task 8 — Post-merge/deploy production acceptance

This task occurs only after the user merges/deploys the PR.

- [ ] **Step 1: Verify GitHub merge and Vercel production commit match.**

Require latest Store production deployment to be `READY` and its `githubCommitSha` to equal the GC-8A merge commit (or a later main commit that includes it).

- [ ] **Step 2: Fetch live public surfaces.**

Verify homepage HTML contains the approved six nav links in order and the 2+3 footer business links in order, with no broken/unknown destinations.

Verify Gallery remains absent from nav if readiness ever becomes false.

- [ ] **Step 3: Verify portal coexistence live.**

Check accessible HTML/routes for `/account/*` and `/dealer/*`:
- public Navbar path back to `/` remains available;
- public Footer is not duplicated inside portal shell;
- no portal sidebar/header regression is introduced.

- [ ] **Step 4: Verify technical SEO live.**

Homepage JSON-LD must show:
- Organization `name` = Oakwell public brand;
- Brand = Oakwell;
- `parentOrganization.name` = Granite & Cabinet Center when current canonical profile still has that distinct `legal_name`;
- verified contact/address only.

Verify representative managed pages have one canonical and no duplicated `| Oakwell Cabinetry | Oakwell Cabinetry` title. Verify robots and sitemap readiness behavior remain correct.

- [ ] **Step 5: Close GC-8A only after live acceptance.**

Update Store/migration roadmap in a small closeout PR if necessary:
- GC-8A → `[x]`;
- record production deployment/commit and live checks;
- advance migration next action to GC-8B accessibility/mobile/keyboard + Lighthouse/Core Web Vitals baseline/tuning.

---

## Plan Self-Review Checklist

- [ ] Every approved design section maps to at least one task above: typed CMS, allowlist, Store runtime, Admin Site Content management, portal coexistence, Organization parent identity, canonical/title/robots/sitemap audit, Granite runtime dependency audit, rollout, and parallel-A1 protection.
- [ ] No task lists `modulex-admin/ADMIN_ROADMAP.md` as a file to modify.
- [ ] No task lists Admin customer/order/fulfillment/pricing/inventory lifecycle files.
- [ ] Store and Admin destination keys are exactly the same eight keys.
- [ ] Initial public seed remains exactly 11 current live rows; `cabinet_process` is allowlisted but not automatically published.
- [ ] Managed SEO titles use Next `absolute` titles; fallback titles continue through the root title template.
- [ ] Oakwell is not asserted as a separate legal entity; Granite & Cabinet Center is modeled as parent when `legal_name` differs.
- [ ] No placeholders/TODO/FIXME text is required in implementation.
- [ ] Production migration uses `apply_migration`; DML uses controlled SQL; CI performs no production writes.
- [ ] Final PR cannot be created while behind `main` or while A1 files are present in diff.
