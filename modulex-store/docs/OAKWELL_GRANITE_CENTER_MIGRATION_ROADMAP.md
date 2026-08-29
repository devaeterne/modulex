# Oakwell Cabinetry — Granite & Cabinet Center Content / Media Migration Roadmap

Last reviewed: 2026-08-29
Status: **APPROVED — execute sequentially via reviewed PRs**
Primary source: https://granitecenterva.com/
Target: `devaeterne/modulex` → `modulex-store` + controlled CMS in `modulex-admin`

> Purpose: identify which verified Granite & Cabinet Center business data, media, social proof, forms, showroom information, and cabinet-related content should be adapted into Oakwell Cabinetry without cloning the parent website or importing stale/irrelevant WordPress content.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Verified complete
- `[!]` Blocked / business decision required
- `[?]` Needs approval or source-of-truth confirmation

---

# 0. Guiding Decisions

## 0.1 Brand relationship

- Oakwell Cabinetry will be treated as a sub-brand of Granite & Cabinet Center.
- Parent-company identity may be used to establish location, showroom, operating history, project proof, and support capabilities only where attribution is accurate.
- Suggested public relationship wording to approve before launch:
  - `Oakwell Cabinetry — a Granite & Cabinet Center brand`
  - or `Oakwell Cabinetry by Granite & Cabinet Center`
- Do not present parent-company reviews, projects, licenses, guarantees, offers, or service claims as Oakwell-specific unless the business approves that attribution.

## 0.2 Architecture principle

- Do **not** clone Granite Center's WordPress structure, page markup, embedded forms, duplicated sections, plugins, or broken widgets.
- Reuse verified data and owned media inside Oakwell's existing Next.js + Supabase CMS architecture.
- Keep `modulex-admin` as CMS/control plane and `modulex-store` as public delivery surface.
- Reuse existing Oakwell About, Contact, Gallery/Projects, Lead API, analytics, media and CMS foundations before creating new systems.

---

# 1. Granite Center Source Audit

## 1.1 Canonical business information discovered

### Address variants found

1. `22446 DAVIS DR #109-127 STERLING, VA 20164` — repeated header/footer form.
2. `22446 Davis Dr #109, Sterling, VA 20164` — Contact / cabinet CTA form.
3. `22446 Davis Dr Ste 109, Sterling, VA 20164` — Showroom / Career form.

`[?]` **Decision required:** choose one canonical Oakwell public address representation.

Recommended canonical display if legally/operationally correct:

`22446 Davis Dr, Suite 109, Sterling, VA 20164`

Do not publish the recommendation until business confirms whether `#109-127` represents multiple suites that must remain visible.

### Phone variants found

- Header/navigation: `703-956-9470`
- Contact page: `703-439-1040`
- Fax: `(703) 956-9649`

`[!]` **Decision required:** choose Oakwell's primary public phone number before migration.

### Hours found

- Monday–Friday: `8:00 AM – 6:00 PM`
- Saturday: `8:00 AM – 6:00 PM`
- Showroom page summarizes: `Mon–Sat 8am–6pm`

`[?]` Confirm Sunday status / closed wording before publishing structured hours.

### Service region found

- Virginia
- Maryland
- Washington, D.C.
- Greater Washington DC / surrounding areas

`[?]` Confirm whether Oakwell serves the same territory, especially dealer vs direct-customer coverage.

### Parent-company history / positioning found

- “Since 2011” / “Trusted by Thousands” appears repeatedly.
- Family-owned wording appears on the homepage.
- Parent business positions itself around kitchen/bath remodeling, cabinetry, countertops, fabrication, installation, showroom sales and design support.

`[?]` If used on Oakwell, wording must clearly attribute history to Granite & Cabinet Center unless Oakwell independently existed during the claimed period.

---

# 2. Page-by-Page Migration Matrix

