# GC-0 — Oakwell Business Truth Lock

Last reviewed: 2026-08-29
Status: **LOCKED FOR MIGRATION — changes require an explicit business decision**
Parent workstream: `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`
Architecture design: `modulex-store/docs/superpowers/specs/2026-08-29-oakwell-dynamic-content-cms-design.md`

## Purpose

This document freezes the business facts, data-ownership rules and publication rules that Granite & Cabinet Center content must obey before it can be adapted into Oakwell Cabinetry.

The goal is not to copy the parent website. The goal is to establish one authoritative Oakwell identity, distinguish parent-company facts from Oakwell facts, define what must **not** be published when the source is ambiguous, and ensure mutable production content is managed through Modulex rather than embedded in runtime code.

## 1. Canonical source of truth

Oakwell public identity/contact data currently comes from the existing controlled company-profile path:

`public.general_settings (id = 1)` → `store_api_private.get_store_public_profile()` → `public.get_store_public_profile()` → `modulex-store/src/lib/store/company/queries.ts`

Admin users manage the backing record through:

`modulex-admin/src/components/settings/CompanyProfileSettings.tsx`

### Lock

- The production company profile is the canonical source for Oakwell identity/contact fields that already exist there.
- Granite Center website values may be used as research/reference data, but they must never automatically overwrite the Oakwell company profile.
- Public pages must not hard-code alternate phone numbers, email addresses, addresses, legal names, or parent-company identity when the canonical profile supplies them.
- A future intentional business change must be made in the controlled source first, then allowed to propagate to Store surfaces.
- Existing single-value fields may remain as compatibility sources while structured domains are introduced, but the migration must converge on Admin-managed structured data rather than duplicating production values into source code.

## 1.1 Dynamic content ownership lock

The approved Oakwell content architecture is:

`modulex-admin` → Supabase DB / Storage → narrow published/public projections → `modulex-store`

This is now a GC-0 business rule, not only an implementation preference.

### Must be data-managed

Any mutable production business content that an operator may reasonably need to change without a deployment must be stored in a controlled Supabase-backed domain and managed from Admin. This includes, when the relevant surface exists:

- phone/fax/contact channels;
- public email addresses;
- company/showroom/location addresses;
- business hours;
- service areas;
- brand relationship copy and business claims;
- About/Showroom/Contact content;
- project titles, summaries, locations, categories and publication state;
- project/gallery media and their alt/caption metadata;
- reusable media assets;
- FAQs;
- reviews/testimonials and attribution;
- visible CTA copy/targets intended for business editing;
- navigation/footer labels, ordering, visibility and configurable destinations;
- SEO titles/descriptions/OG media;
- social profile URLs;
- business-controlled form options.

### May remain code-owned

Application behavior may remain in code: component structure, route implementation/allowlists, validation rules, permission identifiers, RPC/function names, supported section types, formatting logic, security checks and generic non-business empty-state behavior.

### Media lock

Granite Center/WordPress media URLs are migration provenance only. Approved media must ultimately be copied/optimized into Oakwell-controlled Supabase Storage and referenced through managed CMS/media records. The public Store must not depend on Granite Center as a runtime image backend.

### Publication boundary

Source discovery never implies publication. Migrated content follows a controlled lifecycle such as:

`discovered → classified → imported as draft → reviewed → approved → published`

Draft, hold, excluded, unresolved, unreviewed or invalid content must remain invisible to anonymous Store traffic.

### No hard-code migration shortcut

Granite Center values may appear in migration documentation/manifests as source evidence, but they must not be copied into React components, page modules, helpers, runtime config, CSS, JSON-LD constants or production media constants as a shortcut around the controlled data layer.

## 2. Locked identity and contact values

Production `public.get_store_public_profile()` was read on 2026-08-29 and currently returns the following business truth:

| Field | Locked value / rule |
| --- | --- |
| Public brand | **OAKWELL CABINETRY** |
| Legal / parent company | **GRANITE & CABINET CENTER** |
| Brand relationship wording | **Oakwell Cabinetry — a Granite & Cabinet Center brand.** |
| Public phone | **+1 (703) 678-8488** |
| Public email | **info@granitecenterva.com** |
| Public website | **https://oakwellcabinetry.com/** |
| Address source | **22446 DAVIS DR #109-127, VA** |
| City | **STERLING** |
| State | **Virginia** |
| ZIP | **20164** |
| Country | **US** |
| Locale | **en-US** |

These values describe the currently approved production truth. They are not a license to hard-code the literals into runtime Store code; Store consumers must read the controlled source/projection.

### Display normalization

When a human-readable single-line address is required, normalize the current source without changing its business meaning:

**22446 Davis Dr #109-127, Sterling, VA 20164**

Do not silently change the suite/range to `#109`, `Suite 109`, or another variant unless the canonical company profile is intentionally updated first.

## 3. Granite Center conflicts — explicit handling

The parent site contains multiple values that conflict with one another or with Oakwell production data.

### Phone numbers

Granite Center source pages expose `703-956-9470` and `703-439-1040` in different places.

**Lock:** neither number may replace the Oakwell primary phone automatically. The current Oakwell production number remains canonical until the business intentionally changes the controlled company/contact domain. Parent numbers may be retained as migration/source evidence and may only become public secondary contact channels after they are intentionally represented in the structured DB/Admin model with an approved label/visibility rule. They must never be introduced as runtime constants.

### Address variants

Granite Center pages use variants including `#109`, `Ste 109`, and `#109-127`.

**Lock:** Oakwell uses the current production company-profile address. Parent-site variants may only be used as supporting evidence when the canonical record is intentionally reviewed.

### Email

The current Oakwell profile publishes `info@granitecenterva.com` even though the public website domain is Oakwell.

**Lock:** do not invent or substitute an `@oakwellcabinetry.com` mailbox unless that mailbox is explicitly confirmed and the canonical profile is updated.

## 4. Publication locks for unconfirmed facts

The following rules are business-truth decisions, not temporary implementation shortcuts.

| Topic | GC-0 lock |
| --- | --- |
| Fax | **Omit from Oakwell public surfaces.** Parent fax is not an Oakwell requirement. If later approved, add it as an Admin-managed contact channel rather than hard-coding it. |
| Business hours | **Do not publish yet.** Parent site suggests Mon–Sat 8 AM–6 PM, but there is no canonical Oakwell hours field/source. |
| Sunday hours | **Do not infer.** No approved source. |
| Service area | **Do not publish a guaranteed VA/MD/DC service-area claim yet.** Parent coverage does not automatically become Oakwell coverage. |
| “Since 2011” | **Parent-attributed only.** Never present 2011 as Oakwell’s own founding date/history. Initial Oakwell migration should omit it unless specifically useful and clearly attributed. |
| Family-owned / awards / satisfaction guarantees | **Do not migrate by default.** Require separately verified business approval. |
| Installation service | **Do not make a public service claim yet.** Operational installation records do not prove the exact Oakwell sales/service promise. |
| Free design / free 3D design | **Do not claim “free” or promise an SLA.** A neutral project/design consultation CTA is allowed. |
| 24-hour design / 2–4 week turnaround / discount percentages | **Do not migrate.** Volatile or unverified offer/SLA claims. |
| Prices / promotional deals | **Do not migrate from Granite Center.** Oakwell pricing follows its existing approved catalog/dealer boundaries. |
| Payment link | **Do not add to Oakwell.** Requires a later finance/business decision. |
| Careers | **Do not add at launch.** Parent employment content is not part of the migration scope. |

When a later decision approves one of these facts for public use, the value must be added to the appropriate Admin-managed controlled source before Store rendering or structured data consumes it.

## 5. Parent-company attribution rules

Oakwell is a sub-brand of Granite & Cabinet Center. The public relationship should be transparent without making parent-company activity look like Oakwell-specific history.

### Approved relationship wording

Use:

**Oakwell Cabinetry — a Granite & Cabinet Center brand.**

The wording itself is business-owned content. Public presentation should ultimately come from the appropriate controlled CMS/settings source rather than a duplicated page constant.

### Reviews / testimonials

- Granite Center reviews may only appear with clear Granite & Cabinet Center attribution.
- Do not label parent reviews as Oakwell customer reviews.
- Do not migrate the broken/third-party WordPress review widget.
- Prefer curated, source-linked social proof in a later package.
- Reviews/testimonials must be Admin-managed records when implemented.

### Projects / portfolio

- Parent residential/commercial projects may only be presented as Granite & Cabinet Center portfolio/supporting experience unless a project is specifically confirmed as Oakwell work.
- Cabinet/kitchen/vanity relevance must be reviewed before import.
- Countertop-only media is not a default Oakwell project.
- Broad commercial portfolio remains hold-for-later at launch.
- Imported projects/media must use the controlled CMS lifecycle and retain provenance/attribution.

### Parent-site link

A contextual link to Granite & Cabinet Center is allowed from About/footer relationship copy. It should not replace Oakwell’s primary navigation, catalog, lead, or portal journeys. If exposed publicly, the link/label should be CMS/settings-managed when ordinary business editing is expected.

## 6. Initial Oakwell scope decisions

These decisions keep the first migration focused on cabinetry and prevent parent-site scope from expanding Oakwell by accident.

