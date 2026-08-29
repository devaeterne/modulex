# GC-1 — Granite Center Source Content / Media Manifest

Last reviewed: 2026-08-29
Status: **COMPLETE FOR REVIEW — source discovery/classification only**
Source: `https://granitecenterva.com/`
Architecture: `modulex-admin → Supabase DB/Storage → controlled published/public projections → modulex-store`

## Purpose

GC-1 records what currently exists on Granite & Cabinet Center, how each source item is classified against GC-0, and which controlled Oakwell CMS domain would own it later. This is an intake manifest, **not** a publication/import package.

No source page, claim, project, review, phone, address, hour, form option or image becomes Oakwell public content merely because it appears here. Granite Center URLs are provenance only; approved production media must be acquired, verified, optimized and stored in Oakwell-controlled Supabase Storage in GC-2.

Machine-readable authority for this package: `docs/granite-center/gc1-source-manifest.json`.

## Audit summary

- Reviewed source pages: **32**
- Content candidates: **55**
- Media candidates: **62**
- Preserved conflict classes: **7**
- Page actions: `adapt` 4, `business_confirmation_required` 1, `exclude` 3, `hold` 22, `parent_attributed` 2
- Content actions: `adapt` 15, `business_confirmation_required` 10, `exclude` 10, `hold` 15, `parent_attributed` 5
- Media actions: `exclude` 5, `hold` 19, `parent_attributed` 38

Byte-level image metadata is deliberately unverified in GC-1: width, height, file bytes, MIME and SHA-256 remain `null` in the JSON manifest until GC-2.

## Source-page matrix

| Source URL | Surface | Status | Oakwell action | Target CMS domain | Attribution / key risks |
| --- | --- | --- | --- | --- | --- |
| `https://granitecenterva.com/` | home | reviewed | `adapt` | `store_pages` | Use only selective cabinet/showroom structure; volatile promotions, parent phones and unsupported claims do not migrate. |
| `https://granitecenterva.com/about-us/` | about | reviewed | `parent_attributed` | `store_pages` | Parent-company context may support Oakwell About only with correct attribution and rewrite. |
| `https://granitecenterva.com/about-us/showroom/` | showroom | reviewed | `adapt` | `store_pages` | Strong showroom/media source; hours remain unconfirmed for Oakwell and WordPress plugin artifacts are excluded. |
| `https://granitecenterva.com/contact-us/` | contact | reviewed | `business_confirmation_required` | `company_contact_channels` | Parent phone/address/fax/hours are evidence only and conflict with canonical Oakwell profile or lack Oakwell structured fields. |
| `https://granitecenterva.com/residential/` | projects_residential | reviewed | `parent_attributed` | `store_projects` | Selective cabinet/kitchen/vanity candidates only; countertop-only media excluded. |
| `https://granitecenterva.com/commercial/` | projects_commercial | reviewed | `hold` | `store_projects` | Project names/media inventoried but launch scope remains hold until cabinetry relevance and attribution are confirmed. |
| `https://granitecenterva.com/kitchen-cabinet-sale/` | cabinet_marketing | reviewed | `adapt` | `store_pages` | Process and construction concepts may be rewritten; discounts, free/SLA/guarantee claims are excluded or confirmation-required. |
| `https://granitecenterva.com/kitchen-cabinet-deals/` | cabinet_marketing | reviewed | `adapt` | `store_pages` | Cabinet-focused structure may inform Oakwell; promotional pricing/discounts are not migrated. |
| `https://granitecenterva.com/kitchen-bathroom-remodeling/` | remodeling | reviewed | `hold` | `store_pages` | Parent remodeling scope does not automatically become Oakwell service scope. |
| `https://granitecenterva.com/about-us/faq/` | faq | reviewed | `exclude` | `store_faq` | Source FAQ is stone/granite-focused; content excluded, but future Oakwell cabinetry FAQ remains a typed CMS need. |
| `https://granitecenterva.com/services/` | services | reviewed | `exclude` | `none` | Countertop repair/service fee content is outside Oakwell cabinetry core. |
| `https://granitecenterva.com/career/` | career | reviewed | `exclude` | `none` | Careers excluded from initial Oakwell migration. |
| `https://granitecenterva.com/custom-home-office/` | home_office | reviewed | `hold` | `store_pages` | Cabinetry-adjacent content, but Oakwell built-in/home-office scope is not yet confirmed. |
| `https://granitecenterva.com/garden/` | garden | reviewed | `hold` | `none` | Not part of initial Oakwell cabinetry scope. |
| `https://granitecenterva.com/faucets` | accessories | reviewed | `hold` | `none` | Real parent accessory catalog, but Oakwell accessory scope is not approved. |
| `https://granitecenterva.com/single-bowl-sinks/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/double-bowl-sinks/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/bar-sinks/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/handmade-sinks/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/apron-sinks/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/vanity-sinks-2/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/duragranit-sinks/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/grid/` | accessories | reviewed | `hold` | `none` | Accessory scope hold. |
| `https://granitecenterva.com/adelphi-kitchen-cabinets/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/timberlake-kitchen-cabinets/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/golden-homes-cabinets/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/crystal-cabinets/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/stonehill-cabinetry/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/jk-cabinetry/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/21st-century-cabinetry/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/vita-cabinetry/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |
| `https://granitecenterva.com/forevermark-cabinetry/` | cabinet_brand | reviewed | `hold` | `none` | Parent cabinet-brand context; reuse only if the brand is confirmed in approved Oakwell catalog scope. |