| Granite Center surface | Oakwell action | Priority | Notes |
|---|---|---:|---|
| Header contact/address | **Transfer after canonical confirmation** | P0 | One phone/address source of truth only. |
| About Us | **Adapt, do not copy verbatim** | P0 | Use parent-company relationship, showroom, design/support capabilities; remove countertop-heavy copy unless cross-brand context is intentional. |
| Contact | **Transfer data + redesign around native Oakwell form** | P0 | Phone, address, hours, showroom/warehouse context, map/directions CTA. |
| Wufoo estimate form | **Rebuild natively** | P0 | Do not embed Wufoo. Map useful fields to Oakwell lead system. |
| Showroom | **Create Oakwell showroom section/page** | P0/P1 | Strong asset source; use Oakwell/parent relationship clearly. |
| Residential Projects | **Selective media import** | P0/P1 | Import cabinet/kitchen/vanity-relevant projects; avoid countertop-only dump. |
| Commercial Projects | **Selective import after relevance review** | P1 | Only projects that accurately demonstrate cabinetry/woodwork/Oakwell-relevant capabilities. |
| Kitchen Cabinet Sale / Cabinet pages | **Mine structure/process, rewrite for Oakwell** | P0/P1 | Design consultation, workflow, showroom CTA, service area, cabinet construction themes if true. |
| Testimonials / Google review content | **Conditional, attributed social proof** | P1 | Parent-brand attribution required unless review explicitly names Oakwell. |
| FAQ | **Do not transfer granite FAQ text** | P1 | Keep FAQ UI concept; author Oakwell cabinetry FAQ. |
| Accessories: sinks/faucets/grids | **Optional / catalog decision** | P2 | Only if Oakwell will actually sell/support these SKUs. |
| Home Office | **Potential Oakwell expansion** | P2 | Relevant to cabinetry; useful if Oakwell product offering supports office/storage cabinetry. |
| Garden | **Hold** | P2 | Requires product relevance validation. |
| Granite / Quartz pages | **Do not migrate into core Oakwell** | Exclude | Parent brand content unless intentional cross-sell section is approved. |
| Countertop Services & Fees | **Do not migrate** | Exclude | Parent-company service/repair pricing. |
| Remodeling sale/deals | **Do not migrate by default** | Exclude | Pricing/promotional claims are volatile and outside Oakwell core. |
| PAY / CardPointe | **Do not migrate by default** | Exclude | Parent-company payment flow; requires finance approval if ever linked. |
| Career | **Optional future** | P2 | Only create Oakwell Careers if recruiting under Oakwell identity. |
| WordPress plugins/widgets | **Never migrate** | Exclude | Includes broken Trustindex rendering, Contact Form 7 shortcode, duplicated plugin blocks. |

---

# 3. Content Recommended for Oakwell

## 3.1 About page

Target outcome: Oakwell gains real-world credibility without becoming a copy of Granite Center.

Recommended sections:

- Oakwell Cabinetry brand statement.
- Clear relationship to Granite & Cabinet Center.
- Physical showroom / warehouse presence in Sterling, Virginia.
- Cabinet-focused design and product support.
- Parent-team experience only with correct attribution.
- Service area: VA / MD / Washington D.C. if confirmed.
- Design consultation CTA.
- Product Catalog CTA.
- Dealer Program CTA where appropriate.
- Showroom imagery sourced from Granite Center and optimized for Oakwell.

Avoid copying:

- long countertop/fabrication descriptions;
- “one stop shop” product categories Oakwell does not sell;
- unverified guarantees, discount percentages, turnaround times, inventory size;
- duplicated parent-site SEO paragraphs.

## 3.2 Contact page

Recommended information block:

- Primary Oakwell phone.
- Oakwell/public email.
- Showroom address.
- Business hours.
- `Get Directions` action.
- Relationship label such as `Oakwell showroom at Granite & Cabinet Center` if approved.
- General inquiry / project consultation form.
- Dealer application remains a separate flow.

Recommended form fields for **customer/project inquiry**:

- Project type:
  - Kitchen Cabinetry
  - Bathroom Vanity / Cabinetry
  - Home Office / Built-in Storage (if approved)
  - Dealer / Trade Inquiry → route to Dealer Application instead of mixing forms
  - Other Cabinetry Inquiry
