# Oakwell Dynamic Content / CMS Architecture Design

Date: 2026-08-29
Status: **APPROVED — implement sequentially through Granite migration packages**
Scope: `modulex-admin` + `modulex-store` + Supabase public-content boundary
Parent workstream: `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`

## 1. Purpose

Granite & Cabinet Center is a source for migration research and approved owned content, but it must never become a runtime content dependency for Oakwell Cabinetry.

The Oakwell public website must be operated as a database-backed CMS surface:

`modulex-admin` → Supabase controlled data/storage → narrow published-only public RPCs → `modulex-store`

The core business rule is:

> Any business-owned content that an operator may reasonably need to change without a code deployment must be stored in controlled data and managed from Admin. Runtime application code must not contain production business values such as phone numbers, addresses, business hours, real project copy, reviews, marketing claims, navigation labels, campaign text, SEO copy, or production media URLs.

This design extends the existing Modulex CMS architecture rather than introducing a second CMS or cloning Granite Center WordPress.

## 2. Design goals

1. Keep `modulex-admin` as the sole operational/CMS control plane.
2. Keep `modulex-store` as a read-only public delivery surface for marketing content.
3. Keep anonymous public access behind narrow, published-only RPC projections.
4. Preserve existing `general_settings`, `store_pages`, `store_projects`, `store_project_media`, and `store_site_settings` foundations where they already fit.
5. Store production media in Oakwell-controlled Supabase Storage rather than hotlinking Granite Center or WordPress media.
6. Make migration data reviewable before publication.
7. Keep attribution/provenance for migrated parent-company material.
8. Fail closed when a business fact is unconfirmed or unpublished.
9. Avoid a generic unrestricted page builder. Use typed content domains and typed section configurations.
10. Add data structures incrementally in the GC package that first needs them; do not create speculative tables for future features.

## 3. Non-goals

This work does not:

- clone Granite Center's WordPress schema, plugins, shortcodes, widgets, or page markup;
- make Granite Center a runtime API/content backend;
- automatically publish crawled content;
- automatically treat parent-company facts as Oakwell facts;
- expose Admin tables directly to anonymous clients;
- replace catalog/dealer pricing boundaries;
- build Blog CMS, Careers, payments, countertop services, or optional accessory catalogs unless separately approved;
- create an unrestricted drag-and-drop page builder.

## 4. Canonical ownership model

### 4.1 Business identity

Existing `general_settings` remains the canonical root for core Oakwell company identity such as brand/company name, legal name, canonical email, canonical website, locale, and canonical address fields that already exist there.

Do not duplicate these fields inside page content merely because a page displays them.

### 4.2 Multi-value contact and location data

The current single `phone` field is insufficient for the new requirement because the business may expose more than one approved phone or contact channel.

When required by implementation, extend the company-profile domain with typed child records rather than hard-coded constants. The expected model is conceptually:

- contact channels: type, label, value, public/private visibility, primary flag, sort order, active status;
- locations/showrooms: label, address components, directions/map data when approved, public visibility, sort order, active status;
- location hours: weekday, open/closed state, opening time, closing time, optional note.

Exact table names and constraints will be finalized in the implementation package after checking the current production schema and existing Admin settings conventions.

The legacy `general_settings.phone` may remain temporarily for backward compatibility, but public Store consumers must converge on the structured projection. A migration must preserve the existing canonical number and must not require a code deployment to change it later.

### 4.3 Page content

Continue using `store_pages` for controlled page-level content and SEO metadata.

A page may contain typed subordinate sections when the current page schema is insufficient. The architecture must favor a constrained section type plus validated structured fields over arbitrary HTML.

Examples of legitimate typed section families include:

- rich text / introduction;
- image + text;
- showroom details;
- process steps;
- CTA group;
- FAQ collection reference;
- testimonial/review collection reference;
- project/gallery collection reference.

The Store renderer must understand only approved section types. Unknown or invalid section data must not be rendered publicly.

### 4.4 Projects and gallery

Keep `store_projects` as the project entity and `store_project_media` as the project/media relationship.

Imported projects must support:

- draft/published lifecycle;
- title, slug, summary, category and location where appropriate;
- sort order;
- SEO metadata;
- source/provenance metadata where migrated from Granite Center;
- attribution classification such as Oakwell work, Granite & Cabinet Center portfolio, or unverified/hold;
- cabinet-relevance review before publication.

No project discovered by a crawler becomes public merely because it exists in the source manifest.

### 4.5 Media library

Create one Oakwell-controlled media asset domain when GC-2 is implemented. The media library will represent files stored in Supabase Storage and reusable by pages, projects and future CMS surfaces.

Required concepts include:

- storage bucket/path;
- MIME/media type;
- width and height when verified;
- file size when verified;
- title;
- alt text;
- caption when useful;
- source URL;
- source page URL;
- source attribution/ownership context;
- checksum for deduplication;
- lifecycle/review status;
- created/updated audit fields.

Do not store Granite Center image URLs as the production delivery URL. Approved assets are copied, optimized in GC-2, stored in Oakwell-controlled Storage, then referenced by CMS records.