### Navigation item intentionally not converted into a guessed page URL

- `Ada Compliant Sinks` is visible in current parent navigation, but this audit did not resolve a stable Granite Center page URL. It is preserved as a `hold` navigation/content candidate in JSON instead of inventing a URL.
- `PAY` resolves to an external CardPointe flow. It is recorded as excluded navigation content rather than a Granite Center `pages[]` record.

## Business/content classification

The following are the main disposition groups. The JSON manifest contains one record per classified candidate with source page, reasons, attribution and target planning domain.

### Adapt / rewrite into dynamic Oakwell CMS

- **One stop shopping / broad remodeling assortment** → `store_pages` — Use only cabinet/showroom support concepts; do not copy broad parent assortment claims.
- **Showroom introduction** → `store_pages` — Physical showroom context can support Oakwell when location truth is sourced from controlled profile/location data.
- **Project estimate / consultation intake** → `store_form_configuration` — Adapt the consultation concept to Oakwell native lead flow without inheriting free/SLA promises.
- **Project type** → `store_form_configuration` — Configurable project type is a useful first-party lead field.
- **Showroom/design consultation intent** → `store_form_configuration` — Allow an operator-managed consultation-intent choice in the Oakwell native form.
- **Project address / city / ZIP** → `store_form_configuration` — Project-location context may be captured when operationally useful.
- **Desired consultation / estimate date** → `store_form_configuration` — Optional preference may be captured without promising appointment availability.
- **Project notes** → `store_form_configuration` — Project notes map naturally to the native Oakwell lead flow.
- **Pre-Design Meeting** → `store_pages` — Cabinet customer-journey step may be rewritten for Oakwell.
- **Preliminary Design Meeting** → `store_pages` — Cabinet customer-journey step may be rewritten for Oakwell.
- **3D Design Presentation, Modifications and Finalization** → `store_pages` — Process concept may be adapted; no 24-hour/free promise may be inherited.
- **FAQ content-domain concept** → `store_faq` — Retain the CMS/UX concept but author Oakwell-specific cabinetry questions later.
- **Primary navigation structure** → `store_navigation` — Useful destination concepts can inform Oakwell; displayed labels/order/visibility must be Admin-managed.
- **Footer contact/social/navigation structure** → `store_footer` — Structure can inform Oakwell while values come from canonical settings/CMS.
- **Cabinet design/showroom topic coverage** → `store_pages` — Use source topics as research only; Oakwell SEO copy must be original and CMS-managed.

### Parent-attributed candidates

- **Granite & Cabinet Center relationship** → `store_pages` — Parent-company relationship context may support transparent Oakwell brand attribution.
- **Since 2011** → `store_pages` — Parent-company history may only be used with clear parent attribution if later approved.
- **Kitchen projects** → `store_projects` — Cabinet-relevant parent residential kitchen work may be curated as parent portfolio.
- **Bathroom Vanity projects** → `store_projects` — Vanity/cabinet-relevant parent residential work may be curated as parent portfolio.
- **Parent testimonials / review content** → `store_reviews` — Parent social proof may only be used with Granite & Cabinet Center attribution and review approval.

### Business confirmation required

- **Header phone 703-956-9470** → `company_contact_channels` — Parent header phone is source evidence only; it is not the canonical Oakwell phone.
- **Contact phone 703-439-1040** → `company_contact_channels` — Parent Contact phone differs from header and Oakwell canonical profile.
- **22446 Davis Dr #109, Sterling, VA 20164** → `company_locations` — Parent Contact address variant is evidence only; Oakwell keeps canonical profile address.
- **22446 Davis Dr ste 109 Sterling, VA 20164** → `company_locations` — Showroom source uses a different suite format than Oakwell canonical profile.
- **Mon–Sat 8am–6pm** → `company_location_hours` — Parent showroom hours are source evidence; Oakwell has no approved structured hours source yet.
- **VA / MD / Washington D.C.** → `store_pages` — Parent service-area wording does not automatically become an Oakwell coverage promise.
- **Installation** → `store_pages` — Parent installation step is evidence only until Oakwell installation promise is confirmed.
- **Soft-close drawers and doors** → `store_pages` — Construction feature should publish only when confirmed against Oakwell products.
- **Plywood box** → `store_pages` — Construction feature should publish only when confirmed against Oakwell products.
- **Dovetail drawers** → `store_pages` — Construction feature should publish only when confirmed against Oakwell products.