- Request a showroom consultation: yes/no.
- First name.
- Last name.
- Phone.
- Email.
- Project address or ZIP/city (scope decision).
- Desired consultation / estimate date (optional).
- Project notes.
- Upload existing drawing / measurements / inspiration / estimate.
- Privacy consent.
- Optional marketing consent.
- UTM/source/referrer tracking.
- Spam protection.

Current Oakwell lead infrastructure already covers name/email/phone/message/privacy/marketing/UTM and has supporting-document infrastructure for dealer applications. Customer file upload can be extended deliberately rather than inheriting Wufoo.

## 3.3 Showroom

Recommended either:

- `/showroom` dedicated route, or
- a substantial Showroom section on `/about` and `/contact` with a single canonical data source.

Content:

- showroom/warehouse address;
- hours;
- map/directions CTA;
- appointment CTA;
- selected showroom photographs;
- short “what you can see here” list that is Oakwell-specific;
- parent-brand disclosure.

Potential later enhancement:

- optimized 360° showroom / virtual tour if source panorama quality is suitable.

## 3.4 Gallery / Projects

Use Oakwell's existing `store_projects` + `store_project_media` CMS instead of a static image dump.

Recommended project taxonomy:

- Residential Kitchen
- Bathroom / Vanity
- Home Office / Built-in
- Commercial
- Showroom / Display

For every imported project:

- title;
- category;
- location when public/appropriate;
- summary;
- cover image;
- gallery images;
- alt text;
- source URL;
- original parent-site label;
- attribution status;
- cabinet relevance flag;
- sort order;
- publication approval.

Residential source contains useful categories such as `KITCHEN`, `KITCHEN CABINET GRANITE COUNTERTOP`, `BATHROOM VANITY`, but also a very large number of countertop-only assets. Cabinet relevance must be reviewed manually before publication.

Commercial candidates discovered include Alba Osteria, Cafe Cantina Harbour, L'Hommage, National Airport Grill, Ottoman Taverna, Planet Fitness, Greene Turtle locations and The Wharf. Do not publish them as Oakwell cabinetry projects until the scope represented in each image is confirmed.

## 3.5 Cabinet design process

Granite Center has a useful customer journey that can be adapted to Oakwell if operationally accurate:

1. Project / Pre-Design Intake
2. Preliminary Design & Selection
3. 3D Design / Revision / Finalization
4. Ordering / Fulfillment
5. Installation / Coordination where offered

Do not inherit specific claims such as “3D design within 24 business hours”, “2–4 weeks”, “100% satisfaction guarantee”, “50% off” or “licensed, bonded & insured” into Oakwell copy without explicit approval and evidence.

## 3.6 FAQ

Granite Center FAQ is mainly natural-stone education and should not be copied.

Create Oakwell-specific FAQ covering approved topics such as:

- cabinet construction;
- stock / semi-custom / custom positioning if applicable;
- door styles and finishes;
- color/sample variation;
- measurements and drawings;
- design consultation;
- lead times;
- order process;
- delivery / pickup;
- installation responsibility;
- care and cleaning;
- warranty;
- replacement parts / damage reporting;
- dealer vs retail/customer purchasing;
- showroom visits.

## 3.7 Reviews / testimonials

Granite Center has testimonials and Google-origin review content.

Migration rule:

- If a review refers specifically to Granite Center, label it as parent-company social proof, e.g. `Customer review for Granite & Cabinet Center`.
- Do not silently relabel a Granite Center review as an Oakwell review.
- Prefer live/review-platform links or curated approved excerpts with attribution rather than copying a third-party widget.
- Avoid reproducing the broken Trustindex implementation.

---

# 4. Media Migration & Optimization Roadmap

## 4.1 Source inventory

`[ ]` Crawl approved Granite Center pages and create a media manifest.

Required manifest fields:

- source page URL;
- source media URL;
- source filename;
- original format;
- original width / height;
- original bytes;
- SHA-256 hash;
- optional perceptual hash for near-duplicate detection;
- category: showroom / residential kitchen / vanity / commercial / product / accessory / marketing;
- suggested Oakwell route/section;
- cabinet relevance: yes / maybe / no;
- copyright/ownership approval status;
- approved for public use: yes/no;
- optimized asset URL;
- alt text;
- migration notes.

Representative source URLs already exposed by the parent site include:

- `/wp-content/uploads/2024/05/h1-scaled.jpg`
- `/wp-content/uploads/2024/05/h4-scaled.jpg`
- `/wp-content/uploads/2024/05/h8-scaled.jpg`
- `/wp-content/uploads/2016/11/Kitchen-1.jpeg`
- `/wp-content/uploads/2016/11/Kitchen-Cabinet-Granite-Countertop-1.jpg`

## 4.2 Deduplication

`[ ]` Identify exact duplicates by SHA-256.

`[ ]` Identify visually equivalent assets by perceptual hash / dimension comparison.

`[ ]` Keep one canonical optimized master per photograph.

`[ ]` Preserve original source URL in migration metadata for traceability.

## 4.3 Master image preparation

Do not upscale low-resolution source files.

Suggested working masters:

- Hero/showroom wide: max long edge around `1920–2560px` depending source quality.
- Standard gallery/project: max long edge around `1600–1920px`.
- Card/list thumbnails: generated responsively; do not maintain hand-made duplicate files unless needed.
- 360 panorama: separate policy; preserve enough resolution for the viewer while controlling initial payload.

`[ ]` Correct orientation.

`[ ]` Strip unnecessary EXIF/GPS metadata.

`[ ]` Preserve color appearance consistently.

`[ ]` Generate descriptive, stable filenames rather than WordPress names such as `h1-scaled.jpg`.

Example:

`showroom-sterling-cabinet-display-01.webp`

## 4.4 Delivery formats

Oakwell's Next.js config already enables AVIF + WebP and allows Supabase public storage images.

Preferred strategy:

1. Ingest a reasonably optimized high-quality source/master.
2. Use `next/image` for route delivery and responsive derivatives.
3. Permit AVIF/WebP negotiation.
4. Use explicit `sizes` rules per component.
5. Use `priority` / preload only for the true LCP hero.
6. Lazy-load below-the-fold gallery assets.

Suggested initial quality targets to benchmark, not hard business rules:

- WebP: approximately 72–82 quality.
- AVIF: approximately 50–65 quality.
- Hero payload target: ideally `<= 250 KB` at common desktop viewport when visually acceptable.
- Gallery card target: ideally `<= 120–160 KB` at its rendered breakpoint.
- Small thumbnail target: ideally `<= 60–90 KB`.

Quality must be validated visually; photographic cabinetry details and wood-grain banding matter more than hitting an arbitrary byte target.

## 4.5 Image UX / performance

`[ ]` Use intrinsic width/height or aspect-ratio to prevent CLS.

`[ ]` Define mobile/tablet/desktop `sizes`.

`[ ]` Use meaningful alt text, not filenames.

`[ ]` Keep decorative imagery with empty alt where appropriate.

`[ ]` Use blur/low-quality placeholders only where they improve perceived loading without bloating HTML.

`[ ]` Avoid loading full gallery images in card grids.

`[ ]` Cache immutable fingerprinted media aggressively.

`[ ]` Verify LCP / CLS / INP after rollout.

---

# 5. Data / CMS Changes

## 5.1 Company profile

Current Oakwell pages already read company identity/contact information from a canonical public company profile.

`[ ]` Populate confirmed Oakwell/parent business contact fields through the existing controlled source.

`[?]` Determine whether business hours belong in company profile or site settings.

`[?]` Determine whether `parent organization / brand relationship` needs a structured CMS field rather than hard-coded copy.

## 5.2 Pages CMS

Existing `store_pages` is suitable for About-level content, hero image, CTA and SEO metadata.

