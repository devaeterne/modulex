# Modulex Store Roadmap

Last reviewed: 2026-08-29
Main baseline: `41aa1f0b1c27460e5ef298242162518c2bf93606`
Current phase: **Phase 2.1 — Public Content & CMS Expansion**

This document is the operational source of truth for `modulex-store` delivery planning. Keep it current as work progresses. Completed items should be marked `[x]`; blocked items should be marked `[!]` with a short reason.

## Mandatory Session & Change Tracking Protocol

These rules are mandatory for all future Modulex Store work:

1. **Every new conversation/session that touches `modulex-store` must read this file first**, before planning or implementation.
2. The current phase, next action, completed history, blockers, and changed assumptions in this file take precedence over older chat summaries or remembered plans.
3. **Every material Store change must be reflected in this file in the same workstream/PR** before that work is considered complete.
4. When a roadmap task is started, mark it `[~]`. When verified complete, mark it `[x]`. If blocked, mark it `[!]` and record the blocker briefly.
5. Do not mark work complete merely because code was written. Completion requires the task's stated done criteria plus the relevant lint/build/smoke/live verification.
6. If implementation reveals that the roadmap is wrong or incomplete, update the roadmap first or in the same PR; do not silently diverge from it.
7. New work that is not yet listed must be added to the appropriate phase before or alongside implementation.
8. Completed capabilities remain in **Completed Foundation History** so future sessions do not rediscover or rebuild them.
9. At the end of each meaningful Store work package, update:
   - `Last reviewed`
   - `Main baseline` when applicable
   - `Current phase`
   - task checkboxes
   - blockers/decisions
   - `Next Action`
10. If a change spans Store and Admin, **both `modulex-admin/ADMIN_ROADMAP.md` and `modulex-store/STORE_ROADMAP.md` must be reviewed and updated where affected**.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete and verified
- [!] Blocked

## Working Rules

- Do not mark an item complete until its acceptance criteria are verified.
- Every phase must pass its exit gate before the next phase becomes the primary workstream.
- Public Store, Customer Portal, and Dealer Portal share the same Supabase project but must keep strict data-access boundaries.
- Public pages must never expose unpublished catalog content, private dealer pricing, customer-specific fulfillment data, or private supporting documents.
- `modulex-admin` remains the operational/CMS control plane. `modulex-store` remains the public website plus Customer/Dealer portal delivery surface.
- Prefer extending existing RPC and domain modules over adding ad-hoc direct table access from Store.
- New public content must be production-truthful: no placeholder people, phone numbers, awards, testimonials, offers, locations, or dead links.
- Each implementation PR should update this roadmap when it completes or materially changes a listed task.

---

# Phase 2.0 — Production Truth & Cleanup

**Goal:** Remove template/demo content and make every indexable Store route safe to show as an official Oakwell surface.

## 2.0.1 Public route audit and truth cleanup

- [x] Replace or temporarily remove template content from `/about`.
  - Remove invented people, biographies, awards, unsupported company history, fake claims, and fake phone numbers.
  - Replace with verified Oakwell company content or a minimal factual page fed from approved settings/CMS data.
  - **Done when:** page contains no unsupported company claims and all contact data comes from approved source data.
  - Verified in production on main `3802aa9276bb2fe17c7fce0959a2e38b04ba041c`: factual company-profile-backed About renders successfully.

- [x] Replace or remove template content from `/services`.
  - Remove generic interior-design packages and placeholder service claims that do not describe Oakwell Cabinetry.
  - Decide whether the final route should become Product Support / Dealer Support / Cabinet Solutions, or be removed from navigation.
  - **Done when:** route purpose matches the actual Oakwell business and all links resolve to real Store routes.
  - Current deliberate treatment: route removed and production `/services` returns not-found.

- [x] Replace or remove template content from `/services/residential`.
  - Remove Manhattan/Brooklyn projects, fake testimonials, demo 360 links, fake phone number, and design-studio language.
  - **Done when:** route is production-truthful or permanently redirected/removed.
  - Route file is removed and production `/services/residential` returns not-found.

- [x] Replace or temporarily disable `/blog` until a real content source exists.
  - Remove fake articles, dates, categories, duplicate cards, placeholder pagination, and dead links.
  - **Done when:** route either renders real published content or returns a deliberate redirect/not-found behavior.
  - Current deliberate treatment: route removed and production `/blog` returns not-found.

