# GC-1 Source Content / Media Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, reviewable and machine-checkable Granite & Cabinet Center source manifest that classifies every migration candidate before any content or media is imported into Oakwell production CMS/Storage.

**Architecture:** GC-1 is an intake and classification package, not a publishing package. It crawls the approved source, records page/content/media evidence, maps each candidate to the Oakwell structured CMS architecture, and fails closed on anything that conflicts with GC-0. The output is one human-readable review document plus one machine-readable JSON manifest protected by a deterministic Node contract; no production Supabase data, schema, Store rendering, or Admin UI changes are part of GC-1.

**Tech Stack:** Next.js monorepo documentation, Node.js 20-compatible ESM contract script, JSON manifest, GitHub-reviewed source evidence, current Granite Center web source, existing Modulex Store/Admin roadmaps.

**Spec:** `modulex-store/docs/superpowers/specs/2026-08-29-oakwell-dynamic-content-cms-design.md`

## Global Constraints

- `modulex-admin` remains the sole operational/CMS control plane.
- `modulex-store` remains a read-only public delivery surface for marketing content.
- Granite & Cabinet Center is research/source evidence only and must never become Oakwell's runtime content backend.
- Production business values that operators may reasonably change without deployment must be Supabase-backed and Admin-managed.
- Approved media must ultimately be copied to Oakwell-controlled Supabase Storage; source WordPress URLs are provenance only.
- Source discovery never implies publication.
- GC-0 business-truth locks remain authoritative for identity, attribution, unconfirmed claims and in/out-of-scope categories.
- Public-facing import decisions use one of: `adapt`, `parent_attributed`, `hold`, `exclude`, `business_confirmation_required`.
- No source item is marked `adapt` when its factual claim conflicts with GC-0.
- No exact image dimensions, file sizes or checksums are recorded unless actually verified from source bytes/metadata.
- No production database/schema/runtime code/public content is changed by GC-1.
- Before implementation, reread both roadmaps and rebase the package on current `main` because parallel Modulex PRs may have merged.

---

## File Structure

### Create

- `modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md`
  - Human review surface: crawl scope, source-page matrix, classification summary, conflicts, candidate project/media groups, exclusion rationale, target CMS-domain map and GC-1 exit gate.
- `modulex-store/docs/granite-center/gc1-source-manifest.json`
  - Machine-readable source manifest consumed by the validation contract and later GC-2/GC-3+ import work.
- `modulex-store/scripts/gc1-source-manifest-contract.mjs`
  - Deterministic schema/invariant validator for the manifest.

### Modify

- `modulex-store/package.json`
  - Add `smoke:gc1-source-manifest`; do not add it to the full runtime smoke chain unless the package proves it is stable and useful after migration.
- `modulex-store/STORE_ROADMAP.md`
  - Rebaseline to current `main`, mark dynamic-content architecture approved, mark GC-1 `[~]` while executing and `[x]` only after contract/review completion; next action becomes GC-2.
- `modulex-admin/ADMIN_ROADMAP.md`
  - Record the cross-roadmap CMS ownership rule and note that later GC packages will add Admin-managed domains incrementally; do not disturb parallel A0 cleanup status.
- `modulex-store/docs/GC0_BUSINESS_TRUTH_LOCK.md`
  - Add the approved global data-ownership amendment: mutable business content/media must be DB/Storage-backed, Admin-managed and Store-consumed through controlled projections; source values may not be hard-coded into runtime code.
- `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`
  - Replace the earlier loose architecture wording with the approved structured-hybrid CMS rule and link the design/plan.

---

## Manifest Contract

`gc1-source-manifest.json` must be a JSON object with this top-level shape:

```json
{
  "schemaVersion": 1,
  "source": {
    "brand": "Granite & Cabinet Center",
    "origin": "https://granitecenterva.com/",
    "auditedAt": "YYYY-MM-DD"
  },
  "pages": [],
  "contentCandidates": [],
  "mediaCandidates": [],
  "conflicts": []
}
```