### Hold

- **Family-owned business** — Parent positioning is not approved as an Oakwell-specific claim.
- **Licensed, bonded & insured** — Parent credential claim is not automatically an Oakwell claim.
- **Commercial project portfolio** — Commercial names/media are inventoried but launch scope stays on hold.
- **Custom Home Office** — Relevant cabinetry-adjacent category remains hold until Oakwell scope is confirmed.
- **Sinks / faucets / grids accessories** — Parent accessory catalog exists but Oakwell scope is unapproved.
- **Adelphi Kitchen Cabinets** — Parent Adelphi Kitchen Cabinets context may only be used if this brand is confirmed in Oakwell catalog scope.
- **Timberlake Kitchen Cabinets** — Parent Timberlake Kitchen Cabinets context may only be used if this brand is confirmed in Oakwell catalog scope.
- **Golden Homes Cabinets** — Parent Golden Homes Cabinets context may only be used if this brand is confirmed in Oakwell catalog scope.
- **Crystal Cabinets** — Parent Crystal Cabinets context may only be used if this brand is confirmed in Oakwell catalog scope.
- **StoneHill Cabinetry** — Parent StoneHill Cabinetry context may only be used if this brand is confirmed in Oakwell catalog scope.
- **J&K Cabinetry** — Parent J&K Cabinetry context may only be used if this brand is confirmed in Oakwell catalog scope.
- **21st Century Cabinetry** — Parent 21st Century Cabinetry context may only be used if this brand is confirmed in Oakwell catalog scope.
- **Vita Cabinetry** — Parent Vita Cabinetry context may only be used if this brand is confirmed in Oakwell catalog scope.
- **Forevermark Cabinetry** — Parent Forevermark Cabinetry context may only be used if this brand is confirmed in Oakwell catalog scope.
- **Ada Compliant Sinks navigation item** — The source navigation exposes this accessory label, but the audit did not resolve a stable Granite Center page URL; no URL is guessed.

### Exclude

- **Fax (703) 956-9649** — Parent fax is not an Oakwell public requirement.
- **Guaranteed 5 days turnaround** — Volatile/unsupported turnaround claim must not migrate.
- **50% off / package pricing / color-count claims** — Promotional and inventory-count claims are volatile and excluded from Oakwell migration.
- **Contact Form 7 / Trustindex artifacts** — Broken WordPress shortcodes/widgets are excluded.
- **Drawing / estimate upload** — Customer contact uploads remain outside initial migration by GC-0 decision.
- **Free 3D design within 24 business hours** — Do not migrate free/SLA wording.
- **50% off / 2–4 weeks** — Do not migrate volatile discount or lead-time promises.
- **100% Satisfaction Guarantee** — Do not migrate unverified guarantee.
- **Granite / natural-stone FAQ** — Source FAQ text is not relevant to Oakwell cabinetry and is excluded.
- **PAY / CardPointe** — Parent payment destination is external and excluded from initial Oakwell navigation.

## Conflict register

| Topic | Observed source evidence | GC-0 resolution | Public migration now? |
| --- | --- | --- | --- |
| phone | 703-956-9470<br>703-439-1040<br>Oakwell canonical +1 (703) 678-8488 | `business_confirmation_required` — Parent phone variants are evidence only; do not overwrite the canonical Oakwell company profile automatically. | No |
| address | 22446 DAVIS DR #109-127 STERLING, VA 20164<br>22446 Davis Dr #109, Sterling, VA 20164<br>22446 Davis Dr ste 109 Sterling, VA 20164<br>22446 DAVIS DR #109 STERLING, VA 20164 | `business_confirmation_required` — Oakwell continues to use its canonical company-profile address until the controlled source is intentionally changed. | No |
| hours | Monday-Friday 8am-6pm; Saturday 8am-6pm<br>Mon-Sat 8am-6pm<br>Sunday not stated | `business_confirmation_required` — Do not publish Oakwell hours until a structured canonical field is added and the business confirms the schedule; never infer Sunday. | No |
| service_area | Virginia, Maryland & Washington D.C.<br>all of the D.C. area | `business_confirmation_required` — Parent service territory does not automatically become an Oakwell service-area promise. | No |
| history_claims | Since 2011<br>family-owned<br>over 20 years | `parent_attributed` — Parent history may only be used with explicit parent attribution and business approval; it must not become Oakwell founding/history copy. | No |
| service_promises | Guaranteed 5 days turnaround<br>FREE Design Consultation<br>complimentary 3D design within 24 business hours<br>2-4 Weeks<br>100% Satisfaction Guarantee<br>installation team | `exclude` — Do not migrate unconfirmed Oakwell installation promises, free-design claims, SLAs, guarantees, discounts or turnaround statements. | No |
| attribution | Granite & Cabinet Center reviews/testimonials<br>parent residential projects<br>parent commercial projects | `parent_attributed` — Parent reviews/projects may only appear with clear Granite & Cabinet Center attribution unless specifically confirmed as Oakwell work. | No |