- [x] Replace or temporarily disable `/blog/[slug]` demo content.
  - Remove fake author profiles, comments, categories, recent posts, forms, and placeholder social links.
  - **Done when:** only real published article content can resolve a slug.
  - Route file is removed and an arbitrary production slug (`/blog/phase-2-0-verification`) returns not-found.

- [x] Replace Gallery template dataset with approved Oakwell project/media content.
  - Remove invented project names/categories/locations and fake CTA phone number.
  - Preserve lightbox behavior only for real media.
  - **Done when:** every visible gallery item maps to approved source data.
  - Current deliberate treatment: Gallery is disabled and production `/gallery` returns not-found until Phase 2.1 provides published CMS projects.

- [x] Audit and remove legacy/demo routes such as `/index-premium` and any other unused template variants.
  - Prefer deletion or permanent redirect over leaving discoverable stale pages.
  - **Done when:** no demo marketing page can be reached from a normal URL without an intentional redirect/not-found.
  - Production `/index-premium`, `/index-slider`, and `/gallery/detail` all return not-found.

- [x] Remove all production placeholders across Store.
  - Search for `+1555`, `href="#"`, `.html` legacy links, fake offers, demo author/testimonial names, and template-only copy.
  - **Done when:** automated contract test passes with zero blocked placeholder patterns.
  - Verified by the public-production contract in the passing Store smoke chain; no blocked production placeholder pattern remains in the guarded surface.

## 2.0.2 Indexing and route exposure hardening

- [x] Review sitemap routes after public cleanup.
  - Only include production-ready public routes.
  - Exclude disabled Blog/Services/Gallery routes if they are not production-ready.

- [x] Harden `robots.ts` for portal/auth namespaces.
  - Explicitly disallow `/dealer/`, `/account/`, and `/api/`.
  - Keep route-level `noindex` metadata as a second layer.
  - Verified in production after PR #88/#89 deployment.

- [x] Verify all Customer and Dealer auth/portal layouts have `noindex, nofollow` coverage.
  - Production `/account/login` and `/dealer/login` both emit `<meta name="robots" content="noindex, nofollow">` on main `3802aa9276bb2fe17c7fce0959a2e38b04ba041c`.

- [x] Add a public-production content contract.
  - Fail on fake phone numbers, placeholder `href="#"`, legacy `.html` links, known demo names/claims, or accidentally indexable portal routes.
  - Add it to `npm run smoke`.
  - Contract is implemented, wired to `npm run smoke`, and passed in the fresh local full Store smoke run on 2026-08-29.

### Phase 2.0 Exit Gate

- [x] `npm run lint` passes.
  - Fresh local evidence: 0 errors / 11 existing `@next/next/no-img-element` warnings.
- [x] `npm run build` passes.
  - Vercel production build for main `3802aa9276bb2fe17c7fce0959a2e38b04ba041c` compiled successfully, passed TypeScript, generated all routes, and deployed READY.
- [x] `npm run smoke` passes.
  - Fresh local full smoke passed public production, secondary CMS, client, API, dealer auth/activation, portal experience/auth guard, and public-navbar contracts.
- [x] Public route crawl shows no fake/demo content.
  - Verified production routes include `/about`, `/gallery`, `/gallery/detail`, `/services`, `/services/residential`, `/blog`, an arbitrary `/blog/[slug]`, `/index-premium`, and `/index-slider`.
- [x] Sitemap contains only production-approved routes.

**Phase 2.0 closeout:** formally closed on 2026-08-29. Production truth/indexing/crawl checks, build, fresh lint, and the full Store smoke chain are all verified.

---

# Phase 2.1 — Public Content & CMS Expansion

**Goal:** Move official public content out of hard-coded page templates and into controlled Store CMS data managed from `modulex-admin`.

**Approved architecture and written specs:** implement as four ordered packages: **A) secondary CMS data/RPC foundation → B) Admin Pages/Projects CMS → C) Store About + Gallery/Projects → D) configurable Navbar/Footer and phase closeout**. Blog strategy is **Option B: keep Blog disabled until a real editorial workflow is required**.

## 2.1.1 Shared page-content model