| Area | Decision |
| --- | --- |
| Standalone `/showroom` | **Approved for the migration plan.** Build in GC-3; do not show unconfirmed hours. |
| Kitchen/cabinet/vanity project media | **In scope**, subject to GC-1 inventory + attribution/relevance review. |
| Residential portfolio | **Selective only**, cabinet-relevant projects. |
| Commercial portfolio | **Hold for later.** |
| Home office / built-ins | **Hold for later** unless current Oakwell product scope is explicitly confirmed. |
| Sinks / faucets / sink grids / accessories | **Hold for later.** Do not create an Oakwell accessory catalog from parent content by default. |
| Quartz / granite / countertop services | **Out of core Oakwell migration scope.** |
| Countertop repair/service fee table | **Exclude.** |
| Careers | **Exclude from initial scope.** |
| Payment / CardPointe | **Exclude.** |

## 7. Lead / consultation form lock

The existing native Oakwell lead system remains the foundation. Do not reintroduce Wufoo or Contact Form 7.

### Initial contact/project inquiry

Allowed migration concepts:

- project type/context;
- showroom/design consultation intent;
- address/city/ZIP where operationally useful;
- desired consultation date as an optional preference, not a guaranteed appointment;
- project notes;
- attribution/UTM data already supported by the Store.

Business-controlled option labels/choices introduced by GC-4 must be managed from the approved data/Admin surface instead of hard-coded when operators are expected to change them.

### File uploads

**Initial lock:** keep customer/contact uploads out of the first migration package. Dealer supporting-document upload remains unchanged. Customer drawing/measurement/estimate upload may be introduced later only with an explicit UX/security/storage decision.

## 8. Data-model decisions

### Company identity

Do **not** create a parallel duplicate Oakwell identity/config stack. Continue to use and extend the existing company-profile domain. Typed child domains for multi-value contact channels, public locations/showrooms and location hours are allowed when the implementation package first needs them, provided Admin manages them and Store receives only the narrow public projection.

### Business hours

There is currently no approved public hours field in `general_settings` or `store_site_settings`.

**Lock:** do not hard-code hours. If hours are required for `/showroom` or LocalBusiness schema, add a controlled structured setting/domain in the package that first needs them, then populate it only after business confirmation.

### Service area

There is no canonical service-area field today.

**Lock:** do not infer service area from Granite Center copy. Add a controlled field only if product/SEO requirements justify it and the business confirms the coverage.

### Parent relationship

No new database column is required in GC-0. Relationship copy can be managed through approved CMS page content for the initial About/Showroom implementation. GC-8 may add typed structured-data configuration if `parentOrganization` is emitted in JSON-LD. Any such structured-data value must derive from the same controlled data source used by visible content.

### Pages/projects/media/FAQ/reviews/navigation

Reuse `store_pages`, `store_projects`, `store_project_media` and existing Store settings where they already fit. Add typed domains incrementally when a GC package first needs them; do not create one unrestricted page-builder JSON blob or a second migration-only public CMS.

## 9. Operational data is not public marketing truth

Inventory/warehouse/location records are operational data and must not be used as Oakwell showroom/contact truth unless explicitly designated for that purpose.

Production warehouse records currently include unrelated operational locations and therefore are **not** an approved source for Oakwell public address/hours/service-area content.

## 10. GC-0 exit gate

- [x] Canonical company-profile source identified and verified.
- [x] Current production public profile captured.
- [x] Oakwell vs Granite Center identity boundary defined.
- [x] Conflicting parent phone/address data given deterministic handling rules.
- [x] Parent reviews/projects require explicit attribution.
- [x] Unconfirmed hours/service-area/service claims are fail-closed: do not publish.
- [x] Initial migration inclusions/exclusions are frozen.
- [x] Customer upload scope is frozen for the first migration package.
- [x] Dynamic content ownership is locked to Admin → Supabase DB/Storage → controlled public projections → Store.
- [x] Mutable production business content/media is prohibited from runtime hard-code migration shortcuts.
- [x] No production data, schema, runtime code, or public content is changed by GC-0.

## 11. Next package

Proceed to **GC-1 — Source crawl & content/media manifest** using:

- architecture design: `modulex-store/docs/superpowers/specs/2026-08-29-oakwell-dynamic-content-cms-design.md`;
- implementation plan: `modulex-store/docs/superpowers/plans/2026-08-29-gc1-source-content-media-manifest.md`.

GC-1 must inventory and classify source URLs/media against these locks before anything is imported into the Oakwell CMS. Any source item that conflicts with this document must be excluded, held or flagged for an explicit business decision rather than silently adapted.