Possible extension if richer content is approved:

- structured About sections;
- showroom block;
- business-hours block;
- parent-brand relationship copy;
- map/directions URL;
- review/social-proof configuration.

Avoid turning the first version into an unrestricted drag-and-drop page builder.

## 5.3 Projects CMS

Existing tables are a good fit:

- `store_projects`
- `store_project_media`

`[ ]` Import approved Granite Center project media as draft projects.

`[ ]` Human-review each draft.

`[ ]` Publish only after category, title, attribution, alt text and cabinet relevance are confirmed.

## 5.4 Media library

`[ ]` Use the existing Admin/Supabase media flow as the controlled destination where practical.

`[ ]` Add migration metadata/source notes if current media records do not preserve provenance.

`[?]` Decide whether automated conversion occurs:

- during migration only;
- at Admin upload time;
- through an image-processing backend;
- or primarily through Next.js runtime optimization.

Recommended first step: migration-time optimization + Next.js responsive delivery. Add upload-time processing later if the ongoing editorial workflow needs it.

---

# 6. Form Migration

## 6.1 Source behavior

Granite Center uses an embedded Wufoo estimate form. Useful source concepts include project type, consultation request, identity/contact details, address, desired estimate date, notes and drawing/estimate upload.

## 6.2 Oakwell implementation

`[ ]` Keep Oakwell native `/api/leads` submission path.

`[ ]` Extend `LeadForm(type="contact")` with approved project-specific fields.

`[ ]` Decide whether customer contact leads may upload files; dealer application upload infrastructure already exists but must remain correctly scoped.

`[ ]` Store uploaded customer project files privately.

`[ ]` Add server-side file type/size validation.

`[ ]` Keep honeypot / spam protection and add stronger bot controls if production traffic requires them.

`[ ]` Preserve UTM campaign, landing page and referrer attribution.

`[ ]` Add event tracking for showroom consultation intent and project type.

`[ ]` Add confirmation/reference behavior.

`[ ]` Ensure privacy policy explicitly covers project documents and contact submissions.

---

# 7. SEO / Local Business / Trust

`[ ]` Use a single canonical phone/address/hours data source across Navbar, Footer, About, Contact, Showroom, metadata and structured data.

`[ ]` Add or update Organization/LocalBusiness structured data after brand relationship is approved.

`[ ]` Consider `brand` / `parentOrganization` relationship in JSON-LD where semantically correct.

`[ ]` Do not create contradictory local-business identities for the same physical showroom.

`[ ]` Add map/directions action using the canonical showroom location.

`[ ]` Write Oakwell-specific SEO copy; do not duplicate parent site's paragraphs verbatim.

`[ ]` Use project/gallery locations only when public and appropriate.

`[ ]` Add descriptive image alt text.

`[ ]` Add canonical metadata to any new `/showroom` route.

`[ ]` Rebuild FAQ with cabinet-specific content before emitting FAQ structured data.

---

# 8. Parent-Site Issues We Must NOT Propagate

The Granite Center site contains useful source data but also inconsistencies / legacy artifacts.

- `[!]` Two visible phone numbers (`703-956-9470` and `703-439-1040`).
- `[!]` Multiple address formats (`#109-127`, `#109`, `Ste 109`).
- Repeated sections and duplicated page copy.
- Broken Trustindex widget messages on indexed content.
- Raw `[contact-form-7 id="545"]` shortcode visible on Showroom.
- Third-party Wufoo iframe dependency.
- Stale or volatile sale claims (`50%`, fixed package prices, turnaround times).
- Conflicting/volatile inventory/assortment claims (`11 brands`, large color counts, etc.).
- Parent-brand payment link in public navigation.
- Granite-focused FAQ not relevant to Oakwell cabinetry.
- Typographic/content errors such as quartz sections referencing granite.
- Numerous legacy WordPress image filenames and likely duplicate assets.

Oakwell migration should be a content normalization project, not a mirror project.

---

# 9. Proposed Execution Phases

## GC-0 — Business truth lock