- [x] Define the CMS model for secondary public pages.
  - Controlled first-iteration surfaces: About and Gallery/Projects.
  - Prefer structured fields over an unrestricted page builder for the first iteration.
  - Design: `docs/superpowers/specs/2026-08-29-phase-2-1-a-secondary-cms-foundation-design.md`.

- [x] Add migrations/RPCs for approved public page content.
  - Anonymous users get read-only published projections through narrow RPCs.
  - Admin edits remain authenticated and role-controlled.
  - Package A migration is merged and applied to production Supabase; `store_pages`, `store_projects`, `store_project_media`, RLS boundaries, and the four narrow published-only public RPCs were verified in production.

- [x] Add corresponding Admin CMS screens.
  - Draft/published state.
  - Sort order.
  - SEO title/description/OG image where applicable.
  - Media selection and alt text.
  - Design: `docs/superpowers/specs/2026-08-29-phase-2-1-b-admin-secondary-cms-design.md`.
  - Package B implementation adds `/store/pages` and `/store/projects`, explicit draft/publish/unpublish actions, SEO/OG fields, validated Store media uploads, external video media, and `store.manage` route/sidebar enforcement.
  - Verification: secondary CMS Admin contract, lint (0 errors / 35 existing warnings), deterministic Admin contracts, and Next.js/TypeScript build all passed in GitHub Actions run `33243001683`.

- [ ] Convert About page to CMS-backed production content.

- [ ] Convert Gallery/Projects page to CMS-backed data.
  - Design for both public routes: `docs/superpowers/specs/2026-08-29-phase-2-1-c-store-public-pages-design.md`.

- [x] Decide Blog strategy.
  - Decision: **Option B — no Blog CMS in Phase 2.1.** Keep `/blog` disabled/not-found until editorial workflow is actually required.
  - Do not keep or rebuild a fake blog merely for template completeness.

## 2.1.2 Shared Store chrome

- [ ] Make primary navigation configurable from approved site settings if business navigation is expected to change without deployment.

- [ ] Review footer sections and links for CMS configurability.

- [ ] Ensure public Navbar and portal Navbar coexist without breaking the portal sidebar experience.

- [ ] Add a clear path from Customer/Dealer portal back to the public site.
  - Shared chrome design: `docs/superpowers/specs/2026-08-29-phase-2-1-d-shared-store-chrome-design.md`.

### Phase 2.1 Exit Gate

- [ ] No major public marketing page requires code changes for ordinary content updates.
- [ ] Public page content is read through controlled RPCs.
- [x] Admin roles can manage the supported content without direct database work.
  - Package B provides controlled Pages/Projects CRUD and publish workflows under existing authenticated RLS.
- [x] Draft content is not publicly visible.
  - Package A public RPCs filter to `status = 'published'`; Admin writes remain behind authenticated RLS.

---

# Phase 2.2 — Catalog Discovery

**Goal:** Turn `/products` from a basic list/search page into an efficient cabinet catalog discovery surface.

## 2.2.1 Query and filtering

- [ ] Add category filtering.
- [ ] Add brand filtering if multiple brands are truly used in the catalog.
- [ ] Expose existing color-code filtering in the UI.
- [ ] Add active color swatches from `store_color_options`.
- [ ] Preserve search/filter state in URL query parameters.
- [ ] Add deterministic server-side pagination.
- [ ] Return total result count without loading up to 5000 products into memory.

## 2.2.2 Catalog UX

- [ ] Add filter controls suitable for desktop and mobile.
- [ ] Add clear-all and per-filter removal.
- [ ] Add useful empty states for filter combinations.
- [ ] Add skeleton/loading behavior where navigation requires it.
- [ ] Confirm product cards expose the right primary image, family code/name, and useful variant summary.
- [ ] Review image aspect ratios and responsive behavior.

## 2.2.3 Catalog data contract

- [ ] Define stable RPC response contract for facets + paginated results.
- [ ] Add smoke coverage for unpublished products remaining hidden.
- [ ] Add smoke coverage for inactive product variants being excluded.
- [ ] Add smoke coverage for color filters and search behavior.

### Phase 2.2 Exit Gate

- [ ] Catalog no longer fetches all products for normal browsing.
- [ ] Search/filter/pagination URLs are shareable and deterministic.
- [ ] Public data remains restricted to published catalog projections.
- [ ] Mobile catalog filtering is usable without layout breakage.

