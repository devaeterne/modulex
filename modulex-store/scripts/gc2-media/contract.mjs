import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { MAX_SOURCE_BYTES } from "./lib/types.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "../../docs/granite-center/gc1-source-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const selection = await import("./lib/select-candidates.mjs");

const selected = selection.selectCandidates(manifest);
assert.ok(selected.some((candidate) => candidate.id === "media-showroom-01"), "default selection must include media-showroom-01");
assert.ok(selected.every((candidate) => ["adapt", "parent_attributed"].includes(candidate.oakwellAction)), "default selection must include only eligible actions");
assert.equal(selection.classifyTargetLongEdge({ subject: "showroom" }), 2560);
assert.equal(selection.classifyTargetLongEdge({ subject: "kitchen" }), 1920);
assert.equal(selection.classifyTargetLongEdge({ subject: "general" }), 1600);

const holdCandidate = manifest.mediaCandidates.find((candidate) => candidate.oakwellAction === "hold");
if (holdCandidate) {
  assert.throws(() => selection.selectCandidates(manifest, { candidateIds: [holdCandidate.id] }), /includeHold/i);
  assert.deepEqual(selection.selectCandidates(manifest, { candidateIds: [holdCandidate.id], includeHold: true }).map((candidate) => candidate.id), [holdCandidate.id]);
}

assert.throws(() => selection.selectCandidates(manifest, { candidateIds: ["missing-candidate"] }), /unknown/i);
assert.throws(() => selection.selectCandidates(manifest, { candidateIds: ["media-showroom-01", "media-showroom-01"] }), /duplicate/i);

const imagePipeline = await import("./lib/image-pipeline.mjs");

const largeFixture = await sharp({
  create: { width: 3000, height: 2000, channels: 3, background: { r: 150, g: 110, b: 70 } },
})
  .jpeg({ quality: 90 })
  .withExif({ IFD0: { Copyright: "GC-2 contract fixture" } })
  .toBuffer();

const largeResult = await imagePipeline.processImage({ bytes: largeFixture, targetLongEdge: 1920 });
assert.equal(Math.max(largeResult.optimized.width, largeResult.optimized.height), 1920, "large image must be bounded to target long edge");
assert.equal(largeResult.optimized.mimeType, "image/webp");
assert.match(largeResult.original.sha256, /^[0-9a-f]{64}$/);
assert.match(largeResult.optimized.sha256, /^[0-9a-f]{64}$/);
assert.equal(imagePipeline.sha256(largeFixture), imagePipeline.sha256(Buffer.from(largeFixture)), "exact duplicates must hash identically");
const optimizedMetadata = await sharp(largeResult.optimizedBytes).metadata();
assert.equal(optimizedMetadata.format, "webp");
assert.equal(optimizedMetadata.exif, undefined, "optimized output must not retain EXIF metadata");

const smallFixture = await sharp({
  create: { width: 800, height: 600, channels: 3, background: { r: 90, g: 120, b: 150 } },
}).png().toBuffer();
const smallResult = await imagePipeline.processImage({ bytes: smallFixture, targetLongEdge: 1600 });
assert.deepEqual([smallResult.optimized.width, smallResult.optimized.height], [800, 600], "small images must never be upscaled");

await assert.rejects(
  imagePipeline.processImage({ bytes: Buffer.from("not an image"), targetLongEdge: 1600 }),
  /image|decode|metadata|unsupported/i,
);
await assert.rejects(
  imagePipeline.processImage({ bytes: Buffer.alloc(MAX_SOURCE_BYTES + 1), targetLongEdge: 1600 }),
  /20 mb|exceed|invalid/i,
);

const downloader = await import("./lib/download-source.mjs");
const sourceUrl = "https://granitecenterva.com/wp-content/uploads/test.jpg";

const successfulDownload = await downloader.downloadSource(sourceUrl, {
  fetchImpl: async () => new Response(Buffer.from("fixture-bytes"), {
    status: 200,
    headers: { "content-type": "image/jpeg", "content-length": "13" },
  }),
});
assert.equal(successfulDownload.bytes.toString(), "fixture-bytes");
assert.equal(successfulDownload.finalUrl, sourceUrl);
assert.equal(successfulDownload.contentType, "image/jpeg");
assert.equal(successfulDownload.filename, "test.jpg");

await assert.rejects(
  downloader.downloadSource("http://granitecenterva.com/test.jpg", { fetchImpl: async () => { throw new Error("must not fetch"); } }),
  /https/i,
);
await assert.rejects(
  downloader.downloadSource("https://example.com/test.jpg", { fetchImpl: async () => { throw new Error("must not fetch"); } }),
  /host|allow/i,
);
await assert.rejects(
  downloader.downloadSource(sourceUrl, {
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://example.com/escape.jpg" } }),
  }),
  /host|allow|redirect/i,
);
await assert.rejects(
  downloader.downloadSource(sourceUrl, {
    fetchImpl: async () => new Response(Buffer.from("x"), {
      status: 200,
      headers: { "content-length": String(MAX_SOURCE_BYTES + 1) },
    }),
  }),
  /20 mb|exceed/i,
);
await assert.rejects(
  downloader.downloadSource(sourceUrl, {
    fetchImpl: async () => new Response(Buffer.alloc(MAX_SOURCE_BYTES + 1), { status: 200 }),
  }),
  /20 mb|exceed/i,
);

let redirectCount = 0;
await assert.rejects(
  downloader.downloadSource(sourceUrl, {
    fetchImpl: async () => {
      redirectCount += 1;
      return new Response(null, { status: 302, headers: { location: `/redirect-${redirectCount}.jpg` } });
    },
  }),
  /redirect/i,
);
assert.equal(redirectCount, 6, "downloader must stop after five followed redirects");

console.log("GC-2 media importer contract: PASS");