Goal: establish immutable source-of-truth fields before any public migration.

- `[?]` Confirm canonical Oakwell phone.
- `[?]` Confirm canonical showroom address / suite format.
- `[?]` Confirm hours, including Sunday.
- `[?]` Confirm Oakwell's approved service region.
- `[?]` Confirm public wording for Oakwell ↔ Granite & Cabinet Center relationship.
- `[?]` Confirm whether parent-company `Since 2011` history can be used with attribution.
- `[?]` Confirm whether parent reviews/projects may be displayed with parent attribution.

**Exit gate:** approved business truth sheet exists.

## GC-1 — Source crawl & content/media manifest

Goal: create a complete migration inventory before touching public CMS.

- `[ ]` Crawl parent-site pages from primary navigation and cabinet-relevant landing pages.
- `[ ]` Record page-level migration decision: migrate / adapt / optional / exclude.
- `[ ]` Extract source media URLs and media metadata.
- `[ ]` Hash and deduplicate images.
- `[ ]` Mark cabinet relevance.
- `[ ]` Mark proposed Oakwell placement.
- `[ ]` Mark ownership/attribution status.

**Exit gate:** every candidate asset/content block has a disposition.

## GC-2 — Media optimization pipeline

Goal: produce reusable optimized Oakwell masters without visual degradation.

- `[ ]` Download approved originals.
- `[ ]` Normalize orientation and metadata.
- `[ ]` Resize oversized originals conservatively.
- `[ ]` Generate optimized source assets.
- `[ ]` Upload to controlled Oakwell media storage.
- `[ ]` Validate AVIF/WebP delivery via `next/image`.
- `[ ]` Produce before/after size report.
- `[ ]` Verify no duplicate images were uploaded under multiple names.

**Exit gate:** approved optimized media library is ready, with traceable sources.

## GC-3 — Company identity, About & Showroom

Goal: make Oakwell's real-world business identity explicit and credible.

- `[ ]` Populate canonical company profile.
- `[ ]` Publish adapted About copy.
- `[ ]` Add parent-brand relationship text.
- `[ ]` Add showroom block or `/showroom` route.
- `[ ]` Add hours and directions.
- `[ ]` Add optimized showroom photography.
- `[ ]` Review Navbar/Footer contact presentation.

**Exit gate:** phone/address/hours are consistent across every public surface.

## GC-4 — Contact / Project Consultation Form

Goal: replace generic contact and parent Wufoo behavior with first-party Oakwell lead capture.

- `[ ]` Finalize customer form schema.
- `[ ]` Add project type and showroom consultation intent.
- `[ ]` Add optional project date/location fields if approved.
- `[ ]` Add private drawing/estimate upload if approved.
- `[ ]` Extend database/API schema as needed.
- `[ ]` Extend Admin lead visibility if new fields are introduced.
- `[ ]` Test validation, spam protection, tracking, file privacy and confirmation.

**Exit gate:** no Wufoo dependency; end-to-end lead appears correctly in Admin/operations flow.

## GC-5 — Projects / Gallery migration

Goal: turn the parent project's visual archive into a curated Oakwell portfolio.

- `[ ]` Import approved residential cabinet-related projects as drafts.
- `[ ]` Import selected commercial candidates as drafts.
- `[ ]` Add titles, categories, locations, summaries and alt text.
- `[ ]` Add parent-project attribution where needed.
- `[ ]` Publish curated set.
- `[ ]` Add gallery/project navigation only when enough content is live.

**Exit gate:** all visible project imagery is approved, cabinet-relevant and CMS-backed.

## GC-6 — Cabinet content / customer journey

Goal: reuse useful cabinet-business knowledge without inheriting parent marketing noise.

- `[ ]` Adapt design process.
- `[ ]` Build Oakwell cabinet FAQ.
- `[ ]` Add consultation CTA placements.
- `[ ]` Add showroom/service-area support copy.
- `[ ]` Decide Home Office / built-in scope.
- `[ ]` Decide accessories scope.
- `[ ]` Explicitly omit unsupported guarantees/discounts/turnaround claims.