---

# Phase 2.3 — Product Detail Experience

**Goal:** Make product detail pages useful for both public prospects and authenticated dealers without crossing pricing/privacy boundaries.

## 2.3.1 Media and variants

- [ ] Add interactive product gallery.
- [ ] Bind selected color/variant to color-specific media where available.
- [ ] Render video media when supported.
- [ ] Add swatch UI with accessible labels and selected state.
- [ ] Keep variant SKU visibility intentional and business-approved.

## 2.3.2 Product information

- [ ] Review and structure specifications beyond free-form description where needed.
- [ ] Improve downloads/resources section.
- [ ] Add related/similar product families using deterministic business rules.
- [ ] Add contact CTA context so product inquiries preserve product identity.

## 2.3.3 Dealer-aware experience

- [ ] For authenticated dealers, expose approved dealer-specific price visibility on catalog/detail pages.
- [ ] Keep public visitors completely isolated from dealer pricing RPCs.
- [ ] Define display rules for price tiers, effective dates, and unavailable pricing.
- [ ] Add deep link from product detail to Dealer Portal where appropriate.

## 2.3.4 SEO structured data

- [ ] Add `Product` JSON-LD using published product data.
- [ ] Do not emit Offer pricing schema unless the business has approved public pricing.
- [ ] Keep canonical URLs stable by product slug.

### Phase 2.3 Exit Gate

- [ ] Product variants/media behave correctly across desktop/mobile.
- [ ] Dealer price cannot be obtained anonymously.
- [ ] Product metadata and structured data validate.
- [ ] Downloads and contact tracking carry product context.

---

# Phase 2.4 — Leads, Privacy & Dealer Acquisition

**Goal:** Finish the public conversion flow around Contact and Dealer Applications with production legal/privacy behavior and operational follow-through.

## 2.4.1 Privacy and consent

- [ ] Add a real `/privacy` page with approved policy content.
- [ ] Point Store marketing settings `privacy_policy_href` to the approved route.
- [ ] Add visible privacy-policy links near lead consent text.
- [ ] Review consent copy with final business/legal wording.
- [ ] Confirm optional marketing consent is stored independently from required inquiry consent.

## 2.4.2 Lead workflow

- [ ] Verify contact leads are visible and manageable in Admin.
- [ ] Verify dealer applications, supporting documents, status changes, and internal notes work end-to-end.
- [ ] Define user-facing success/failure behavior for partial document upload failures.
- [ ] Decide whether confirmation email is required.
- [ ] Decide whether internal notification email/Slack is required.

## 2.4.3 Abuse protection

- [ ] Review current email-based database rate guard.
- [ ] Add IP/request-level rate limiting if production abuse justifies it.
- [ ] Decide whether Turnstile/hCaptcha is necessary based on actual spam volume.
- [ ] Keep upload MIME/size/token validation covered by tests.

### Phase 2.4 Exit Gate

- [ ] Lead submission succeeds end-to-end in production.
- [ ] Dealer supporting documents stay private.
- [ ] Privacy policy and consent links are visible and correct.
- [ ] Admin can process submitted leads without manual SQL.

---

# Phase 2.5 — SEO, Analytics & Discoverability

**Goal:** Make the public Store indexable, measurable, and structurally correct without leaking private portal surfaces.

## 2.5.1 Technical SEO

- [ ] Audit title/description/canonical metadata for every production public route.
- [ ] Generate Organization JSON-LD from approved company profile data instead of only static config where useful.
- [ ] Keep WebSite JSON-LD aligned with production domain and company identity.
- [ ] Add breadcrumbs consistently to secondary pages.
- [ ] Validate sitemap output with production domain.
- [ ] Validate redirects from legacy `/shop` URLs.
- [ ] Add deliberate 404 metadata and UX.

## 2.5.2 Analytics

- [x] Consent defaults to denied before optional tracking loads.
- [x] GA4/GTM settings are controlled from Store marketing settings.
- [x] Session attribution captures UTM/referrer context.
- [x] Product view, search, contact click, lead start/submit, and catalog download event foundations exist.
- [ ] Define final conversion event taxonomy and naming document.
- [ ] Verify production GA4/GTM configuration and consent behavior.
- [ ] Add dealer application funnel reporting requirements.
- [ ] Add portal analytics only if it provides clear business value and does not expose sensitive values.