### Page record

```json
{
  "id": "page-home",
  "url": "https://granitecenterva.com/",
  "canonicalUrl": "https://granitecenterva.com/",
  "title": "Source page title",
  "surface": "home",
  "crawlStatus": "reviewed",
  "oakwellAction": "adapt",
  "targetDomain": "store_pages",
  "notes": "Short factual review note"
}
```

Allowed `crawlStatus` values:

```text
reviewed
unavailable
redirected
blocked
```

Allowed `oakwellAction` values:

```text
adapt
parent_attributed
hold
exclude
business_confirmation_required
```

Allowed `targetDomain` values in GC-1:

```text
general_settings
company_contact_channels
company_locations
company_location_hours
store_pages
store_projects
store_project_media
store_media_assets
store_faq
store_reviews
store_navigation
store_footer
store_form_configuration
none
```

The target names `company_contact_channels`, `company_locations`, `company_location_hours`, `store_media_assets`, `store_faq`, `store_reviews`, `store_navigation`, `store_footer`, and `store_form_configuration` are planning-domain identifiers only in GC-1. They do not authorize table creation; the implementation package that first needs a new domain must confirm naming/schema against current production state.

### Content candidate record

```json
{
  "id": "content-kitchen-process",
  "sourcePageId": "page-kitchen-cabinet-sale",
  "kind": "process",
  "sourceLabel": "Our Working Process",
  "summary": "Four-step cabinet design/install process candidate",
  "oakwellAction": "adapt",
  "targetDomain": "store_pages",
  "attribution": "rewrite_for_oakwell",
  "businessConfirmationRequired": false,
  "reasons": ["cabinet_relevant", "rewrite_not_copy"],
  "sourceEvidence": ["https://granitecenterva.com/kitchen-cabinet-sale/"]
}
```

Allowed `kind` values:

```text
identity
contact
location
hours
service_area
history_claim
marketing_claim
process
faq
review
project
form_field
navigation
footer
seo
product_brand_context
other
```

Allowed `attribution` values:

```text
oakwell
parent_required
rewrite_for_oakwell
not_public
unresolved
```

### Media candidate record

```json
{
  "id": "media-showroom-001",
  "sourcePageId": "page-showroom",
  "sourceUrl": "https://granitecenterva.com/.../image.webp",
  "sourceAlt": "Source alt text when available",
  "mediaKind": "image",
  "subject": "showroom",
  "oakwellAction": "adapt",
  "targetDomain": "store_media_assets",
  "cabinetRelevance": "high",
  "attribution": "parent_required",
  "verifiedMetadata": {
    "width": null,
    "height": null,
    "bytes": null,
    "mimeType": null,
    "sha256": null
  },
  "notes": "Metadata remains null until byte-level verification in GC-2"
}
```

Allowed `mediaKind` values:

```text
image
video
panorama
other
```

Allowed `cabinetRelevance` values:

```text
high
medium
low
none
unknown
```

### Conflict record

```json
{
  "id": "conflict-phone-parent",
  "topic": "phone",
  "sourcePageIds": ["page-home", "page-contact"],
  "observedValues": ["source values recorded exactly as evidence"],
  "gc0Rule": "Do not overwrite Oakwell canonical profile automatically",
  "resolution": "business_confirmation_required",
  "publicMigrationAllowed": false
}
```

---

### Task 1: Establish the manifest schema and RED contract

**Files:**
- Create: `modulex-store/docs/granite-center/gc1-source-manifest.json`
- Create: `modulex-store/scripts/gc1-source-manifest-contract.mjs`
- Modify: `modulex-store/package.json`

**Interfaces:**
- Consumes: the manifest contract defined above.
- Produces: `npm run smoke:gc1-source-manifest` as the deterministic GC-1 acceptance command.

- [ ] **Step 1: Create an intentionally incomplete manifest fixture**

Create the top-level JSON structure but leave `pages`, `contentCandidates`, `mediaCandidates`, and `conflicts` empty so the initial contract can prove the package is RED before source population.

