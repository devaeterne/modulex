# Oakwell Cabinetry — Granite & Cabinet Center Content / Media Migration Roadmap

Last reviewed: 2026-08-30
Status: **APPROVED — execute sequentially via reviewed PRs**
Primary source: https://granitecenterva.com/
Target: `devaeterne/modulex` → `modulex-store` + controlled CMS in `modulex-admin`

Architecture design: `modulex-store/docs/superpowers/specs/2026-08-29-oakwell-dynamic-content-cms-design.md`
GC-0 truth/ownership lock: `modulex-store/docs/GC0_BUSINESS_TRUTH_LOCK.md`
GC-1 implementation plan: `modulex-store/docs/superpowers/plans/2026-08-29-gc1-source-content-media-manifest.md`
GC-2 implementation plan: `modulex-store/docs/superpowers/plans/2026-08-29-gc2-media-library-optimization-implementation.md`
GC-2 production acceptance: `modulex-store/docs/granite-center/GC2_PRODUCTION_ACCEPTANCE.md`
GC-3 implementation plan: `docs/superpowers/plans/2026-08-29-gc3-company-identity-contact-about-showroom.md`
GC-3 production acceptance: `modulex-store/docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md`
GC-4 production acceptance: `modulex-store/docs/granite-center/GC4_PRODUCTION_ACCEPTANCE.md`
GC-8A design: `modulex-store/docs/superpowers/specs/2026-08-30-gc8a-store-chrome-seo-design.md`
GC-8A implementation plan: `modulex-store/docs/superpowers/plans/2026-08-30-gc8a-store-chrome-seo.md`
GC-1 manifest: `modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md` + `gc1-source-manifest.json`

> Purpose: identify which verified Granite & Cabinet Center business data, media, social proof, forms, showroom information, and cabinet-related content should be adapted into Oakwell Cabinetry without cloning the parent website or importing stale/irrelevant WordPress content.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Verified complete
- `[!]` Blocked / business decision required
- `[?]` Needs source-of-truth confirmation

---

# 0. Guiding Decisions

## 0.1 Brand relationship

GC-0 is authoritative for the current public relationship and factual locks.

- Oakwell Cabinetry is treated as a Granite & Cabinet Center brand.
- Approved relationship wording: `Oakwell Cabinetry — a Granite & Cabinet Center brand.`
- Parent-company identity/history/projects/reviews/service claims must not be represented as Oakwell-specific unless explicitly confirmed.
- Parent-company content may be used as attributed supporting context where GC-0 permits it.

## 0.2 Architecture principle — approved

The migration uses a **structured hybrid CMS** and extends existing Modulex domains rather than creating a second CMS or cloning WordPress.

Canonical flow:

`modulex-admin` → Supabase DB / Storage → narrow published/public projections → `modulex-store`

Permanent rules:

- Do **not** clone Granite Center WordPress structure, page markup, embedded forms, duplicated sections, plugins, shortcodes, or broken widgets.
- Granite Center is migration evidence, never a runtime content backend.
- Reuse `general_settings`, `store_pages`, `store_projects`, `store_project_media`, `store_site_settings` and existing lead/CMS foundations where they fit.
- Add typed domains incrementally when a GC package first needs them; do not create speculative tables or one unrestricted page-builder blob.
- Mutable production business values must be DB/Storage-backed and Admin-managed rather than hard-coded in Store runtime source.
- Anonymous Store consumers read only narrow published/public projections; they do not receive direct unrestricted CMS table access.
- Approved media must be copied/optimized into Oakwell-controlled Supabase Storage; raw WordPress URLs are provenance only.
- Source discovery does not publish content. The lifecycle is `discovered → classified → imported as draft → reviewed → approved → published`.

## 0.3 Parallel-work safety

Other Modulex conversations may merge Admin/Store PRs while this workstream runs.

Before every GC package:

1. fetch latest `main`;
2. read `modulex-store/STORE_ROADMAP.md` first;
3. if Admin is touched, read `modulex-admin/ADMIN_ROADMAP.md` too;
4. preserve parallel roadmap work when rebasing/updating;
5. branch from current `main`, never from a remembered SHA.

---

# 1. Granite Center Source Audit

This section records parent-source evidence. GC-0 decides whether the evidence may become Oakwell public truth.

## 1.1 Contact / location conflicts discovered

### Address variants

