# GC-8A — Store Chrome & Technical SEO Design

Date: 2026-08-30
Branch: `feat/gc8a-store-chrome-seo`
Base: `74013f90561e023b0453aea57cd010456de2c597`

## Goal

Complete the first bounded delivery slice of GC-8 without interfering with the parallel Admin A1 workstream. This package makes ordinary public Store navigation/footer link content data-owned, audits the current technical SEO identity/canonical layer, and preserves the existing portal chrome behavior.

## Hard scope boundary

This workstream must not overwrite or modify Admin A1 customer/order/fulfillment work.

Explicitly out of scope for this package:
- `modulex-admin/ADMIN_ROADMAP.md`
- Admin A1 customer/order/fulfillment domain files
- order, shipment, inventory lifecycle, customer, pricing, tax/shipping/status-transition behavior
- portal order/shipment business behavior
- Lighthouse/CWV optimization work beyond detecting regressions
- Blog/editorial CMS
- arbitrary external navigation destinations

Admin changes, if required, are restricted to existing Store CMS/site-content surfaces and their Store-specific data modules. Before PR creation the branch must be compared with the latest `main`; any parallel A1 changes are treated as authoritative and retained.

## Current state

Public navigation links are embedded in `Navbar.tsx` and the two ordinary footer link groups are embedded in `Footer.tsx`. Company identity/contact and social URLs are already data-owned. `StoreChrome.tsx` deliberately renders the public navbar on Customer/Dealer portal routes while omitting the normal public footer there.

The root layout already publishes Organization + WebSite JSON-LD. Current live structured data represents the parent legal entity as the primary Organization name and Oakwell as alternate/brand. The desired public identity is clearer when Oakwell remains the site-facing organization/brand and Granite & Cabinet Center is explicitly represented as the parent organization.

## Options considered

### Option A — Put navigation/footer arrays into `store_site_settings` JSON

Pros: fewer tables and fewer queries.

Cons: weak typing, harder row-level review/order operations, awkward Admin editing, and inconsistent with the existing typed CMS direction.

Decision: reject.

### Option B — Store arbitrary `label + href` rows

Pros: flexible and simple UI.

Cons: allows business data to point public navigation at unsupported or accidentally sensitive routes unless every consumer duplicates URL validation.

Decision: reject.

### Option C — Typed chrome items with code-owned destinations

Store mutable label/order/visibility/publication state in data, but store a `destination_key` instead of arbitrary internal URLs. Store/Admin code maps the key to a fixed allowlist of public destinations.

Pros: business-editable content without deploys, fail-closed destinations, no portal/auth route leakage, easy ordering, and consistent with the project's dynamic-content rule.

Decision: use this approach.

## Data model

Add `public.store_chrome_items` with:
- `id uuid`
- `placement text` — `primary_nav`, `footer_products`, or `footer_company`
- `destination_key text`
- `label text`
- `sort_order integer`
- `status text` — draft/published
- audit timestamps/user ids consistent with existing Store CMS tables

Constraints:
- unique `(placement, destination_key)`
- non-empty label
- direct anon table grants revoked
- authenticated Store managers keep controlled CRUD through existing Admin authorization patterns

The database does not accept arbitrary public hrefs. A narrow published-only RPC returns placement/key/label/order only. Runtime href resolution remains code-owned.

Initial destination keys map to the existing approved public surfaces only:
- `home` → `/`
- `about` → `/about`
- `products` → `/products`
- `showroom` → `/showroom`
- `cabinet_process` → `/cabinet-process`
- `gallery` → `/gallery`
- `contact` → `/contact`
- `dealer_apply` → `/dealers/apply`

`account` remains a code-owned utility action/icon and is not converted into a business navigation item in this package.

## Initial production seed

Seed the current live labels/order as draft first, verify public RPC returns zero, then publish the approved set.

Primary nav:
1. Home
2. About
3. Products
4. Showroom
5. Gallery
6. Dealers

Footer Products:
1. Product Catalog
2. Product Support

Footer Company:
1. About Us
2. Showroom
3. Contact

`cabinet_process` is supported by the allowlist but does not have to be added to the initial live nav merely because the route exists. Navigation remains intentionally curated.

## Store runtime

Create one shared destination-key mapper used by Navbar/Footer consumers.

`RootLayout` loads published chrome items alongside existing company/site settings. `StoreChrome` receives the grouped chrome configuration.

Navbar behavior:
- render only published `primary_nav` rows whose destination keys resolve
- retain current `galleryReady` fail-closed behavior for Gallery even if a published Gallery nav item exists
- retain mobile menu, analytics, account icon, contact CTA, and theme behavior
- if the RPC fails, use a minimal safe code-owned fallback rather than expose an empty/broken shell