- [ ] **Step 2: Write the manifest contract**

Implement `scripts/gc1-source-manifest-contract.mjs` with Node built-ins only (`node:fs`, `node:path`, `node:url`, `node:assert/strict`). The script must:

```js
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.source.origin, "https://granitecenterva.com/");
assert.match(manifest.source.auditedAt, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(manifest.pages.length > 0, "GC-1 must inventory at least one source page");
assert.ok(manifest.contentCandidates.length > 0, "GC-1 must classify content candidates");
assert.ok(manifest.mediaCandidates.length > 0, "GC-1 must classify media candidates");
assert.ok(manifest.conflicts.length > 0, "GC-1 must preserve source conflicts");
```

Add set-membership assertions for every enum listed in this plan, unique `id` assertions within each array, `https://granitecenterva.com/` origin checks for source URLs, page-reference integrity (`sourcePageId` must exist), and target-domain validation.

For `verifiedMetadata`, enforce that unverified values stay `null`; do not accept invented positive dimensions/sizes without a later GC-2 verification marker.

Enforce these semantic invariants:

```js
assert.ok(
  candidate.oakwellAction !== "adapt" || candidate.attribution !== "unresolved",
  `${candidate.id}: adaptable content cannot have unresolved attribution`
);

assert.ok(
  conflict.resolution !== "adapt",
  `${conflict.id}: conflicts cannot auto-adapt into Oakwell`
);
```

- [ ] **Step 3: Wire the command**

Add to `modulex-store/package.json`:

```json
"smoke:gc1-source-manifest": "node scripts/gc1-source-manifest-contract.mjs"
```

Do not add it to the permanent full `smoke` chain in this task.

- [ ] **Step 4: Run the RED contract**

Run from `modulex-store`:

```bash
npm run smoke:gc1-source-manifest
```

Expected: FAIL on the empty source inventory, proving the validator protects completion rather than merely parsing JSON.

- [ ] **Step 5: Commit the RED contract**

```bash
git add modulex-store/package.json modulex-store/scripts/gc1-source-manifest-contract.mjs modulex-store/docs/granite-center/gc1-source-manifest.json
git commit -m "test(store): define GC-1 source manifest contract"
```

---

### Task 2: Crawl and classify the source-page inventory

**Files:**
- Modify: `modulex-store/docs/granite-center/gc1-source-manifest.json`
- Create: `modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md`

**Interfaces:**
- Consumes: GC-0 lock, approved CMS architecture, live Granite Center pages.
- Produces: reviewed `pages[]` records that all later content/media records reference.

- [ ] **Step 1: Re-audit the current source**

Use current source responses, not stale chat memory. At minimum resolve and review these known surfaces when still live:

```text
https://granitecenterva.com/
https://granitecenterva.com/about-us/
https://granitecenterva.com/about-us/showroom/
https://granitecenterva.com/contact-us/
https://granitecenterva.com/residential/
https://granitecenterva.com/kitchen-cabinet-sale/
https://granitecenterva.com/kitchen-cabinet-deals/
https://granitecenterva.com/kitchen-bathroom-remodeling/
https://granitecenterva.com/jk-cabinetry/
https://granitecenterva.com/about-us/faq/
https://granitecenterva.com/services/
```

Also discover current Commercial Projects, cabinet-brand, accessories, home-office, career and payment URLs from live navigation/sitemap when available; do not guess missing URLs.

- [ ] **Step 2: Record every reviewed page**

Each live/redirected/unavailable source becomes one `pages[]` record with a deterministic id. Classify each page against GC-0; examples:

```text
home -> adapt/selective evidence; volatile promotions excluded
about -> parent_attributed/selective adaptation
showroom -> adapt with unconfirmed-hours lock
contact -> business_confirmation_required for conflicting parent contact values
residential -> adapt selectively for cabinet-relevant media/projects
commercial -> hold
kitchen cabinet sale/deals -> adapt structure/process, exclude promotions/SLAs
faq -> exclude source stone FAQ; retain UI/content-domain concept only
services -> exclude countertop repair fee content
```