Parent pages expose variants including:

- `22446 DAVIS DR #109-127 STERLING, VA 20164`
- `22446 Davis Dr #109, Sterling, VA 20164`
- `22446 Davis Dr Ste 109, Sterling, VA 20164`

**Current rule:** do not overwrite Oakwell canonical profile automatically. Preserve variants as source evidence in GC-1; public Store reads the controlled Oakwell source.

### Phone variants

Parent pages expose:

- `703-956-9470`
- `703-439-1040`
- fax `(703) 956-9649`

**Current rule:** these values may be recorded as source evidence. They do not become runtime constants or automatically replace the Oakwell primary phone. If a parent number is later approved as a public secondary channel, it must be represented in the structured DB/Admin contact model first.

### Hours found

Parent source states:

- Monday–Friday: `8:00 AM – 6:00 PM`
- Saturday: `8:00 AM – 6:00 PM`
- Showroom shorthand: `Mon–Sat 8am–6pm`

**Current rule:** parent hours stay unpublished on Oakwell until a canonical Oakwell hours domain/value is business-confirmed and Admin-managed. Sunday must not be inferred.

### Service region found

Parent source references Virginia, Maryland, Washington D.C. and Greater Washington DC/surrounding areas.

**Current rule:** do not publish this as guaranteed Oakwell coverage until confirmed and represented in the controlled source.

## 1.2 Parent-company history / positioning

Parent source repeatedly uses claims such as:

- `Since 2011`
- `Trusted by Thousands`
- family-owned wording;
- cabinetry/remodeling/countertop/fabrication/installation positioning;
- large assortment and promotional claims.

GC-0 rules apply:

- `Since 2011` is parent-attributed only and omitted from initial Oakwell migration unless specifically useful.
- family-owned, awards, satisfaction guarantees and similar claims are not migrated by default.
- installation/free-design/SLA/promotional claims are not inherited automatically.

## 1.3 Parent-site technical/content defects not to propagate

- conflicting contact/address values;
- duplicated sections/copy;
- broken Trustindex messages;
- raw Contact Form 7 shortcode on Showroom;
- Wufoo iframe dependency;
- volatile discounts, prices, turnaround and inventory-count claims;
- typographic/content inconsistencies;
- parent payment links;
- granite/stone FAQ irrelevant to Oakwell cabinetry;
- legacy WordPress filenames and likely duplicate media.

Oakwell migration is normalization, not mirroring.

---

# 2. Page-by-Page Migration Matrix

| Granite Center surface | Oakwell action | Target domain/surface | Notes |
|---|---|---|---|
| Header contact/address | **Source evidence / controlled profile only** | company profile/contact/location | Never hard-code source variants. |
| About Us | **Adapt, do not copy verbatim** | `store_pages` / typed sections | Parent relationship and cabinet/showroom context only where truthful. |
| Contact | **Adapt around native Oakwell lead flow** | company profile + contact page + form config | Contact facts come from controlled domains. |
| Wufoo estimate form | **Do not embed** | native lead form | Useful field concepts may be mapped in GC-4. |
| Showroom | **Create Oakwell showroom surface** | location/showroom domain + page CMS | No unconfirmed hours. |
| Residential Projects | **Selective candidates** | `store_projects` + media | Cabinet/kitchen/vanity relevance required. |
| Commercial Projects | **Hold** | future project candidates | Do not launch as Oakwell work without scope/attribution verification. |
| Kitchen Cabinet Sale / cabinet landing pages | **Mine structure/process, rewrite** | page/process/FAQ content | Exclude promotions, guarantees, SLAs. |
| Cabinet brand pages | **Selective evidence** | catalog/content only if actual Oakwell scope matches | Do not import unsupported brand claims. |
| Testimonials / reviews | **Parent-attributed or hold** | future review domain | Never relabel parent reviews as Oakwell reviews. |
| FAQ | **Exclude source stone FAQ text** | future Oakwell cabinet FAQ domain | Build cabinet-specific FAQ in GC-6. |
| Accessories: sinks/faucets/grids | **Hold** | none initially | Requires explicit catalog scope approval. |
| Home Office | **Hold** | none initially | Potential cabinetry expansion only if confirmed. |
| Garden | **Hold** | none initially | Not initial Oakwell scope. |
| Granite / Quartz | **Exclude from core Oakwell** | none | Parent brand/cross-sell only if separately approved later. |
| Countertop Services & Fees | **Exclude** | none | Parent repair/service pricing. |
| Deals/promotions | **Exclude** | none | Volatile/unverified business claims. |
| PAY / CardPointe | **Exclude** | none | Finance decision required. |
| Career | **Exclude initial scope** | none | Separate future decision. |
| WordPress plugins/widgets | **Never migrate** | none | No Trustindex/CF7/widget cloning. |

