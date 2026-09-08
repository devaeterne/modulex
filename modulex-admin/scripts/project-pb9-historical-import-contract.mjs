import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adminRoot = process.cwd();
const repoRoot = path.resolve(adminRoot, "..");

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolute), `PB-9 required file missing: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

const migration = read("modulex-store/supabase/migrations/20260908031500_customer_project_historical_import.sql");

for (const table of ["project_historical_import_batches", "project_historical_import_rows"]) {
  assert.match(migration, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"), `${table} must exist`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS`);
}

assert.match(migration, /source_file_sha256\s+text\s+not null/i, "batch must retain exact source-file hash");
assert.match(migration, /source_row_number\s+integer\s+not null/i, "row provenance must retain source row number");
assert.match(migration, /source_row_hash\s+text\s+not null/i, "row provenance must retain deterministic row hash");
assert.match(migration, /raw_row\s+jsonb\s+not null/i, "raw source row must remain immutable evidence");
assert.match(migration, /source_profit_margin/i, "legacy Profit Margin must be retained only as reconciliation evidence");
assert.match(migration, /unique\s*\(\s*source_file_sha256\s*,\s*sheet_name\s*\)/i, "same workbook sheet must be idempotent");
assert.match(migration, /unique\s*\(\s*batch_id\s*,\s*source_row_number\s*\)/i, "same source row must not be staged twice");

for (const rpc of [
  "stage_customer_project_historical_import",
  "analyze_customer_project_historical_import",
  "set_customer_project_historical_import_row_mapping",
  "dry_run_customer_project_historical_import",
  "commit_customer_project_historical_import",
]) {
  assert.match(migration, new RegExp(`public\\.${rpc}`), `${rpc} must exist`);
}

assert.match(migration, /private\.require_project_historical_import_manage\s*\(\s*\)/, "all PB-9 mutation/read workflows must share an Admin guard");
assert.match(migration, /super_admin[\s\S]*admin/i, "PB-9 import must be Admin/Super Admin only");
assert.doesNotMatch(migration, /array\[[^\]]*['\"]sales['\"]/i, "Sales must not receive historical import mutation ownership");
assert.match(migration, /private\.create_customer_project\s*\(/, "commit must delegate canonical Project creation");
assert.match(migration, /dry_run_fingerprint/i, "commit must be bound to a reviewed dry-run fingerprint");
assert.match(migration, /match_status\s*=\s*'ready'/i, "only fully resolved rows may commit");
assert.match(migration, /customer_match_status/i, "Customer matching must be explicit");
assert.match(migration, /sales_rep_match_status/i, "Sales Rep matching must be explicit");
assert.match(migration, /ambiguous/i, "ambiguous matching must be represented explicitly");
assert.match(migration, /unmatched/i, "unmatched rows must be represented explicitly");
assert.match(migration, /source_sales_total/i, "legacy sales total must remain available for reconciliation");
assert.match(migration, /source_cost_total/i, "legacy cost total must remain available for reconciliation");
assert.doesNotMatch(migration, /insert\s+into\s+public\.customer_projects[\s\S]{0,800}source_profit_margin/i, "legacy Profit Margin must never populate canonical Project truth");

for (const role of ["public", "anon"]) {
  assert.match(migration, new RegExp(`revoke all on table public\\.project_historical_import_batches from ${role}`, "i"));
  assert.match(migration, new RegExp(`revoke all on table public\\.project_historical_import_rows from ${role}`, "i"));
}
assert.match(migration, /grant select on table public\.project_historical_import_batches to authenticated/i);
assert.match(migration, /grant select on table public\.project_historical_import_rows to authenticated/i);

const toolPackage = JSON.parse(read("tools/project-history-import/package.json"));
assert.equal(toolPackage.private, true, "PB-9 import tool must never be publishable as a package");
assert.equal(toolPackage.dependencies?.["@excel.js/exceljs"], "0.15.0", "PB-9 must pin the reviewed XLSX parser version");

const importer = read("tools/project-history-import/import.mjs");
assert.match(importer, /@excel\.js\/exceljs/, "PB-9 tool must read XLSX directly");
assert.match(importer, /createHash\s*\(\s*["']sha256["']\s*\)/, "PB-9 tool must hash the source workbook");
assert.match(importer, /source_row_hash/, "PB-9 tool must send deterministic row hashes");
assert.match(importer, /stage_customer_project_historical_import/, "PB-9 tool must stage before analysis/commit");
assert.match(importer, /analyze_customer_project_historical_import/, "PB-9 tool must run matching analysis");
assert.match(importer, /dry_run_customer_project_historical_import/, "PB-9 tool must require a dry-run");
assert.match(importer, /commit_customer_project_historical_import/, "PB-9 tool must use the explicit commit RPC");
assert.match(importer, /--commit/, "PB-9 tool must require an explicit commit flag");
assert.doesNotMatch(importer, /SERVICE_ROLE/i, "PB-9 CLI must not require a Supabase service-role credential");
assert.match(importer, /MODULEX_ACCESS_TOKEN/, "PB-9 CLI must use an authenticated operator token");

const mapping = read("tools/project-history-import/example-column-map.json");
for (const field of ["project_name", "customer_name", "customer_email", "sales_rep_name", "sales_rep_email", "source_sales_total", "source_cost_total", "source_profit_margin"]) {
  assert.match(mapping, new RegExp(`"${field}"`), `example column map must document ${field}`);
}

const readme = read("tools/project-history-import/README.md");
assert.match(readme, /dry-run/i);
assert.match(readme, /ambiguous/i);
assert.match(readme, /unmatched/i);
assert.match(readme, /Profit Margin/i);
assert.match(readme, /provenance/i);

console.log("PASS: PB-9 historical Excel import contract");