- [ ] **Step 3: Write the human-readable source-page matrix**

`GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md` must include a table with:

```text
Source URL | Surface | Status | Oakwell action | Target CMS domain | Attribution | Key risks/notes
```

Keep source findings factual. Do not rewrite final Oakwell marketing copy in GC-1.

- [ ] **Step 4: Run the contract**

```bash
npm run smoke:gc1-source-manifest
```

Expected: still FAIL if content/media/conflict arrays are not yet complete; page-reference/schema checks must pass.

- [ ] **Step 5: Commit page inventory**

```bash
git add modulex-store/docs/granite-center/gc1-source-manifest.json modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md
git commit -m "docs(store): inventory Granite Center source pages"
```

---

### Task 3: Classify business/content candidates against GC-0

**Files:**
- Modify: `modulex-store/docs/granite-center/gc1-source-manifest.json`
- Modify: `modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md`

**Interfaces:**
- Consumes: `pages[]` ids from Task 2.
- Produces: `contentCandidates[]` and `conflicts[]` suitable for later structured-domain implementation/import planning.

- [ ] **Step 1: Inventory identity/contact/location evidence without changing Oakwell truth**

Record source evidence for phone variants, address variants, fax, hours and service-area wording as candidates/conflicts. The GC-0 canonical Oakwell values remain authoritative; parent values are evidence only.

Phone/address/hours source literals may appear inside the documentation/manifest as provenance. They must not be introduced into runtime components/configuration.

- [ ] **Step 2: Inventory reusable cabinet-focused content structures**

Create candidates for:

```text
brand relationship/about context
showroom introduction and "what you can see" concepts
project/design consultation concepts
Pre-Design Meeting
Preliminary Design Meeting
3D Design Presentation / modifications / finalization
Installation process wording as parent-source evidence only until Oakwell service claim is approved
soft-close / plywood-box / dovetail construction themes where they are product-truthful
cabinet-brand context where Oakwell actually carries the brand
residential kitchen / vanity project candidates
navigation/footer concepts
SEO topic candidates
```

Mark volatile claims such as discounts, "free" promises, 24-hour design, turnaround times, guarantees, "since 2011" as required by GC-0 instead of silently adapting them.

- [ ] **Step 3: Inventory form concepts**

Map useful Wufoo/source form concepts to `store_form_configuration` planning domain:

```text
project type
showroom/design consultation intent
address/city/ZIP context
desired consultation date preference
project notes
```

Record existing native Oakwell fields (name/email/phone/privacy/marketing/UTM) as `already_supported`, not as new migration requirements. Keep customer file upload out of initial migration per GC-0.

- [ ] **Step 4: Inventory FAQ/reviews/social proof decisions**

Record the stone FAQ as `exclude` for content but flag a future cabinetry FAQ domain as required by GC-6. Parent testimonials/reviews must be `parent_attributed` or `hold`; never classify them as Oakwell reviews.

- [ ] **Step 5: Add the conflict register**

At minimum the human document and JSON must preserve these conflict classes:

```text
parent phone variants vs Oakwell canonical phone
parent address variants vs Oakwell canonical address
parent hours without canonical Oakwell hours field
parent VA/MD/DC service-area claim without Oakwell confirmation
parent founding/history claims vs Oakwell brand history
parent installation/free-design/SLA/promotional claims vs unconfirmed Oakwell promise
parent reviews/projects vs Oakwell-specific attribution
```

- [ ] **Step 6: Run the contract**

```bash
npm run smoke:gc1-source-manifest
```

Expected: all content and conflict schema checks pass; media completion may still keep the overall gate RED.

- [ ] **Step 7: Commit content classification**

```bash
git add modulex-store/docs/granite-center/gc1-source-manifest.json modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md
git commit -m "docs(store): classify Granite Center content candidates"
```

---