---

# 3. Content Recommended for Oakwell

All recommendations below are candidate content. Final copy and display values must live in Admin-managed CMS/settings data when implemented.

## 3.1 About

Candidate sections:

- Oakwell Cabinetry brand statement;
- clear Granite & Cabinet Center relationship;
- Sterling showroom context;
- cabinet-focused design/product support;
- parent-team experience only with attribution;
- Product Catalog CTA;
- Dealer Program CTA;
- Showroom CTA/media.

Avoid:

- long countertop/fabrication copy;
- categories Oakwell does not sell;
- discounts/turnaround/inventory-count guarantees;
- duplicated parent SEO paragraphs.

## 3.2 Contact / Showroom

Candidate data/content:

- primary/secondary approved contact channels;
- canonical location/showroom address;
- business hours once confirmed;
- directions/map action;
- relationship label;
- selected showroom photography;
- first-party project consultation form;
- Dealer Application as a separate flow.

All mutable values are controlled data. Do not duplicate phone/address/hours literals across Navbar, Footer, Contact, Showroom and JSON-LD.

## 3.3 Project consultation concepts

Parent form/process concepts worth evaluating:

- project type/context;
- showroom/design consultation intent;
- project address/city/ZIP where operationally useful;
- desired consultation date as a preference, not guaranteed appointment;
- project notes;
- existing name/email/phone/privacy/marketing/UTM fields already supported by Oakwell.

Customer drawing/file upload remains out of the first migration scope per GC-0; dealer supporting-document behavior remains unchanged.

## 3.4 Gallery / Projects

Use existing `store_projects` + `store_project_media` foundation and extend it only where provenance/controlled media relationships require it.

Candidate taxonomy:

- Residential Kitchen
- Bathroom / Vanity
- Home Office / Built-in — only if scope later confirmed
- Commercial — hold initially
- Showroom / Display

Imported project records must retain:

- title/slug;
- category;
- public location where appropriate;
- summary;
- cover/gallery media;
- alt text;
- source/provenance;
- source brand/entity;
- attribution classification;
- cabinet relevance;
- sort order;
- draft/published review state.

Parent residential source contains cabinet/vanity/kitchen-relevant material mixed with large amounts of countertop-only imagery. Countertop-only assets are not default Oakwell project content.

Commercial names discovered in the earlier audit include Alba Osteria, Cafe Cantina Harbour, L'Hommage, National Airport Grill, Ottoman Taverna, Planet Fitness, Greene Turtle and The Wharf. Keep these on hold until the actual work shown is verified as relevant and the attribution model is approved.

## 3.5 Cabinet customer journey

Useful parent process structure:

1. Pre-Design / Project Intake
2. Preliminary Design & Selection
3. 3D Design / Revision / Finalization
4. Ordering / Fulfillment
5. Installation / Coordination only if Oakwell service scope is confirmed

Do not inherit `free`, `24 business hours`, `2–4 weeks`, `100% satisfaction`, `50% off`, licensed/bonded/insured or similar promises without explicit business confirmation.

## 3.6 FAQ

Do not transfer the stone FAQ text. Future Oakwell cabinet FAQ may cover approved topics such as cabinet construction, styles/finishes, measurements, design consultation, lead times, ordering, delivery/pickup, installation responsibility, care, warranty, damage/replacement parts, dealer vs retail purchasing and showroom visits.

FAQ entries are CMS data, not Store hard-coded arrays.

## 3.7 Reviews / testimonials

- Parent review content may only be used with Granite & Cabinet Center attribution.
- Prefer curated/source-linked content instead of reintroducing a third-party widget.
- Add an Admin-managed review/testimonial domain in GC-7 if the feature is approved.
- Publication must prevent parent reviews from appearing as Oakwell-specific reviews.

---

# 4. Media Migration & Optimization

## 4.1 GC-1 source media manifest

GC-1 records source evidence only. Required concepts include:

- source page URL;
- source media URL when actually discoverable;
- source alt/label when available;
- media kind/subject;
- proposed Oakwell placement/domain;
- cabinet relevance;
- attribution requirement;
- migration action;
- notes.

GC-1 must **not** invent dimensions, file sizes, MIME types or checksums. Unverified byte-level metadata stays `null`.

## 4.2 GC-2 byte acquisition and deduplication

GC-2, not GC-1, owns:

- downloading approved originals;
- verified original filename/format/dimensions/bytes;
- SHA-256 exact deduplication;
- optional perceptual/visual duplicate detection;
- EXIF/GPS stripping;
- orientation correction;
- conservative resize without upscaling;
- optimized master creation;
- Supabase Storage upload;
- media-library registration;
- before/after size reporting.

## 4.3 Suggested optimization targets

Targets are engineering benchmarks, not public business claims:

- hero/showroom wide master: max long edge around `1920–2560px` depending source quality;
- project/gallery master: max long edge around `1600–1920px`;
- WebP quality starting point around 72–82;
- AVIF quality starting point around 50–65;
- hero common-viewport target ideally `<= 250 KB` when visually acceptable;
- gallery card target ideally `<= 120–160 KB`;
- small thumbnail target ideally `<= 60–90 KB`.

Wood grain/detail fidelity takes priority over arbitrary byte targets.

## 4.4 Delivery

- use Oakwell-controlled Supabase media, not WordPress hotlinks;
- use responsive Next.js image delivery with explicit `sizes`;
- preload/priority only the true LCP hero;
- lazy-load below-the-fold media;
- preserve intrinsic dimensions/aspect ratio to prevent CLS;
- meaningful alt text is CMS-managed business content;
- decorative images use empty alt where appropriate.

---

# 5. Data / CMS Ownership Map

## 5.1 Existing domains to preserve

- `general_settings` — canonical company-profile root fields that already exist;
- `store_site_settings` — existing Store settings where semantically appropriate;
- `store_pages` — controlled page content/SEO;
- `store_projects` — project entity;
- `store_project_media` — existing project/media relationship;
- existing Lead API/tables and attribution flow.

## 5.2 Structured domains introduced only when required

Planning domains may include:

- contact channels;
- public locations/showrooms;
- location hours;
- reusable media assets;
- FAQ;
- reviews/testimonials;
- navigation/footer configuration;
- business-controlled form options.

Exact production table/RPC names are decided in the implementation package after current schema review. The roadmap does not authorize speculative table creation.

## 5.3 Admin requirement

Every mutable public content domain introduced by the migration must have an appropriate Admin management surface by the time it is considered complete. Final operation may not depend on manual SQL for ordinary content changes.

## 5.4 Store requirement

Store consumes only narrow server-side public projections. Internal migration notes, private metadata and draft/hold content do not cross the public RPC boundary.

---

# 6. Form Migration

## 6.1 Source behavior

Parent site uses Wufoo and exposes useful concepts such as project type, consultation request, contact/address context, preferred date, notes and upload.

## 6.2 Oakwell implementation rule

- keep native `/api/leads` path;
- do not embed Wufoo/Contact Form 7;
- keep validation/security behavior code-owned;
- make mutable business options Admin/data-managed when implemented;
- preserve UTM/landing/referrer attribution;
- preserve privacy/marketing consent separation;
- keep customer file upload deferred until separately approved;
- keep dealer supporting-document infrastructure private and separately scoped.

---

# 7. SEO / Local Business / Trust

- visible contact/location/hours and structured-data facts must derive from the same controlled sources;
- do not hard-code a second phone/address/hours copy inside JSON-LD;
- add Organization/LocalBusiness relationship only after corresponding data is confirmed;
- do not create contradictory local-business identities for the same physical showroom;
- write Oakwell-specific SEO content in CMS rather than duplicating parent paragraphs;
- use project locations only when public/appropriate;
- add cabinet FAQ structured data only after real Oakwell FAQ content exists;
- canonical metadata for `/showroom` is managed from the appropriate page/settings domain.

---

# 8. Execution Phases

## GC-0 — Business truth + data ownership lock

Status: `[x]` merged/accepted baseline; ownership amendment approved for the next documentation synchronization.

Completed decisions include:

- canonical current Oakwell profile path/value baseline;
- parent/Oakwell attribution boundary;
- deterministic handling of conflicting parent phone/address evidence;
- fail-closed hours/service-area/service/promotion rules;
- initial migration scope/holds/exclusions;
- customer upload deferral;
- dynamic ownership rule: Admin → Supabase DB/Storage → controlled public projection → Store;
- no runtime hard-code migration shortcuts.

**Exit gate:** truth and ownership lock exists and is accepted.

## GC-1 — Source crawl & content/media manifest

Goal: create a complete, machine-checkable migration inventory before touching public CMS or Storage.

Plan: `modulex-store/docs/superpowers/plans/2026-08-29-gc1-source-content-media-manifest.md`

- `[x]` crawl/review parent navigation + cabinet-relevant landing pages;
- `[x]` record page-level disposition using `adapt`, `parent_attributed`, `hold`, `exclude`, `business_confirmation_required`;
- `[x]` inventory content candidates and conflict evidence;
- `[x]` inventory source media references and qualitative relevance;
- `[x]` map each accepted candidate to its proposed controlled CMS domain;
- `[x]` keep unverified byte metadata null;
- `[x]` validate manifest with a deterministic Node contract;
- `[x]` update Store/Admin roadmaps without overwriting parallel work.

**Exit gate:** every candidate page/content/media/conflict record has a valid disposition and target-domain mapping; deterministic manifest contract passes. No production DB/schema/content/media mutation occurs in GC-1.

## GC-2 — Media library & optimization pipeline

Goal: create reusable, traceable Oakwell-controlled media without visual degradation.

Status: `[x]` production-accepted on 2026-08-29.

**Package status**

- `[x]` **GC-2A — schema/security foundation:** reusable asset/provenance tables and private staging boundary are production-verified.
- `[x]` **GC-2B — importer/optimizer capability:** bounded Granite acquisition, verified metadata/hash, no-upscale WebP optimization, private staging writer/idempotency, rollback, credential gate, reporting and `--publish` prohibition are verified. A real `media-showroom-01` dry-run succeeded in Actions `33260112614` with zero production DB/Storage writes.
- `[x]` **GC-2C — Admin Media Library:** `/store/media`, `store.manage` RBAC, metadata/provenance review, private signed staging previews, and controlled server-side publish/unpublish/delete lifecycle are verified; production intake remains zero and deferred to GC-2D.
- `[x]` **GC-2D — controlled production intake:** the Admin/Vercel Node boundary with caller JWT + existing RLS, private staging, publish prohibition, pinned `sharp@0.35.4`, and Webpack Sharp tracing is production-accepted. The representative asset completed import/review/publish, exact-SHA duplicate import, unpublish, same immutable-path republish, and post-PR #128 missing-private-original self-heal. Final state remained one asset/provenance/public object with both private staging objects present. Full evidence: `docs/granite-center/GC2_PRODUCTION_ACCEPTANCE.md`.

- `[x]` design/implement reusable media asset domain and Admin management required by migration;
- `[x]` download approved originals;
- `[x]` verify metadata and SHA-256 dedupe;
- `[ ]` optional perceptual dedupe where useful — not required for GC-2 exact-SHA representative acceptance; reconsider only if GC-5 source sets expose near-duplicates;
- `[x]` strip unnecessary EXIF/GPS;
- `[x]` resize/encode conservatively without upscaling;
- `[x]` upload to controlled Supabase Storage;
- `[x]` register provenance/attribution/review status;
- `[x]` verify optimized WebP public delivery; responsive Store rendering remains consumer acceptance in GC-5 when media is attached to projects;
- `[x]` verify import idempotency/no duplicate uploads.

**Exit gate:** `[x]` approved media library exists in controlled Storage/CMS with Admin management and traceable source metadata. Production acceptance is recorded in `docs/granite-center/GC2_PRODUCTION_ACCEPTANCE.md`; GC-3 is also closed, GC-4 is next, and GC-5 retains project/media association ownership.

## GC-3 — Company identity, contact, About & Showroom

Goal: make real-world Oakwell identity/location content fully data-driven.

Status: `[x]` production-accepted on 2026-08-29. Acceptance: `modulex-store/docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md`.