### Phase 2.5 Exit Gate

- [ ] Search-engine-visible routes have validated metadata/schema.
- [ ] Portal/auth routes are excluded from indexing.
- [ ] Analytics events contain no form field values or private business data.
- [ ] Consent behavior is verified in production.

---

# Phase 2.6 — Performance, Accessibility & Frontend Cleanup

**Goal:** Reduce template-era frontend debt and make Store fast, accessible, and maintainable.

## 2.6.1 Dependency and asset cleanup

- [ ] Verify and remove unused `@emailjs/browser` dependency.
- [ ] Verify and remove unused `locomotive-scroll` dependency if no runtime usage remains.
- [ ] Remove stale EmailJS variables/comments from `.env.example`.
- [ ] Audit unused template components/assets after demo routes are removed.
- [ ] Convert high-value raw `<img>` usage to `next/image` where it materially improves loading.

## 2.6.2 CSS and layout

- [ ] Audit overlapping global CSS files and portal-specific styles.
- [ ] Remove obsolete template selectors after route cleanup.
- [ ] Reduce inline style usage in reusable catalog/portal components.
- [ ] Verify Navbar behavior across scroll, mobile menu, public pages, account pages, and dealer pages.
- [ ] Verify PortalShell header/sidebar responsiveness.

## 2.6.3 Accessibility

- [ ] Keyboard audit for Navbar, filters, lightbox, product gallery, consent manager, and portal sidebar.
- [ ] Focus-state audit.
- [ ] Heading hierarchy audit.
- [ ] Form label/error announcement audit.
- [ ] Color contrast audit for public and portal themes.
- [ ] Confirm reduced-motion behavior for animated/360 surfaces.

## 2.6.4 Performance

- [ ] Capture Lighthouse baseline for Home, Products, Product Detail, Contact, Account Login, and Dealer Portal.
- [ ] Optimize LCP hero media.
- [ ] Review font loading and unused CSS/JS.
- [ ] Review Supabase public RPC caching/revalidation strategy.
- [ ] Remove unnecessary client components where server components are sufficient.

### Phase 2.6 Exit Gate

- [ ] No known unused high-cost dependencies remain.
- [ ] Key pages meet agreed Core Web Vitals targets.
- [ ] Keyboard-only navigation works on primary user journeys.
- [ ] Public and portal layouts pass mobile regression review.

---

# Phase 2.7 — Documentation & Operational Readiness

**Goal:** Make the Store understandable and operable without relying on conversation history.

## 2.7.1 Repository documentation

- [ ] Replace default create-next-app `README.md` with Modulex Store documentation.
  - Architecture overview.
  - Public vs Customer vs Dealer surface boundaries.
  - Required environment variables.
  - Local development commands.
  - Build/lint/smoke commands.
  - Supabase migration/function notes.
  - Vercel deployment notes.

- [ ] Update `.env.example` to match current runtime requirements.
- [ ] Document production URL/domain expectations.
- [ ] Document why service-role keys must never appear in Store public env variables.

## 2.7.2 Test and release process

- [ ] Document smoke suites and what each contract protects.
- [ ] Define PR checklist for Store changes.
- [ ] Require roadmap update when a roadmap task is completed.
- [ ] Add a release checklist for changes touching migrations, edge functions, auth, or portal access.

## 2.7.3 Operational observability

- [ ] Define minimum error monitoring/logging strategy.
- [ ] Define lead submission failure monitoring.
- [ ] Define supporting-document upload failure monitoring.
- [ ] Define auth/portal access failure monitoring.

### Phase 2.7 Exit Gate

- [ ] A developer can understand, run, test, and deploy Store from repository documentation alone.
- [ ] Production-sensitive changes have a repeatable verification checklist.

---

# Phase 3 Candidates — B2B / Portal Next

These are candidates after the public Store productionization work is stable. Re-prioritize based on business needs.

## 3.1 Dealer self-service ordering

- [ ] Decide whether Dealer Portal will support quote/cart/order creation.
- [ ] Define product availability rules.
- [ ] Define dealer price calculation source of truth.
- [ ] Define shipping/tax/payment boundaries before implementing checkout.
- [ ] Keep approval/credit-limit workflows aligned with Admin operations.

## 3.2 Dealer resources

