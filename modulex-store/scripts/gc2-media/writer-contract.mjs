import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const writer = await import("./lib/supabase-writer.mjs");
const cli = await import("./import.mjs");

assert.throws(() => writer.resolveSupabaseCredentials({}), /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SECRET_KEY/i);
assert.deepEqual(
  writer.resolveSupabaseCredentials({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret-key" }),
  { url: "https://example.supabase.co", key: "secret-key", keySource: "SUPABASE_SECRET_KEY" },
);
assert.equal(
  writer.resolveSupabaseCredentials({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "legacy-key" }).keySource,
  "SUPABASE_SERVICE_ROLE_KEY",
);

const sourceBytes = await sharp({
  create: { width: 640, height: 480, channels: 3, background: { r: 100, g: 120, b: 140 } },
}).png().toBuffer();
const optimizedBytes = await sharp(sourceBytes).webp({ quality: 80 }).toBuffer();
const processed = {
  original: { sha256: "a".repeat(64), bytes: sourceBytes.length, width: 640, height: 480, format: "png" },
  optimized: { sha256: "b".repeat(64), bytes: optimizedBytes.length, width: 640, height: 480, mimeType: "image/webp" },
  optimizedBytes,
};
const candidate = {
  id: "media-contract-01",
  label: "Contract media",
  subject: "kitchen",
  oakwellAction: "parent_attributed",
  cabinetRelevance: "relevant",
  sourceUrl: "https://granitecenterva.com/wp-content/uploads/contract.png",
  sourcePageId: "page-home",
  attributionRequired: true,
  notes: "contract fixture",
};
const sourceInfo = {
  bytes: sourceBytes,
  finalUrl: candidate.sourceUrl,
  contentType: "image/png",
  filename: "contract.png",
};

const duplicateEvents = [];
const duplicateGateway = {
  async findAssetByOriginalSha() { return { id: "asset-existing" }; },
  async uploadStaging() { duplicateEvents.push("upload"); throw new Error("duplicate must not upload"); },
  async insertAsset() { duplicateEvents.push("insert"); throw new Error("duplicate must not insert"); },
  async upsertProvenance(row) { duplicateEvents.push(["provenance", row.media_asset_id]); },
  async removeStaging() { duplicateEvents.push("remove"); },
};
const duplicateResult = await writer.registerAsset({
  gateway: duplicateGateway,
  candidate,
  sourceInfo,
  processed,
  runId: "run-contract",
  sourceBrand: "Granite & Cabinet Center",
  sourcePageUrl: "https://granitecenterva.com/",
});
assert.equal(duplicateResult.status, "duplicate");
assert.equal(duplicateResult.assetId, "asset-existing");
assert.deepEqual(duplicateEvents, [["provenance", "asset-existing"]], "duplicate path must perform zero uploads and only upsert provenance");

const uploads = [];
const insertedAssets = [];
const provenanceRows = [];
const removals = [];
const newGateway = {
  async findAssetByOriginalSha() { return null; },
  async uploadStaging(pathname, bytes, contentType) { uploads.push({ pathname, bytes: bytes.length, contentType }); },
  async insertAsset(row) { insertedAssets.push(row); return { ...row, id: "asset-new" }; },
  async upsertProvenance(row) { provenanceRows.push(row); },
  async removeStaging(paths) { removals.push(paths); },
};
const newResult = await writer.registerAsset({
  gateway: newGateway,
  candidate,
  sourceInfo,
  processed,
  runId: "run-contract",
  sourceBrand: "Granite & Cabinet Center",
  sourcePageUrl: "https://granitecenterva.com/",
});
assert.equal(newResult.status, "created");
assert.equal(newResult.assetId, "asset-new");
assert.equal(uploads.length, 2, "new asset must upload original + optimized staging objects");
assert.match(uploads[0].pathname, /^imports\/granite\/run-contract\/media-contract-01\/original\.png$/);
assert.match(uploads[1].pathname, /^imports\/granite\/run-contract\/media-contract-01\/optimized\.webp$/);
assert.equal(insertedAssets[0].status, "review");
assert.equal(insertedAssets[0].public_bucket, null);
assert.equal(insertedAssets[0].public_path, null);
assert.equal(insertedAssets[0].published_at, null);
assert.equal(insertedAssets[0].attribution_classification, "parent_attributed");
assert.equal(insertedAssets[0].cabinet_relevance, "relevant");
assert.equal(provenanceRows[0].media_asset_id, "asset-new");
assert.equal(provenanceRows[0].source_candidate_id, candidate.id);
assert.equal(removals.length, 0);

const rollbackRemovals = [];
const rollbackGateway = {
  async findAssetByOriginalSha() { return null; },
  async uploadStaging() {},
  async insertAsset() { throw new Error("db insert failed"); },
  async upsertProvenance() {},
  async removeStaging(paths) { rollbackRemovals.push(paths); },
};
await assert.rejects(
  writer.registerAsset({ gateway: rollbackGateway, candidate, sourceInfo, processed, runId: "run-contract" }),
  /db insert failed/,
);
assert.equal(rollbackRemovals.length, 1);
assert.equal(rollbackRemovals[0].length, 2, "DB failure must roll back only the two objects created by this attempt");

assert.deepEqual(
  cli.parseArgs(["--candidate", "a", "--candidate", "b", "--include-hold", "--dry-run", "--report", "out.json"]),
  { candidateIds: ["a", "b"], includeHold: true, dryRun: true, reportPath: "out.json" },
);
assert.throws(() => cli.parseArgs(["--publish"]), /GC-2 importer cannot publish media\./);
assert.throws(() => cli.parseArgs(["--unknown"]), /Unknown argument/);

let credentialGuardFetches = 0;
await assert.rejects(
  cli.runImport({
    argv: ["--candidate", "media-contract-01"],
    env: {},
    manifest: { source: { brand: "Granite & Cabinet Center" }, pages: [], mediaCandidates: [candidate] },
    fetchImpl: async () => { credentialGuardFetches += 1; throw new Error("must not fetch"); },
    reportWriter: async () => {},
  }),
  /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SECRET_KEY/i,
);
assert.equal(credentialGuardFetches, 0, "missing DB credentials must fail before any network download");

const dryRunReport = await cli.runImport({
  argv: ["--candidate", "media-contract-01", "--dry-run", "--report", path.join(tmpdir(), "gc2-contract-report.json")],
  env: {},
  manifest: { source: { brand: "Granite & Cabinet Center" }, pages: [], mediaCandidates: [candidate] },
  fetchImpl: async () => new Response(sourceBytes, { status: 200, headers: { "content-type": "image/png" } }),
  reportWriter: async () => {},
  now: () => new Date("2026-08-29T15:00:00.000Z"),
});
assert.equal(dryRunReport.mode, "dry-run");
assert.equal(dryRunReport.entries.length, 1);
assert.equal(dryRunReport.entries[0].status, "dry_run");
assert.equal(dryRunReport.entries[0].optimized.mimeType, "image/webp");

console.log("GC-2 media writer/CLI contract: PASS");
