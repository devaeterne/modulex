import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTOR = path.join(HERE, "project_excel_extract.py");
const ALLOWED_STATUSES = new Set(["draft", "quoted", "approved", "ordered", "in_progress", "completed", "cancelled"]);

function usage() {
  return `Usage:
  node scripts/project-import/historical-project-import.mjs <workbook.xlsx> [--sheet NAME] [--default-status STATUS] [--extract-only]
  node scripts/project-import/historical-project-import.mjs <workbook.xlsx> [--sheet NAME] [--default-status STATUS] --commit --fingerprint SHA256
  node scripts/project-import/historical-project-import.mjs --review-batch UUID
  node scripts/project-import/historical-project-import.mjs --map-row UUID --customer-id UUID [--sales-rep-id UUID] --status STATUS --note TEXT

Environment for DB modes:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  MODULEX_PROJECT_IMPORT_ACCESS_TOKEN  (authenticated Admin / Super Admin JWT)`;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

function parseArgs(argv) {
  const result = {
    file: null,
    sheet: null,
    defaultStatus: null,
    extractOnly: false,
    commit: false,
    fingerprint: null,
    reviewBatch: null,
    mapRow: null,
    customerId: null,
    salesRepId: null,
    status: null,
    note: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) fail(`Missing value for ${arg}`);
      return argv[index];
    };
    if (arg === "--sheet") result.sheet = next();
    else if (arg === "--default-status") result.defaultStatus = next().trim().toLowerCase();
    else if (arg === "--extract-only") result.extractOnly = true;
    else if (arg === "--commit") result.commit = true;
    else if (arg === "--fingerprint") result.fingerprint = next().trim().toLowerCase();
    else if (arg === "--review-batch") result.reviewBatch = next();
    else if (arg === "--map-row") result.mapRow = next();
    else if (arg === "--customer-id") result.customerId = next();
    else if (arg === "--sales-rep-id") result.salesRepId = next();
    else if (arg === "--status") result.status = next().trim().toLowerCase();
    else if (arg === "--note") result.note = next();
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg.startsWith("--")) fail(`Unknown option: ${arg}`);
    else if (result.file === null) result.file = arg;
    else fail(`Unexpected positional argument: ${arg}`);
  }
  return result;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(bufferOrText) {
  return crypto.createHash("sha256").update(bufferOrText).digest("hex");
}

function normalizedRowIdentity(row) {
  return {
    customer: row.customer ?? null,
    project_name: row.project_name ?? null,
    project_address: row.project_address ?? null,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    sales_rep: row.sales_rep ?? null,
    initial_contract_price: row.initial_contract_price ?? null,
    price_after_change_orders: row.price_after_change_orders ?? null,
    profit_margin: row.profit_margin ?? null,
    profit_margin_unit: row.profit_margin_unit ?? null,
  };
}

function extractWorkbook(file, sheet) {
  const args = [EXTRACTOR, file];
  if (sheet) args.push("--sheet", sheet);
  const run = spawnSync("python3", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (run.status !== 0) {
    fail(`XLSX extraction failed:\n${run.stderr || run.stdout}`);
  }
  try {
    return JSON.parse(run.stdout);
  } catch (error) {
    fail(`XLSX extractor returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createImportClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = process.env.MODULEX_PROJECT_IMPORT_ACCESS_TOKEN;
  if (!url || !anonKey || !accessToken) {
    fail("DB mode requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and MODULEX_PROJECT_IMPORT_ACCESS_TOKEN.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function rpc(supabase, name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) fail(`${name} failed: ${error.message}`);
  return data;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function runReviewMode(options) {
  const supabase = createImportClient();
  const data = await rpc(supabase, "get_customer_project_import_batch", { p_batch_id: options.reviewBatch });
  printJson(data);
}

async function runMappingMode(options) {
  if (!options.customerId || !options.status || !options.note) {
    fail("--map-row requires --customer-id, --status, and --note.");
  }
  if (!ALLOWED_STATUSES.has(options.status)) fail(`Invalid Project status: ${options.status}`);
  const supabase = createImportClient();
  const mapping = await rpc(supabase, "set_customer_project_import_row_mapping", {
    p_row_id: options.mapRow,
    p_customer_id: options.customerId,
    p_sales_rep_id: options.salesRepId,
    p_target_status: options.status,
    p_note: options.note,
  });
  const batchHint = { mapping };
  printJson(batchHint);
}

async function runWorkbookMode(options) {
  if (!options.file) fail(`Workbook path is required.\n${usage()}`);
  const file = path.resolve(options.file);
  if (!fs.existsSync(file)) fail(`Workbook not found: ${file}`);
  if (path.extname(file).toLowerCase() !== ".xlsx") fail("PB-9 importer accepts .xlsx files only.");
  if (options.defaultStatus && !ALLOWED_STATUSES.has(options.defaultStatus)) {
    fail(`Invalid --default-status: ${options.defaultStatus}`);
  }
  if (options.commit && !options.fingerprint) {
    fail("commit requires --fingerprint from a prior dry-run");
  }
  if (options.fingerprint && !/^[0-9a-f]{64}$/.test(options.fingerprint)) {
    fail("--fingerprint must be a lowercase 64-character SHA-256 value.");
  }

  const sourceBytes = fs.readFileSync(file);
  const sourceSha256 = sha256(sourceBytes);
  const extracted = extractWorkbook(file, options.sheet);
  if (!Array.isArray(extracted.rows) || extracted.rows.length === 0) fail("Workbook contains no importable Project rows.");

  const rows = extracted.rows.map((row) => ({
    ...row,
    target_status: options.defaultStatus,
    row_sha256: sha256(stableStringify(normalizedRowIdentity(row))),
  }));

  const extractionSummary = {
    source_name: path.basename(file),
    source_sha256: sourceSha256,
    sheet: extracted.sheet ?? options.sheet ?? null,
    row_count: rows.length,
    rows,
  };

  if (options.extractOnly) {
    if (options.commit) fail("--extract-only cannot be combined with --commit.");
    printJson(extractionSummary);
    return;
  }

  const supabase = createImportClient();
  const staged = await rpc(supabase, "stage_customer_project_import", {
    p_source_name: path.basename(file),
    p_source_sha256: sourceSha256,
    p_rows: rows,
  });
  const batchId = staged?.batch_id;
  if (!batchId) fail("stage_customer_project_import did not return batch_id.");

  const dryRun = await rpc(supabase, "dry_run_customer_project_import", { p_batch_id: batchId });
  const result = { staged, dry_run: dryRun };

  if (!options.commit) {
    printJson(result);
    return;
  }

  if (dryRun?.fingerprint !== options.fingerprint) {
    fail(`Provided fingerprint does not match the current dry-run. Current fingerprint: ${dryRun?.fingerprint ?? "missing"}`);
  }
  if (dryRun?.status !== "ready") {
    fail("Import is not ready. Resolve invalid/unmatched rows before commit.");
  }

  const committed = await rpc(supabase, "commit_customer_project_import", {
    p_batch_id: batchId,
    p_expected_fingerprint: options.fingerprint,
  });
  printJson({ ...result, committed });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.reviewBatch) {
    if (options.file || options.mapRow) fail("--review-batch cannot be combined with workbook or mapping modes.");
    await runReviewMode(options);
    return;
  }
  if (options.mapRow) {
    if (options.file) fail("--map-row cannot be combined with workbook mode.");
    await runMappingMode(options);
    return;
  }
  await runWorkbookMode(options);
}

main().catch((error) => {
  if (!process.exitCode) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
