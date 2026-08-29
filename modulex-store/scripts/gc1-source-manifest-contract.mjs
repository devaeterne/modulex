import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const manifestPath = path.resolve(__dirname, "../docs/granite-center/gc1-source-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const PAGE_STATUSES = new Set(["reviewed", "unavailable", "redirected", "blocked"]);
const ACTIONS = new Set(["adapt", "parent_attributed", "hold", "exclude", "business_confirmation_required"]);
const TARGET_DOMAINS = new Set([
  "general_settings",
  "company_contact_channels",
  "company_locations",
  "company_location_hours",
  "store_pages",
  "store_projects",
  "store_project_media",
  "store_media_assets",
  "store_faq",
  "store_reviews",
  "store_navigation",
  "store_footer",
  "store_form_configuration",
  "none",
]);
const CONTENT_KINDS = new Set([
  "identity",
  "contact",
  "location",
  "hours",
  "service_area",
  "history_claim",
  "marketing_claim",
  "process",
  "faq",
  "review",
  "project",
  "form_field",
  "navigation",
  "footer",
  "seo",
  "product_brand_context",
  "other",
]);
const ATTRIBUTIONS = new Set(["oakwell", "parent_required", "rewrite_for_oakwell", "not_public", "unresolved"]);
const MEDIA_KINDS = new Set(["image", "video", "panorama", "other"]);
const RELEVANCE = new Set(["high", "medium", "low", "none", "unknown"]);

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.source?.brand, "Granite & Cabinet Center");
assert.equal(manifest.source?.origin, "https://granitecenterva.com/");
assert.match(manifest.source?.auditedAt ?? "", /^\d{4}-\d{2}-\d{2}$/);
for (const key of ["pages", "contentCandidates", "mediaCandidates", "conflicts"]) {
  assert.ok(Array.isArray(manifest[key]), `${key} must be an array`);
}
assert.ok(manifest.pages.length > 0, "GC-1 must inventory at least one source page");
assert.ok(manifest.contentCandidates.length > 0, "GC-1 must classify content candidates");
assert.ok(manifest.mediaCandidates.length > 0, "GC-1 must classify media candidates");
assert.ok(manifest.conflicts.length > 0, "GC-1 must preserve source conflicts");

function assertUniqueIds(records, label) {
  const ids = new Set();
  for (const record of records) {
    assert.equal(typeof record.id, "string", `${label} id must be a string`);
    assert.ok(record.id.length > 0, `${label} id must not be empty`);
    assert.ok(!ids.has(record.id), `${label} duplicate id: ${record.id}`);
    ids.add(record.id);
  }
}

function assertGraniteUrl(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  const url = new URL(value);
  assert.equal(url.protocol, "https:", `${label} must use https`);
  assert.ok(
    url.hostname === "granitecenterva.com" || url.hostname.endsWith(".granitecenterva.com"),
    `${label} must stay on granitecenterva.com`,
  );
}

assertUniqueIds(manifest.pages, "page");
assertUniqueIds(manifest.contentCandidates, "content candidate");
assertUniqueIds(manifest.mediaCandidates, "media candidate");
assertUniqueIds(manifest.conflicts, "conflict");

const pageIds = new Set(manifest.pages.map((page) => page.id));
for (const page of manifest.pages) {
  assertGraniteUrl(page.url, `${page.id}.url`);
  assertGraniteUrl(page.canonicalUrl, `${page.id}.canonicalUrl`);
  assert.ok(PAGE_STATUSES.has(page.crawlStatus), `${page.id}: invalid crawlStatus`);
  assert.ok(ACTIONS.has(page.oakwellAction), `${page.id}: invalid oakwellAction`);
  assert.ok(TARGET_DOMAINS.has(page.targetDomain), `${page.id}: invalid targetDomain`);
}