- [ ] Dealer-only technical documents library.
- [ ] Price-list exports where business-approved.
- [ ] Marketing assets / catalogs / spec sheets.
- [ ] Saved products or favorites if useful.

## 3.3 Customer portal next

- [ ] Invoice/document visibility if required.
- [ ] Support/request workflow if required.
- [ ] Improved shipment timeline and delivery history.
- [ ] Reorder/request-quote functionality if approved.

## 3.4 Notifications

- [ ] Shipment-status notifications.
- [ ] Dealer application lifecycle notifications.
- [ ] Portal activation/password lifecycle notifications.
- [ ] User-controlled notification preferences where necessary.

---

# Completed Foundation History

The items below are already present in the current Store architecture. Keep them here so future planning does not repeatedly rediscover completed work.

## Catalog foundation

- [x] `store_product_content` publishable product-content model exists.
- [x] Product media model supports image/document/video types.
- [x] Color option model exists.
- [x] Anonymous catalog reads use controlled public RPCs.
- [x] Direct anonymous table access is restricted.
- [x] Product detail RPC and product slug validation exist.
- [x] Legacy `/shop` and `/shop/[slug]` permanently redirect to `/products` equivalents.

## Homepage / Store CMS foundation

- [x] Homepage hero content can be controlled from Store site settings.
- [x] Homepage featured product section is data-backed.
- [x] Homepage feature blocks are data-backed.
- [x] Dealer CTA settings are data-backed.
- [x] Footer description/social links are data-backed.
- [x] Homepage SEO title/description/OG image settings exist.

## Leads and dealer application foundation

- [x] Contact form submits through `/api/leads`.
- [x] Dealer application form submits through `/api/leads`.
- [x] Server-side request validation exists.
- [x] Same-origin request checks exist.
- [x] Honeypot field exists.
- [x] Dealer supporting document uploads support PDF/JPG/PNG with size limits.
- [x] Supporting documents are stored through a controlled Supabase Edge Function flow.
- [x] Database submission guard limits repeated anonymous submissions by email.

## Marketing / analytics foundation

- [x] Store marketing settings table/RPC exists.
- [x] Consent banner settings are Admin-controlled.
- [x] Do Not Track can be respected.
- [x] GA4 and GTM identifiers are validated and configurable.
- [x] Consent-aware analytics event utility exists.
- [x] UTM/referrer session attribution exists.

## Portal foundation

- [x] Customer and Dealer portal identity boundaries exist.
- [x] Auth profile guards and RPC grant hardening exist.
- [x] Dealer activation lifecycle exists.
- [x] Unified portal order access exists.
- [x] Customer/Dealer fulfillment visibility exists.
- [x] Dealer catalog pricing visibility exists behind authenticated portal boundaries.
- [x] Dealer documents/account capabilities exist.
- [x] Portal shell supports customer/dealer navigation.
- [x] Public Navbar remains available on portal/account routes so users can return to the main site.

## Test foundation

- [x] Client analytics/attribution smoke tests exist.
- [x] Dealer activation contract exists.
- [x] Dealer auth contract exists.
- [x] Portal RPC auth guard contract exists.
- [x] Store portal contract exists.
- [x] Portal experience contract exists.
- [x] Portal public-navbar contract exists.
- [x] SQL smoke tests cover dealer portal activation/auth/isolation, order access, fulfillment, pricing, and private document policies.

---

# Next Action

Primary Store work is now **Phase 2.1C — Store About + Gallery/Projects**.

1. Wire `modulex-store/src/lib/store/content/queries.ts` to the approved published-only Package A RPCs.
2. Convert About to CMS-backed copy while retaining canonical company-profile identity/contact data and the factual fallback.
3. Enable Gallery only when the Gallery page is published and at least one project is published; otherwise keep deliberate not-found behavior and omit it from sitemap/navigation.
4. Bind real project/media data to the existing gallery/lightbox experience without adding a public project-detail route in Phase 2.1.
5. Add metadata/sitemap/contract coverage, run Store lint/build/smoke/live verification, and update both roadmaps where cross-project behavior changes.

**Completed dependency chain:** Phase 2.0 closed → Phase 2.1A production data/RPC foundation complete → Phase 2.1B Admin Pages/Projects CMS complete. Package D navigation/footer configurability remains after Package C.