### Task 4: Inventory media candidates without pretending GC-2 verification has happened

**Files:**
- Modify: `modulex-store/docs/granite-center/gc1-source-manifest.json`
- Modify: `modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md`

**Interfaces:**
- Consumes: source-page ids and content classifications.
- Produces: `mediaCandidates[]` grouped for GC-2 acquisition/deduplication/optimization.

- [ ] **Step 1: Discover source media references from approved pages**

Prefer actual source asset URLs exposed by page markup/search/browser inspection. Do not invent a media URL from an image label.

- [ ] **Step 2: Classify each candidate by cabinetry relevance**

Use these rules:

```text
showroom/display imagery -> high when cabinet/showroom relevant
kitchen/cabinet/vanity project imagery -> high/medium after visual relevance review
countertop-only/granite-only media -> none/exclude for Oakwell core
commercial media -> hold unless cabinetry relevance is unambiguous and scope later changes
brand/product imagery -> hold/adapt only when the matching brand/product belongs to approved Oakwell catalog scope
plugin/widget/decorative artifacts -> exclude
```

- [ ] **Step 3: Preserve unknown byte-level metadata as null**

GC-1 may record source URL, page, source alt text, subject and qualitative relevance. Unless bytes have actually been downloaded and inspected, use:

```json
{
  "width": null,
  "height": null,
  "bytes": null,
  "mimeType": null,
  "sha256": null
}
```

GC-2 is responsible for download, SHA-256 dedupe, optional perceptual dedupe, dimensions, EXIF/GPS stripping, optimization and Supabase Storage upload.

- [ ] **Step 4: Add media-group summary to the human manifest**

Summarize counts by:

```text
showroom
residential kitchen
vanity/bath cabinetry
commercial hold
cabinet brand/product context
countertop-only excluded
other excluded
```

Do not claim exact file-size savings or final dimensions in GC-1.

- [ ] **Step 5: Run the GREEN contract**

```bash
npm run smoke:gc1-source-manifest
```

Expected: PASS once pages/content/media/conflicts are non-empty and all references/enums/invariants validate.

- [ ] **Step 6: Commit media inventory**

```bash
git add modulex-store/docs/granite-center/gc1-source-manifest.json modulex-store/docs/granite-center/GC1_SOURCE_CONTENT_MEDIA_MANIFEST.md
git commit -m "docs(store): inventory Granite Center media candidates"
```

---

### Task 5: Synchronize governance docs and roadmaps