- `[x]` add structured contact/location/hour domains with Admin-only write boundaries and a narrow active public projection;
- `[x]` preserve `general_settings` as canonical scalar company identity instead of duplicating it;
- `[x]` expose Admin `/store/company` under `store.manage`;
- `[x]` make Contact consume canonical profile data plus active structured rows without replacing the native first-party lead form;
- `[x]` preserve About on the existing published `store_pages.slug = 'about'` CMS + verified company identity contract;
- `[x]` add `/showroom` and render only explicitly active showroom rows, with a truthful empty state when none are published;
- `[x]` gate hours/directions behind explicitly supplied and published data; no Sunday, hours, map URL, or showroom is inferred;
- `[x]` add Showroom navigation/footer entry while keeping media/project association outside GC-3.

**Exit gate:** `[x]` ordinary structured contact/location/showroom changes are Admin/Supabase-managed and Store reads the controlled projection; current production does not manufacture unconfirmed showroom facts.


## GC-4 — Contact / Project Consultation

Goal: replace parent form behavior with configurable first-party Oakwell lead capture.

- `[x]` define the Admin-managed business-configurable option domain without seeding unapproved option values;
- `[x]` extend DB/API only for approved project-consultation fields while preserving backward-compatible general inquiries;
- `[x]` add Admin management/visibility through `/store/leads/form-options` and the Project Consultation lead-detail panel;
- `[x]` keep validation/security behavior code-owned and preserve the public SECURITY INVOKER → private SECURITY DEFINER submission boundary;
- `[x]` verify privacy/marketing separation, attribution persistence, option validation, and dealer/project-field isolation;
- `[x]` keep customer file upload deferred; dealer supporting-document behavior remains unchanged.

**Exit gate:** `[x]` GC-4 is production-accepted. Migration `gc4_contact_project_consultation` is applied, Store/Admin production builds are READY on main `406bd374a4b4a7738a1a785709f3b277d21e4410`, live `/contact` exposes General Inquiry / Project Consultation, and the empty public option projection fails closed until business-approved option values are configured. Evidence: `docs/granite-center/GC4_PRODUCTION_ACCEPTANCE.md`.

**Exit gate:** no Wufoo dependency; configured lead appears correctly in Admin and no mutable business options require Store source edits.

## GC-5 — Projects / Gallery migration

Goal: seed real, curated, CMS-managed cabinet portfolio content.

- `[x]` import approved cabinet-relevant candidates as drafts;
- `[x]` attach controlled media assets;
- `[x]` add provenance, title/category/location/summary/alt text;
- `[x]` preserve parent attribution where required;
- `[x]` review and publish curated set;
- `[x]` verify Gallery readiness/nav/sitemap/live rendering.

**Exit gate:** all visible project content/media is approved, cabinet-relevant, CMS-backed and live accepted. This package may close the standing Store Phase 2.1 Gallery blocker.


**GC-5 production closeout — 2026-08-30:** 20 source project groups and 83 project images are imported into controlled Oakwell CMS/Storage. 13 curated projects are published (4 Residential + 9 Commercial). The remaining 7 Residential groups / 45 linked assets are intentionally retained as draft/mixed with explicit review notes because they are primarily countertop, fireplace, outdoor, shower or material-focused rather than cabinet-project focused.

## GC-6 — Cabinet content / customer journey

Goal: publish real Oakwell cabinet knowledge without parent marketing noise.

- `[x]` adapt process as typed CMS content;
- `[x]` create Oakwell cabinetry FAQ in managed data;
**GC-6 production closeout — 2026-08-30:** production live acceptance is complete. `/cabinet-process` returns HTTP 200 with 4 source-adapted cabinet-planning steps, 6 original Oakwell cabinetry FAQs, `Start a Project Consultation` → `/contact`, FAQPage structured data and sitemap inclusion. Anonymous direct reads remain denied and provenance stays outside the public projection. Source discounts, SLAs, guarantees and installation promises remain omitted.

- `[x]` add approved consultation CTA content;
- `[x]` decide Home Office/accessory scope separately — remains hold / outside initial Oakwell scope;
- `[x]` omit unsupported guarantees/discounts/SLAs.

**Exit gate:** normal content editing is Admin-managed and copy accurately describes Oakwell.

## GC-7 — Reviews / social proof

Goal: add trust signals with correct source identity.

- `[x]` implement/manage review/testimonial domain;
- `[x]` import only approved source-linked excerpts/data;
- `[x]` enforce parent attribution;
- `[x]` avoid third-party broken widgets;
- `[x]` verify a parent review cannot render as Oakwell-specific by mistake.

