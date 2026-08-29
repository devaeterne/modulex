# Oakwell Cabinetry — Granite & Cabinet Center Content / Media Migration Roadmap

Last reviewed: 2026-08-29
Status: **APPROVED — execute sequentially via reviewed PRs**
Primary source: https://granitecenterva.com/
Target: `devaeterne/modulex` → `modulex-store` + controlled CMS in `modulex-admin`

Architecture design: `modulex-store/docs/superpowers/specs/2026-08-29-oakwell-dynamic-content-cms-design.md`
GC-0 truth/ownership lock: `modulex-store/docs/GC0_BUSINESS_TRUTH_LOCK.md`
GC-1 implementation plan: `modulex-store/docs/superpowers/plans/2026-08-29-gc1-source-content-media-manifest.md`
GC-2 implementation plan: `modulex-store/docs/superpowers/plans/2026-08-29-gc2-media-library-optimization-implementation.md`
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

**Package status**

- `[x]` **GC-2A — schema/security foundation:** reusable asset/provenance tables and private staging boundary are production-verified.
- `[x]` **GC-2B — importer/optimizer capability:** bounded Granite acquisition, verified metadata/hash, no-upscale WebP optimization, private staging writer/idempotency, rollback, credential gate, reporting and `--publish` prohibition are verified. A real `media-showroom-01` dry-run succeeded in Actions `33260112614` with zero production DB/Storage writes.
- `[x]` **GC-2C — Admin Media Library:** `/store/media`, `store.manage` RBAC, metadata/provenance review, private signed staging previews, and controlled server-side publish/unpublish/delete lifecycle are verified; production intake remains zero and deferred to GC-2D.
- `[~]` **GC-2D — controlled production intake:** the Admin/Vercel Node intake path remains the approved boundary and keeps the logged-in Admin JWT + existing RLS, private staging, publish prohibition, and pinned `sharp@0.35.4` pipeline. The first live request failed before auth/RLS or DB/Storage mutation because the Turbopack function omitted Sharp/libvips runtime files (`libvips-cpp.so.8.18.6`); the verified runtime fix builds Admin with Webpack for correct tracing. Merge/deploy/retry and actual production import/review/publish/dedupe/unpublish-republish acceptance remain pending.

- `[x]` design/implement reusable media asset domain and Admin management required by migration;
- `[ ]` download approved originals;
- `[ ]` verify metadata and SHA-256 dedupe;
- `[ ]` optional perceptual dedupe where useful;
- `[ ]` strip unnecessary EXIF/GPS;
- `[ ]` resize/encode conservatively without upscaling;
- `[ ]` upload to controlled Supabase Storage;
- `[ ]` register provenance/attribution/review status;
- `[ ]` verify responsive AVIF/WebP delivery;
- `[ ]` verify import idempotency/no duplicate uploads.

**Exit gate:** approved media library exists in controlled Storage/CMS with Admin management and traceable source metadata.

## GC-3 — Company identity, contact, About & Showroom

Goal: make real-world Oakwell identity/location content fully data-driven.

- `[ ]` extend company profile with structured contact/location/hours domains only as required;
- `[ ]` backfill current approved values without code constants;
- `[ ]` expose Admin controls;
- `[ ]` extend narrow public profile projections;
- `[ ]` publish adapted About content;
- `[ ]` add Showroom page/section and controlled media;
- `[ ]` add confirmed hours/directions only when business-approved;
- `[ ]` make relevant public surfaces consume the controlled source.

**Exit gate:** ordinary contact/location/showroom content changes require no Store code deployment, and public surfaces/structured data do not contradict one another.

## GC-4 — Contact / Project Consultation

Goal: replace parent form behavior with configurable first-party Oakwell lead capture.

- `[ ]` define approved business-configurable form options;
- `[ ]` extend DB/API only for approved new fields;
- `[ ]` add Admin management/visibility where needed;
- `[ ]` keep validation/security behavior code-owned;
- `[ ]` verify spam/privacy/attribution flow;
- `[ ]` keep customer file upload deferred unless a new explicit decision approves it.

**Exit gate:** no Wufoo dependency; configured lead appears correctly in Admin and no mutable business options require Store source edits.

## GC-5 — Projects / Gallery migration

Goal: seed real, curated, CMS-managed cabinet portfolio content.

- `[ ]` import approved cabinet-relevant candidates as drafts;
- `[ ]` attach controlled media assets;
- `[ ]` add provenance, title/category/location/summary/alt text;
- `[ ]` preserve parent attribution where required;
- `[ ]` review and publish curated set;
- `[ ]` verify Gallery readiness/nav/sitemap/live rendering.

**Exit gate:** all visible project content/media is approved, cabinet-relevant, CMS-backed and live accepted. This package may close the standing Store Phase 2.1 Gallery blocker.

## GC-6 — Cabinet content / customer journey

Goal: publish real Oakwell cabinet knowledge without parent marketing noise.

- `[ ]` adapt process as typed CMS content;
- `[ ]` create Oakwell cabinetry FAQ in managed data;
- `[ ]` add approved consultation CTA content;
- `[ ]` decide Home Office/accessory scope separately;
- `[ ]` omit unsupported guarantees/discounts/SLAs.

**Exit gate:** normal content editing is Admin-managed and copy accurately describes Oakwell.

## GC-7 — Reviews / social proof

Goal: add trust signals with correct source identity.

- `[ ]` implement/manage review/testimonial domain;
- `[ ]` import only approved source-linked excerpts/data;
- `[ ]` enforce parent attribution;
- `[ ]` avoid third-party broken widgets;
- `[ ]` verify a parent review cannot render as Oakwell-specific by mistake.

**Exit gate:** every visible review has valid identity/source/attribution and can be managed from Admin.

## GC-8 — Navigation, footer, SEO, accessibility & performance QA

- `[ ]` complete configurable navigation/footer under the dynamic-content rule;
- `[ ]` audit metadata/canonical/Organization/LocalBusiness structured data;
- `[ ]` hard-code audit for business literals and Granite hotlinks;
- `[ ]` alt-text/accessibility audit;
- `[ ]` keyboard/mobile/lightbox/form QA;
- `[ ]` Lighthouse/Core Web Vitals baseline vs post-migration;
- `[ ]` LCP/CLS media verification;
- `[ ]` sitemap/indexing verification;
- `[ ]` lint/build/smoke/live checks.

**Exit gate:** migration is production-verified; mutable business content is managed through Admin/Supabase and Store contains behavior/layout rather than production content constants.

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

GC-0 truth/data ownership is locked and GC-1 source discovery/classification is complete for review.

1. Review and merge the GC-1 manifest PR.
2. Start **GC-2 — Media library & optimization pipeline** from the latest `main`.
3. GC-2 must acquire source bytes, verify dimensions/bytes/MIME, compute SHA-256 hashes, review exact/near duplicates, strip unnecessary metadata, optimize without upscaling, upload approved assets to Oakwell-controlled Supabase Storage, and provide the Admin-managed reusable media domain required by later GC packages.
4. Do not publish source media directly from Granite Center URLs; source URLs remain provenance only.
5. Re-read current Store/Admin roadmaps before GC-2 implementation because parallel PRs may have merged.