**Files:**
- Modify: `modulex-store/docs/GC0_BUSINESS_TRUTH_LOCK.md`
- Modify: `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`
- Modify: `modulex-store/STORE_ROADMAP.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Consumes: approved dynamic-content architecture and complete GC-1 manifest.
- Produces: one consistent operational next-action state across Store/Admin/Granite workstream.

- [ ] **Step 1: Amend GC-0 data ownership rule**

Add a permanent lock stating:

```text
Mutable production business content and media are data-owned, not code-owned.
Admin is the management surface.
Supabase DB/Storage is the controlled source.
Store consumes published/public projections.
Granite Center values and media URLs are migration evidence, never runtime constants/backends.
```

Clarify that current single-value fields may be compatibility sources until structured domains are introduced, but new parent-source phone/hours/etc. must not be hard-coded.

- [ ] **Step 2: Align the Granite migration roadmap**

Link the approved design and this plan. Keep GC-2 through GC-8 sequential. State that each package gets its own implementation plan/review before code/schema work when the package introduces a new domain.

- [ ] **Step 3: Update Store roadmap**

Re-read current `main` immediately before the edit so parallel PRs are not overwritten. Preserve the existing Gallery `[~]` blocker and Package D ordering. Record:

```text
dynamic-content architecture approved
GC-0 merged and ownership amendment accepted
GC-1 complete after manifest contract passes
GC-2 media library/optimization is next
GC-5 may close Gallery content acceptance only after approved real data is published/live accepted
```

Update `Main baseline` to the actual package base SHA.

- [ ] **Step 4: Update Admin roadmap**

Re-read current `main` immediately before the edit. Preserve the active A0 work and record only the cross-roadmap CMS impact:

```text
Admin owns all mutable Store business content introduced by Granite migration
new domains are added incrementally in GC packages
A4 Store CMS / A5 Company Settings are the affected roadmap areas
no manual-SQL-only content administration is acceptable at final exit
```

Update `Main baseline` to the actual package base SHA when appropriate.

- [ ] **Step 5: Commit governance synchronization**

```bash
git add modulex-store/docs/GC0_BUSINESS_TRUTH_LOCK.md modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md modulex-store/STORE_ROADMAP.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: align roadmaps with dynamic content ownership"
```

---

### Task 6: Final verification and reviewed PR

**Files:**
- All files changed by Tasks 1-5.

**Interfaces:**
- Produces: merge-ready GC-1 PR with no production mutation.

- [ ] **Step 1: Re-read latest `main` and reconcile parallel work**

Before final verification, compare the branch with latest `main`. If parallel PRs landed, rebase/merge latest `main` first, then re-read both roadmaps and resolve by preserving both workstreams rather than replacing the other branch's status.

- [ ] **Step 2: Run deterministic checks**

From `modulex-store`:

```bash
npm run smoke:gc1-source-manifest
npm run lint
```

Expected:

```text
GC-1 manifest contract: PASS
lint: 0 errors (existing unrelated warnings may remain and must be reported exactly)
```

A production build is optional for a docs/JSON/Node-contract-only GC-1 package if no runtime import touches the Next.js build graph; if `package.json` or scripts create any build risk, run `npm run build` as well.

- [ ] **Step 3: Review source/manifest consistency manually**

Verify:

```text
every content/media sourcePageId exists
every reviewed source page has a final Oakwell action
no conflict is auto-adapted
no parent review is labeled Oakwell
no countertop-only media is an Oakwell-core adapt candidate
no unverified size/dimension/checksum is presented as verified
no raw Granite asset is described as the final production delivery URL
GC-0 exclusions remain exclusions/holds
```

- [ ] **Step 4: Inspect net diff**

The final GC-1 PR should contain only documentation, manifest JSON, its validation script, `package.json` script wiring, and roadmap/governance updates. It must contain no Supabase migration, no production DB writes, no Admin/Store runtime rendering changes, and no imported binary media.

- [ ] **Step 5: Open a non-draft PR**

Suggested title:

```text
docs(store): complete GC-1 source content and media manifest
```

PR body must report:

```text
source audit date
number of reviewed pages
content candidate count by action
media candidate count by action/relevance
conflict count
contract/lint/build evidence actually run
explicit no-production-mutation scope
next package: GC-2 media library + optimization pipeline
```

Do not merge automatically.

---

## Plan Self-Review

### Spec coverage

- Admin → Supabase → controlled RPC → Store ownership rule: Task 5 governance sync; later implementation explicitly deferred to GC-2+ because GC-1 does not mutate production.
- Structured hybrid CMS rather than generic page builder: manifest `targetDomain` mapping and governance docs.
- Media ownership/provenance: Task 4.
- Draft/review/publish lifecycle: source classification recorded in GC-1; no publication performed.
- Attribution: Tasks 3-4 contract fields/invariants.
- Hard-code prohibition: Global Constraints + Task 5 GC-0 amendment.
- Fail-closed business truth: Tasks 2-3 conflict/action rules.
- Incremental typed domains: target-domain planning names explicitly do not authorize schema creation.
- Parallel-PR safety: Global Constraints + Task 5/6 latest-main reread requirement.

### Placeholder scan

No implementation step contains `TBD`, `TODO`, “similar to”, or an unspecified “add tests” instruction. Unknown source URLs and byte-level media metadata are explicitly resolved from live source or kept null rather than guessed.

### Type consistency

The page/content/media/conflict records, allowed enums, target-domain names and script invariants are defined once in this plan and used consistently across all tasks.