**Exit gate:** content accurately describes how Oakwell actually sells/supports cabinetry.

## GC-7 — Reviews / social proof

Goal: add trust signals with accurate attribution.

- `[ ]` Choose approved parent reviews/testimonials.
- `[ ]` Add parent-company attribution.
- `[ ]` Link external review profiles where useful.
- `[ ]` Avoid broken third-party widgets.
- `[ ]` Confirm legal/marketing approval for excerpts.

**Exit gate:** no review can be mistaken for an Oakwell-specific review unless it actually is one.

## GC-8 — SEO, accessibility & performance QA

- `[ ]` Metadata/canonical audit.
- `[ ]` Organization/LocalBusiness structured-data audit.
- `[ ]` Alt-text audit.
- `[ ]` Keyboard/lightbox/form accessibility.
- `[ ]` Mobile responsive QA.
- `[ ]` Lighthouse / Core Web Vitals baseline vs post-migration.
- `[ ]` LCP hero verification.
- `[ ]` No oversized source image rendered directly.
- `[ ]` No duplicate or dead media URLs.
- `[ ]` Sitemap/indexing verification.
- `[ ]` Smoke/build/lint production checks.

**Exit gate:** migration is production-verified and does not regress Store performance or content-truth contracts.

---

# 10. Items Explicitly Waiting for Business Review

Before implementation, approve/edit this list:

1. Oakwell primary phone: `703-956-9470` vs `703-439-1040` vs a separate Oakwell number.
2. Canonical address: `#109`, `Suite 109`, or `#109-127`.
3. Fax: show publicly or omit.
4. Hours and Sunday status.
5. Brand relationship wording.
6. Whether to use `Since 2011` with parent attribution.
7. Whether to show Granite Center reviews on Oakwell with attribution.
8. Whether residential/commercial parent projects may be presented as parent-company portfolio/supporting experience.
9. Whether Oakwell provides installation or only product/dealer fulfillment.
10. Whether Oakwell offers free design consultation / 3D design and what SLA may be stated.
11. Whether Home Office / Built-in cabinetry belongs in Oakwell scope.
12. Whether sinks/faucets/accessories belong in Oakwell catalog.
13. Whether customer leads can upload drawings/measurements/files.
14. Whether `/showroom` should be a standalone route or a shared About/Contact block.
15. Whether to expose a link back to Granite & Cabinet Center from Oakwell footer/About.
16. Whether commercial projects should be included at launch.
17. Whether Careers should exist on Oakwell at all.
18. Whether any payment link should exist on Oakwell.

---

# 11. Recommended Initial Scope

For the first implementation package, keep the work focused:

### Include

- canonical address / phone / hours;
- parent-brand relationship;
- About rewrite;
- Contact enhancement;
- native project consultation form;
- Showroom content;
- curated showroom + kitchen/cabinet/vanity images;
- image optimization/dedup pipeline;
- Gallery/Projects seed content;
- cabinet-specific FAQ;
- selected attributed social proof;
- local/organization structured data and SEO normalization.

### Hold for later

- third-party cabinet brand pages;
- quartz/granite pages;
- countertop service/fee schedule;
- volatile deals/discounts/prices;
- payment link;
- Careers;
- accessory catalog unless explicitly approved;
- Garden content;
- broad commercial portfolio until project scope is confirmed.

---

# 12. Next Action

This roadmap is approved as the dedicated Granite Center → Oakwell migration workstream. Execute it sequentially, with each material package delivered and verified through its own PR.

1. Merge this roadmap into the repository.
2. Reference this workstream from `modulex-store/STORE_ROADMAP.md` during the next Store roadmap synchronization.
3. Begin `GC-0 — Business truth lock` as the first execution PR.
4. Do not begin public content/media migration until the GC-0 business truth fields required by the affected package are resolved.
5. After GC-0, execute `GC-1 — Source crawl & content/media manifest` before changing public content.
