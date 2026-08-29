# GC-0 — Oakwell Business Truth Lock

Last reviewed: 2026-08-29
Status: **LOCKED FOR MIGRATION — changes require an explicit business decision**
Parent workstream: `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`

## Purpose

This document freezes the business facts and publication rules that Granite & Cabinet Center content must obey before it can be adapted into Oakwell Cabinetry.

The goal is not to copy the parent website. The goal is to establish one authoritative Oakwell identity, distinguish parent-company facts from Oakwell facts, and define what must **not** be published when the source is ambiguous.

## 1. Canonical source of truth

Oakwell public identity/contact data must come from the existing controlled company-profile path:

`public.general_settings (id = 1)` → `store_api_private.get_store_public_profile()` → `public.get_store_public_profile()` → `modulex-store/src/lib/store/company/queries.ts`

Admin users manage the backing record through:

`modulex-admin/src/components/settings/CompanyProfileSettings.tsx`

### Lock

- The production company profile is the canonical source for Oakwell identity/contact fields.
- Granite Center website values may be used as research/reference data, but they must never automatically overwrite the Oakwell company profile.
- Public pages must not hard-code alternate phone numbers, email addresses, addresses, legal names, or parent-company identity when the canonical profile already supplies them.
- A future intentional business change must be made in the controlled source first, then allowed to propagate to Store surfaces.

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

### Display normalization

When a human-readable single-line address is required, normalize the current source without changing its business meaning:

**22446 Davis Dr #109-127, Sterling, VA 20164**

Do not silently change the suite/range to `#109`, `Suite 109`, or another variant unless the canonical company profile is intentionally updated first.

## 3. Granite Center conflicts — explicit handling

The parent site contains multiple values that conflict with one another or with Oakwell production data.

### Phone numbers

Granite Center source pages expose `703-956-9470` and `703-439-1040` in different places.

**Lock:** neither number is an Oakwell public phone. Oakwell continues to use the canonical production number `+1 (703) 678-8488` unless the business intentionally changes `general_settings`.

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
| Fax | **Omit from Oakwell public surfaces.** Parent fax is not an Oakwell requirement. |
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

## 5. Parent-company attribution rules

Oakwell is a sub-brand of Granite & Cabinet Center. The public relationship should be transparent without making parent-company activity look like Oakwell-specific history.

### Approved relationship wording

Use:

**Oakwell Cabinetry — a Granite & Cabinet Center brand.**

### Reviews / testimonials

- Granite Center reviews may only appear with clear Granite & Cabinet Center attribution.
- Do not label parent reviews as Oakwell customer reviews.
- Do not migrate the broken/third-party WordPress review widget.
- Prefer curated, source-linked social proof in a later package.

### Projects / portfolio

- Parent residential/commercial projects may only be presented as Granite & Cabinet Center portfolio/supporting experience unless a project is specifically confirmed as Oakwell work.
- Cabinet/kitchen/vanity relevance must be reviewed before import.
- Countertop-only media is not a default Oakwell project.
- Broad commercial portfolio remains hold-for-later at launch.

### Parent-site link

A contextual link to Granite & Cabinet Center is allowed from About/footer relationship copy. It should not replace Oakwell’s primary navigation, catalog, lead, or portal journeys.

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

### File uploads

**Initial lock:** keep customer/contact uploads out of the first migration package. Dealer supporting-document upload remains unchanged. Customer drawing/measurement/estimate upload may be introduced later only with an explicit UX/security/storage decision.

## 8. Data-model decisions

### Company identity

Do **not** add a duplicate Oakwell contact table or hard-coded config. Continue using the existing company-profile RPC path.

### Business hours

There is currently no approved public hours field in `general_settings` or `store_site_settings`.

**Lock:** do not hard-code hours. If hours are required for `/showroom` or LocalBusiness schema, add a controlled structured setting in the package that first needs them, then populate it only after business confirmation.

### Service area

There is no canonical service-area field today.

**Lock:** do not infer service area from Granite Center copy. Add a controlled field only if product/SEO requirements justify it and the business confirms the coverage.

### Parent relationship

No new database column is required in GC-0. Relationship copy can be managed through approved CMS page content for the initial About/Showroom implementation. GC-8 may add typed structured-data configuration if `parentOrganization` is emitted in JSON-LD.

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
- [x] No production data, schema, runtime code, or public content is changed by GC-0.

## 11. Next package

Proceed to **GC-1 — Source crawl & content/media manifest**.

GC-1 must inventory and classify source URLs/media against these locks before anything is imported into the Oakwell CMS. Any source item that conflicts with this document must be excluded or flagged for an explicit business decision rather than silently adapted.