Existing project media URL fields may be preserved during migration for compatibility, but the target model should reference a controlled media asset rather than requiring operators to paste production URLs.

### 4.6 FAQ and social proof

FAQ and testimonials/reviews are business content and therefore cannot live as hard-coded arrays in Store components.

When these surfaces are implemented, use typed CMS records with:

- draft/published or active/inactive state;
- sort order;
- page/surface association where needed;
- source and attribution fields for migrated parent-company reviews;
- validation that prevents a Granite & Cabinet Center review from being mislabeled as an Oakwell review.

### 4.7 Navigation, footer and CTA content

Primary navigation, configurable footer links/sections and business-owned CTA labels/targets must be Admin-managed when ordinary business changes should not require deployment.

Routing logic and allowed internal route semantics can remain code-owned. The displayed business labels, ordering, visibility and approved destinations are data-owned.

The existing Phase 2.1 Package D shared chrome work should be implemented under this rule rather than with new hard-coded arrays.

### 4.8 SEO and structured data

Business-owned SEO title, description, OG media and page copy must come from CMS/settings.

Code may own the JSON-LD schema shape, validation and transformation logic, but facts emitted into structured data must come from the same canonical DB-backed profile/CMS sources used by the visible page.

Hours, service area, parent organization, telephone and address must not be separately hard-coded into JSON-LD.

## 5. Migration lifecycle

Granite migration follows a controlled lifecycle:

`discovered → classified → imported as draft → reviewed → approved → published`

A source item may instead be classified as:

- adapt/migrate;
- parent-attributed;
- hold;
- exclude;
- business-confirmation-required.

The crawler/source manifest is evidence and intake, not publication authority.

### Publication rule

Public RPCs must return only content that satisfies the relevant publication rules. Draft, hold, rejected, unpublished, unreviewed, or invalid content stays invisible to anonymous Store traffic.

## 6. Source/provenance requirements

Migrated content must preserve enough provenance to answer where it came from and why it is allowed on Oakwell.

For imported records, retain as appropriate:

- source site;
- source URL;
- source page URL;
- source title/identifier;
- source brand/entity;
- attribution requirement;
- migration classification;
- migration notes;
- imported/reviewed timestamps where useful.

These fields are operational metadata and do not need to be exposed publicly unless the public surface requires attribution.

## 7. Admin experience

Admin must expose business-appropriate management surfaces rather than forcing direct SQL changes.

The exact screens are delivered incrementally, but the resulting experience must cover the content that the Store actually consumes, including as applicable:

- Company Profile / contact channels;
- locations/showroom and hours;
- Pages;
- Media Library;
- Projects and project media;
- FAQ;
- Testimonials/reviews;
- Navigation and footer;
- SEO/OG fields;
- publish/unpublish controls;
- migration provenance where an operator needs it for review.

Admin mutation controls remain permission-gated. Database RLS/RPC policies remain the real authorization boundary; UI guards are defense in depth.

## 8. Store read boundary

`modulex-store` must not directly read CMS tables from anonymous browser code.

Use server-side domain query modules and narrow public RPCs, following the existing company-profile and Phase 2.1 content patterns.

The public API boundary should:

- expose only fields required to render public pages;
- filter to public/published/active records;
- omit internal migration notes and private metadata;
- preserve stable typed response contracts;
- fail closed when readiness cannot be established.

Client components receive sanitized rendered props and do not receive service-role credentials or unrestricted Supabase access.

## 9. Hard-code policy

### 9.1 Must be data-managed

Production values in these categories must not be embedded in runtime source code:

- phone numbers and fax numbers;
- public emails;
- addresses and showroom/location data;
- business hours;
- service areas;
- company/brand relationship copy displayed to customers;
- company history/claims;
- real project titles, descriptions, locations and categories;
- production project/gallery media URLs;
- image alt/caption content owned by the business;
- FAQs;
- reviews/testimonials;
- promotional/offer copy;
- visible CTA copy that business operators are expected to change;
- primary navigation/footer business labels and configurable links;
- production SEO titles/descriptions/OG media;
- social profile URLs;
- publication ordering and visibility.

### 9.2 May remain code-owned

The following are implementation behavior rather than business content and may remain in code:

- React component structure;
- route implementation and route allowlists;
- RPC/function names;
- permission identifiers;
- validation rules;
- enum/type definitions;
- supported section/component types;
- security policies and authorization checks;
- formatting/transformation logic;
- fallback behavior that contains no invented business facts;
- default empty-state text that is generic product UI rather than a business claim.

### 9.3 Test enforcement

Existing public-production smoke coverage should be expanded over time to catch accidental production business literals in Store source where practical. Tests should focus on high-risk classes such as phone/address literals, remote Granite Center media hotlinks, WordPress shortcodes/plugin remnants, placeholder claims and bypasses of the approved public query layer.

## 10. Media processing rule

GC-2 owns media transformation.

Approved source media must be:

1. downloaded from the source;
2. checksum-deduplicated;
3. reviewed for cabinetry relevance and attribution;
4. stripped of unnecessary EXIF/GPS metadata;
5. resized conservatively without upscaling;
6. encoded into appropriate web formats while protecting wood-grain/detail fidelity;
7. uploaded to Oakwell-controlled Supabase Storage;
8. registered in the media library;
9. linked to CMS/project records;
10. published only after content review.

The Store should use responsive image delivery and the existing Next.js image strategy. Raw WordPress asset URLs are source metadata, not production presentation URLs.

## 11. Failure handling

The public site must prefer omission over invention.

Examples:

- no approved hours → omit hours;
- no confirmed service area → omit service-area claim;
- no published project → Gallery stays unavailable according to the existing readiness rule;
- invalid media reference → degrade safely to another approved asset or omit the media;
- parent review without attribution → do not publish;
- unsupported section type → do not render it;
- RPC failure → use an explicitly approved factual fallback only where one already exists, otherwise fail closed.

Fallbacks must never introduce fake business content.

## 12. Security and permissions

- Anonymous Store users receive narrow read-only published projections.
- Authenticated Admin writes remain role-controlled and RLS-protected.
- Storage write/delete operations are Admin-controlled.
- Public Storage access is permitted only for assets intentionally published for the Store; private uploads remain in separate private paths/buckets as currently designed.
- Migration/source metadata that is operational or private is not exposed through public RPCs.
- No service-role secret is shipped to `modulex-store` client code.

## 13. Rollout by Granite workstream

### GC-0 — ownership lock amendment

Record this design as the authoritative expansion of the original business-truth lock: the lock now governs data ownership as well as factual truth.

### GC-1 — source content/media manifest

Inventory source pages/assets and classify every candidate against GC-0 and this design. No public import is required to finish discovery.

The manifest should record the proposed target CMS domain for each accepted candidate so GC-2+ implementation is deterministic.

### GC-2 — media library and optimization pipeline

Implement the media asset domain, Admin media management required by migration, optimization/import tooling, provenance, deduplication and Storage integration.

### GC-3 — company identity / contact / showroom

Extend company-profile/location/contact models only as required, add Admin controls, add/update public profile projections, and make About/Showroom/Contact consume only the controlled source.

### GC-4 — contact / project consultation

Make business-controlled form options configurable where they represent mutable business choices. Keep validation/security behavior code-owned.

### GC-5 — projects / gallery

Import curated cabinet-relevant project/media records through the controlled CMS lifecycle. This package may close the standing Phase 2.1 Gallery real-content blocker after live acceptance.

### GC-6 — cabinet content / customer journey

Add typed CMS-backed process/content/FAQ domains only as required by approved Oakwell surfaces.

### GC-7 — reviews / social proof

Add attributed, manageable review/testimonial records and public projections.

### GC-8 — navigation / footer / SEO / hard-code audit

Finish configurable shared chrome, structured data alignment, SEO, accessibility/performance verification and repository-level business-literal/hotlink audit.

## 14. Testing strategy

Each implementation package must include the tests appropriate to its scope.

Minimum classes:

- database/RLS tests for new tables and permissions;
- RPC tests proving anonymous users see only published/public projections;
- Admin smoke tests for create/edit/publish/unpublish and mutation permission guards;
- Store contract tests proving the page uses the approved server query boundary;
- tests preventing unpublished content from rendering;
- media validation tests for type/size/path/provenance rules;
- migration idempotency/deduplication checks where import tools are added;
- public-production contract checks for forbidden hard-coded business literals and source hotlinks where practical;
- lint and production builds for affected apps;
- live acceptance before a roadmap item is marked complete.

## 15. Compatibility and migration policy

Do not break existing production surfaces merely to reach the final model in one step.

For existing fields such as `general_settings.phone` or project media URLs:

1. introduce the structured model;
2. backfill current approved values into controlled records;
3. extend the public projection while preserving compatibility when needed;
4. migrate Store consumers;
5. migrate Admin editors;
6. remove/deprecate legacy representation only after no production consumer depends on it.

No production business value is to be duplicated into source-code constants during this transition.

## 16. Acceptance criteria

This architecture is successfully implemented when:

- ordinary production content/business information changes no longer require Store code edits;
- the relevant content is editable from Admin;
- all production public values are stored in approved Supabase-backed domains;
- Store reads public business content only through controlled server/RPC boundaries;
- media is Oakwell-controlled and CMS-managed rather than hotlinked to Granite Center;
- imported content retains review status and provenance;
- unpublished/unapproved data is not publicly exposed;
- parent-brand attribution cannot be silently lost;
- Store components contain behavior/layout, not mutable production business content;
- roadmap and smoke contracts document and enforce the rule as the workstream progresses.

## 17. Design decision summary

Use a **structured hybrid CMS** that extends the existing Modulex domains.

Do not replace the current CMS with a generic page builder, and do not create a parallel migration-only public content stack. Add typed data domains only when a GC package needs them, expose them through controlled published projections, manage them in Admin, and make Store a pure consumer of those projections.