## Media inventory

Media records preserve exact source asset URLs discovered from live source page links. Failed image fetch/cache responses are **not** treated as byte verification; GC-2 must fetch originals and establish dimensions, size, MIME, checksum, duplicate groups and ownership/public-use readiness.

### Media groups

- **showroom: 10** — `parent_attributed` 10
- **vanity / bath cabinetry: 4** — `parent_attributed` 4
- **residential kitchen: 13** — `parent_attributed` 13
- **countertop-only excluded: 1** — `exclude` 1
- **commercial hold: 19** — `hold` 19
- **cabinet marketing / display: 11** — `parent_attributed` 11
- **decorative process icons excluded: 4** — `exclude` 4

### Cabinet-relevant source assets prioritized for GC-2

- 10 showroom photographs from the 2016/11 source set.
- 4 Bathroom Vanity photographs.
- 10 Kitchen photographs.
- 3 Kitchen Cabinet + Granite Countertop photographs, retained only when cabinetry is the approved visible subject.
- 11 cabinet-marketing photographs from the 2023/05 cabinet set.

### Explicit media holds/exclusions

- 19 commercial project assets are `hold` until cabinetry relevance and launch scope are confirmed.
- Countertop-only source media is `exclude` for Oakwell core; a representative source record is preserved to protect this rule.
- 4 generic process icons are excluded; Oakwell may adapt the process concept without copying decorative WordPress assets.

## Current source issues not to propagate

- Conflicting parent phone values (`703-956-9470` vs `703-439-1040`) and address variants.
- Parent hours exist, but Oakwell has no approved structured hours source yet; Sunday is not inferred.
- WordPress Contact Form 7 shortcode and broken/legacy review-widget artifacts on Showroom.
- Volatile discounts, package pricing, `free` promises, 24-hour design, turnaround, guarantees and broad inventory/count claims.
- Stone/granite FAQ and countertop repair/service pricing that do not belong in Oakwell cabinetry core.
- Parent reviews/projects without Oakwell-specific attribution.

## Target-domain map

| Planning domain | GC-1 intent |
| --- | --- |
| `company_contact_channels` | Future typed multi-value contact channels; exact schema decided when implemented. |
| `company_location_hours` | Future structured location hours after business confirmation. |
| `company_locations` | Future showroom/location records. |
| `none` | Source evidence intentionally not targeted for Oakwell CMS. |
| `store_faq` | Future cabinetry FAQ records in GC-6. |
| `store_footer` | Configurable footer sections/links. |
| `store_form_configuration` | Mutable project/contact form choices while validation/security remains code-owned. |
| `store_media_assets` | GC-2 controlled reusable media library backed by Supabase Storage. |
| `store_navigation` | Configurable business navigation in shared chrome. |
| `store_pages` | CMS page copy/sections/SEO presentation. |
| `store_projects` | Curated project entities with draft/review/publish lifecycle. |
| `store_reviews` | Future attributed review/social-proof records in GC-7. |

These names are planning-domain identifiers. GC-1 does not authorize new table creation; each later package must check current production schema and reuse existing models before adding a typed domain.

## GC-1 exit gate

- [x] Current primary navigation and cabinet-relevant source surfaces reviewed.
- [x] Every recorded source page has an explicit disposition.
- [x] Identity/contact/location/hour/service-area conflicts are preserved rather than normalized into Oakwell truth.
- [x] Cabinet/process/form concepts are separated from volatile promotions/SLAs/guarantees.
- [x] Parent reviews/projects retain attribution requirements.
- [x] Cabinet-relevant media candidates are inventoried with exact source URLs.
- [x] Countertop-only/commercial/optional-category boundaries are explicit.
- [x] No unverified media dimensions, bytes, MIME or checksum are claimed.
- [x] No source asset is designated as an Oakwell production delivery URL.
- [x] No production DB/schema/Storage/public content mutation is part of GC-1.

## Next package

Proceed to **GC-2 — Media Library & Optimization Pipeline** after this GC-1 PR is reviewed and merged. GC-2 owns byte acquisition, SHA-256 dedupe, optional perceptual duplicate review, dimensions/MIME/file-size verification, EXIF/GPS stripping, conservative resize/encoding, Supabase Storage upload and reusable media-library records/Admin controls.
