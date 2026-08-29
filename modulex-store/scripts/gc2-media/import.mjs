import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { selectCandidates, classifyTargetLongEdge } from "./lib/select-candidates.mjs";
import { downloadSource } from "./lib/download-source.mjs";
import { processImage } from "./lib/image-pipeline.mjs";
import { createSupabaseGatewayFromEnv, registerAsset } from "./lib/supabase-writer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = path.join(here, "../../docs/granite-center/gc1-source-manifest.json");
const DEFAULT_REPORT_PATH = path.join(here, "../../docs/granite-center/gc2-media-import-report.json");

function compactRunId(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function loadManifest() {
  return JSON.parse(await readFile(DEFAULT_MANIFEST_PATH, "utf8"));
}

async function defaultReportWriter(reportPath, report) {
  const absolutePath = path.resolve(reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function parseArgs(argv) {
  const result = {
    candidateIds: [],
    includeHold: false,
    dryRun: false,
    reportPath: DEFAULT_REPORT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--publish") {
      throw new Error("GC-2 importer cannot publish media.");
    }
    if (arg === "--include-hold") {
      result.includeHold = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--candidate") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--candidate requires an ID.");
      result.candidateIds.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--candidate=")) {
      const value = arg.slice("--candidate=".length);
      if (!value) throw new Error("--candidate requires an ID.");
      result.candidateIds.push(value);
      continue;
    }
    if (arg === "--report") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--report requires a path.");
      result.reportPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--report=")) {
      const value = arg.slice("--report=".length);
      if (!value) throw new Error("--report requires a path.");
      result.reportPath = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

export async function runImport({
  argv = process.argv.slice(2),
  env = process.env,
  manifest = null,
  fetchImpl = fetch,
  reportWriter = defaultReportWriter,
  now = () => new Date(),
  createGateway = createSupabaseGatewayFromEnv,
} = {}) {
  const options = parseArgs(argv);
  const sourceManifest = manifest || await loadManifest();

  // Non-dry runs must prove privileged DB credentials before any source network I/O.
  const gateway = options.dryRun ? null : createGateway(env);
  const candidates = selectCandidates(sourceManifest, {
    candidateIds: options.candidateIds,
    includeHold: options.includeHold,
  });

  const startedAt = now();
  const runId = compactRunId(startedAt);
  const pagesById = new Map((sourceManifest.pages || []).map((page) => [page.id, page]));
  const report = {
    schemaVersion: 1,
    runId,
    mode: options.dryRun ? "dry-run" : "staging-import",
    sourceBrand: sourceManifest.source?.brand || null,
    sourceOrigin: sourceManifest.source?.origin || null,
    startedAt: startedAt.toISOString(),
    candidateCount: candidates.length,
    entries: [],
  };

  for (const candidate of candidates) {
    try {
      const sourceInfo = await downloadSource(candidate.sourceUrl, { fetchImpl });
      const processed = await processImage({
        bytes: sourceInfo.bytes,
        targetLongEdge: classifyTargetLongEdge(candidate),
      });
      const sourcePage = pagesById.get(candidate.sourcePageId);
      const sourcePageUrl = sourcePage?.canonicalUrl || sourcePage?.url || null;

      if (options.dryRun) {
        report.entries.push({
          candidateId: candidate.id,
          sourcePageId: candidate.sourcePageId || null,
          sourceUrl: candidate.sourceUrl,
          finalSourceUrl: sourceInfo.finalUrl,
          oakwellAction: candidate.oakwellAction,
          status: "dry_run",
          original: processed.original,
          optimized: processed.optimized,
        });
        continue;
      }

      const registration = await registerAsset({
        gateway,
        candidate,
        sourceInfo,
        processed,
        runId,
        sourceBrand: sourceManifest.source?.brand || null,
        sourcePageUrl,
      });
      report.entries.push({
        candidateId: candidate.id,
        sourcePageId: candidate.sourcePageId || null,
        sourceUrl: candidate.sourceUrl,
        finalSourceUrl: sourceInfo.finalUrl,
        oakwellAction: candidate.oakwellAction,
        status: registration.status,
        assetId: registration.assetId,
        original: processed.original,
        optimized: processed.optimized,
        stagingOriginalPath: registration.originalPath || null,
        stagingOptimizedPath: registration.optimizedPath || null,
      });
    } catch (error) {
      report.entries.push({
        candidateId: candidate.id,
        sourcePageId: candidate.sourcePageId || null,
        sourceUrl: candidate.sourceUrl,
        oakwellAction: candidate.oakwellAction,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  report.completedAt = now().toISOString();
  report.summary = report.entries.reduce((summary, entry) => {
    summary[entry.status] = (summary[entry.status] || 0) + 1;
    return summary;
  }, {});
  await reportWriter(options.reportPath, report);

  const failures = report.entries.filter((entry) => entry.status === "error");
  if (failures.length > 0) {
    const error = new Error(`GC-2 media import completed with ${failures.length} candidate error(s).`);
    error.report = report;
    throw error;
  }

  return report;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const report = await runImport();
    console.log(`GC-2 media ${report.mode}: ${report.entries.length} candidate(s) processed.`);
    console.log(JSON.stringify(report.summary));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