**GC-7 production closeout — 2026-08-30:** PR #167 / commit `74013f90561e023b0453aea57cd010456de2c597` is production-accepted. Live homepage verification confirmed two Granite & Cabinet Center excerpts with source identity/HTTPS citation/visible parent attribution and no inferred rating; anon direct testimonial-table read remains denied.

**Exit gate:** `[x]` every visible review has valid identity/source/attribution and can be managed from Admin.

## GC-8 — Navigation, footer, SEO, accessibility & performance QA

### GC-8A — Managed Store chrome + technical SEO

Status: `[x]` production-accepted on 2026-08-30 after PR #169 merge/deploy and live verification.

- `[x]` add typed `store_chrome_items` with code-owned placement/destination allowlists, Admin-only direct access and narrow published-only public RPC;
- `[x]` preserve current public chrome as exactly 11 approved rows: 6 primary + 2 Footer Products + 3 Footer Company;
- `[x]` prove draft-first rollout: 11 draft / 0 public before controlled publication, anon direct table read denied, anon RPC execution allowed;
- `[x]` publish and verify the exact 11-row ordered projection;
- `[x]` make Navbar/Footer consume published data while keeping Account/Contact code-owned and preserving `/account` + `/dealer` portal shell behavior;
- `[x]` add Store-only Admin editing inside existing `/store/content` with the same eight destination keys and no arbitrary href input;
- `[x]` fix managed SEO-title duplication using absolute managed titles;
- `[x]` model Oakwell as the public Organization/Brand and Granite & Cabinet Center as `parentOrganization` when the legal parent differs;
- `[x]` audit canonical/robots/sitemap readiness and reject Granite runtime backend/media hotlinks;
- `[x]` Store/Admin contracts, RBAC, scoped lint and production builds verified; final conflict-safe branch is based on latest `main` with no A1 business files or `ADMIN_ROADMAP.md` changes;
- `[x]` post-merge live acceptance: production deployment matches merge commit `d41f7c19ce81016b6a1a05166d0a4089104bfe52`; nav/footer ordering, `/account` + `/dealer` coexistence, Oakwell Organization/Brand JSON-LD with Granite parent attribution, managed-title de-duplication, canonical/robots/sitemap behavior and Granite runtime-backend/media independence are verified live.

**GC-8A exit gate:** `[x]` code/data/CI, merge/deploy and live production acceptance are complete. Acceptance record: `docs/granite-center/GC8A_PRODUCTION_ACCEPTANCE.md`.

### GC-8B — Accessibility + performance acceptance

- `[ ]` alt-text/accessibility audit;
- `[ ]` keyboard/mobile/lightbox/form QA;
- `[ ]` Lighthouse/Core Web Vitals baseline vs post-migration;
- `[ ]` LCP/CLS media verification;
- `[ ]` final sitemap/indexing verification;
- `[ ]` final lint/build/smoke/live checks after tuning.

**GC-8 exit gate:** migration is production-verified; mutable business content is managed through Admin/Supabase and Store contains behavior/layout rather than production content constants.

---

# 9. Current Scope Decisions from GC-0

## Include / active migration scope

- canonical company identity/contact as controlled data;
- parent-brand relationship with accurate attribution;
- About adaptation;
- Contact enhancement;
- Showroom content;
- cabinet/project consultation concepts;
- curated showroom + kitchen/cabinet/vanity media;
- optimized managed media library;
- real Gallery/Projects seed content;
- cabinet-specific FAQ;
- selected attributed social proof;
- dynamic navigation/footer where business-editable;
- SEO/structured-data normalization from controlled sources.

## Hold / exclude until separately approved

- broad commercial portfolio;
- Home Office / built-ins as a promised Oakwell scope;
- sinks/faucets/accessories catalog;
- quartz/granite/countertop services;
- countertop repair/service fee schedule;
- volatile deals/discounts/prices/turnaround promises;
- customer contact file upload;
- payment link;
- Careers;
- Garden content.

---

# 10. Next Action

1. Execute **GC-8B — accessibility/mobile/keyboard + Lighthouse/Core Web Vitals baseline/tuning** from latest `main`.
2. Close overall GC-8 only after accessibility, performance, indexing and final production verification pass.
3. Preserve the permanent architecture boundary: Granite Center remains provenance/migration evidence only, never a runtime content or media backend.