for (const candidate of manifest.contentCandidates) {
  assert.ok(pageIds.has(candidate.sourcePageId), `${candidate.id}: unknown sourcePageId`);
  assert.ok(CONTENT_KINDS.has(candidate.kind), `${candidate.id}: invalid kind`);
  assert.ok(ACTIONS.has(candidate.oakwellAction), `${candidate.id}: invalid oakwellAction`);
  assert.ok(TARGET_DOMAINS.has(candidate.targetDomain), `${candidate.id}: invalid targetDomain`);
  assert.ok(ATTRIBUTIONS.has(candidate.attribution), `${candidate.id}: invalid attribution`);
  assert.equal(
    typeof candidate.businessConfirmationRequired,
    "boolean",
    `${candidate.id}: businessConfirmationRequired must be boolean`,
  );
  assert.ok(Array.isArray(candidate.reasons) && candidate.reasons.length > 0, `${candidate.id}: reasons required`);
  assert.ok(
    Array.isArray(candidate.sourceEvidence) && candidate.sourceEvidence.length > 0,
    `${candidate.id}: sourceEvidence required`,
  );
  for (const sourceUrl of candidate.sourceEvidence) {
    assertGraniteUrl(sourceUrl, `${candidate.id}.sourceEvidence`);
  }
  assert.ok(
    candidate.oakwellAction !== "adapt" || candidate.attribution !== "unresolved",
    `${candidate.id}: adaptable content cannot have unresolved attribution`,
  );
}

for (const candidate of manifest.mediaCandidates) {
  assert.ok(pageIds.has(candidate.sourcePageId), `${candidate.id}: unknown sourcePageId`);
  assertGraniteUrl(candidate.sourceUrl, `${candidate.id}.sourceUrl`);
  assert.ok(MEDIA_KINDS.has(candidate.mediaKind), `${candidate.id}: invalid mediaKind`);
  assert.ok(ACTIONS.has(candidate.oakwellAction), `${candidate.id}: invalid oakwellAction`);
  assert.ok(TARGET_DOMAINS.has(candidate.targetDomain), `${candidate.id}: invalid targetDomain`);
  assert.ok(RELEVANCE.has(candidate.cabinetRelevance), `${candidate.id}: invalid cabinetRelevance`);
  assert.ok(ATTRIBUTIONS.has(candidate.attribution), `${candidate.id}: invalid attribution`);
  assert.equal(typeof candidate.verifiedMetadata, "object", `${candidate.id}: verifiedMetadata required`);
  for (const field of ["width", "height", "bytes", "mimeType", "sha256"]) {
    assert.equal(
      candidate.verifiedMetadata[field],
      null,
      `${candidate.id}: ${field} must remain null until GC-2 byte verification`,
    );
  }
}

for (const conflict of manifest.conflicts) {
  assert.equal(typeof conflict.topic, "string", `${conflict.id}: topic required`);
  assert.ok(
    Array.isArray(conflict.sourcePageIds) && conflict.sourcePageIds.length > 0,
    `${conflict.id}: sourcePageIds required`,
  );
  for (const pageId of conflict.sourcePageIds) {
    assert.ok(pageIds.has(pageId), `${conflict.id}: unknown page ${pageId}`);
  }
  assert.ok(
    Array.isArray(conflict.observedValues) && conflict.observedValues.length > 0,
    `${conflict.id}: observedValues required`,
  );
  assert.equal(typeof conflict.gc0Rule, "string", `${conflict.id}: gc0Rule required`);
  assert.ok(ACTIONS.has(conflict.resolution), `${conflict.id}: invalid resolution`);
  assert.notEqual(conflict.resolution, "adapt", `${conflict.id}: conflicts cannot auto-adapt into Oakwell`);
  assert.equal(
    typeof conflict.publicMigrationAllowed,
    "boolean",
    `${conflict.id}: publicMigrationAllowed must be boolean`,
  );
}

console.log(
  `GC-1 manifest contract: PASS (${manifest.pages.length} pages, ${manifest.contentCandidates.length} content, ${manifest.mediaCandidates.length} media, ${manifest.conflicts.length} conflicts)`,
);