Footer behavior:
- render `footer_products` and `footer_company` rows from published data
- keep email/phone/address from canonical company profile
- keep social destinations from existing site settings
- keep structural headings (`Products`, `Company`, `Contact`) code-owned in this first iteration; business link labels/order/visibility are data-owned
- fall back safely if chrome data is unavailable

## Admin Store CMS management

Use the existing Store Site Content/settings surface rather than adding an A1 route.

Admin capabilities for Store chrome items:
- view placement, label, destination, status and sort order
- edit label and order
- select destination only from the code-owned allowlist
- draft/publish/unpublish
- no arbitrary URL input for internal chrome links

Any Admin files touched must be Store-specific only. No A1 roadmap or A1 domain file changes are allowed in this package.

## Portal coexistence

Preserve current behavior:
- Customer/Dealer portal routes keep the public Navbar so users retain a route back to the public site
- public Footer remains omitted inside portal routes
- portal sidebar/header behavior is unchanged
- Account icon remains visible in the public Navbar

Regression tests must explicitly cover `/account/*` and `/dealer/*` shell behavior.

## Technical SEO identity audit

### Organization JSON-LD

Adjust identity modeling so the public site entity is Oakwell-facing:
- primary Organization `name`: Oakwell Cabinetry / canonical `company_name`
- `brand`: Oakwell Cabinetry
- if `legal_name` differs from the public brand and represents the parent company, emit it through `parentOrganization` rather than replacing the public Organization name
- do not claim a separate Oakwell legal entity if none exists
- retain only verified contact/address fields from canonical company data

Expected relationship:
`Oakwell Cabinetry` → parent organization → `Granite & Cabinet Center`.

### Canonical/base URL

Keep canonical generation code-owned through the configured production site URL. Do not silently replace canonical base with `company.website` unless that domain is explicitly confirmed as the deployed canonical production host.

Audit all indexable Store pages for:
- one canonical
- unique/non-duplicated title handling
- robots status consistent with readiness
- OG title/description/image where data exists
- sitemap inclusion only for production-ready routes

### Granite runtime dependency audit

Fail the contract if Granite Center URLs appear as runtime media/content dependencies. Source URLs remain allowed only in clearly attributed provenance/social-proof source links where the public source identity is intentional.

## Testing / acceptance

TDD starts with a GC-8A contract that must fail on the current hard-coded Navbar/Footer implementation.

Required automated checks:
- schema/public RPC contract
- anon direct-table denial
- destination-key allowlist mapping
- invalid/unresolved destination fails closed
- Navbar uses published chrome data
- Gallery nav remains readiness-gated
- Footer uses published chrome data while company contact remains canonical
- portal chrome regression for Customer/Dealer routes
- Organization JSON-LD parent relationship contract
- canonical/sitemap/robots regression
- Granite runtime hotlink/business-literal audit
- existing GC-7, GC-6, Gallery, Showroom SEO and company-public regressions
- Store lint + production build
- Store-specific Admin scoped lint/build/RBAC only if Store CMS UI files are changed

Production rollout:
1. apply schema
2. insert current chrome items as draft
3. prove public RPC = 0 and anon direct table read denied
4. publish approved rows
5. prove RPC contains exactly approved rows/order
6. merge/deploy
7. live-check desktop/mobile-compatible HTML output, portal shell, canonical/JSON-LD and nav/footer links

## Roadmap handling during parallel A1 work

This branch updates only Store/migration roadmap material needed for GC-7 closeout and GC-8A status. It does not edit `modulex-admin/ADMIN_ROADMAP.md` while the parallel A1 conversation owns that file.

Before PR creation:
- re-read latest `main`
- compare branch with `main`
- if A1 has merged, preserve all A1 commits and resolve only Store-specific conflicts
- never replace a newer Admin roadmap with this branch's older copy

## Done criteria

GC-8A is complete when:
- GC-7 is recorded as production-accepted
- ordinary primary-nav and footer business links are published Store CMS data
- arbitrary internal hrefs cannot be introduced through CMS
- Navbar/Footer consume the narrow published projection with safe fallback
- portal chrome remains intact
- Oakwell/Granite parent identity is correctly expressed in structured data
- canonical/sitemap/robots and Granite runtime-dependency audits pass
- production Store renders the approved chrome correctly
- no parallel Admin A1 work was overwritten

GC-8 accessibility/mobile keyboard audit and Lighthouse/Core Web Vitals measurement/tuning remain a separate GC-8B acceptance package.