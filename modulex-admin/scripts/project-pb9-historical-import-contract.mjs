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

const migration = read("modulex-store/supabase/migrations/20260908043000_customer_project_historical_import.sql");
const addressMigration = read("modulex-store/supabase/migrations/20260908093000_customer_project_historical_address_snapshot.sql");
const extractor = read("modulex-admin/scripts/project-import/project_excel_extract.py");
const importer = read("modulex-admin/scripts/project-import/historical-project-import.mjs");

for (const table of ["customer_project_import_batches", "customer_project_import_rows"]) {
  assert.match(migration, new RegExp(`create table (?:if not exists )?public\\.${table}`, "i"), `${table} must exist`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must use RLS`);
}

assert.match(migration, /source_sha256[^\n]*check[^\n]*64/i, "batch source SHA-256 must be validated");
assert.match(migration, /unique\s*\(\s*source_sha256\s*\)/i, "source SHA must make file staging idempotent");
assert.match(migration, /row_sha256[^\n]*check[^\n]*64/i, "row SHA-256 must be validated");
assert.match(migration, /unique\s*\(\s*batch_id\s*,\s*row_sha256\s*\)/i, "row hashes must be unique per batch");
assert.match(migration, /customer_id\s+uuid/i, "Customer mapping must be explicit");
assert.match(migration, /sales_rep_id\s+uuid/i, "Sales Rep mapping must be explicit");
assert.match(migration, /customer_match_count/i, "Customer ambiguity must be recorded separately");
assert.match(migration, /sales_rep_match_count/i, "Sales Rep ambiguity must be recorded separately");
assert.match(migration, /legacy_initial_contract_price/i);
assert.match(migration, /legacy_price_after_change_orders/i);
assert.match(migration, /legacy_profit_margin/i);
assert.match(migration, /legacy_profit_margin_unit/i);

for (const fn of [
  "stage_customer_project_import",
  "set_customer_project_import_row_mapping",
  "get_customer_project_import_batch",
  "dry_run_customer_project_import",
  "commit_customer_project_import",
]) {
  assert.match(migration, new RegExp(`function public\\.${fn}`, "i"), `${fn} RPC must exist`);
}

assert.match(migration, /current_user_has_any_role\s*\(\s*array\[['"]super_admin['"]\s*,\s*['"]admin['"]\]/i, "PB-9 writes must be Admin/Super Admin only");
assert.match(migration, /pg_advisory_xact_lock/i, "stage/commit operations must serialize by import identity");
assert.match(migration, /extensions\.digest/i, "dry-run must use a deterministic SHA-256 fingerprint");
assert.match(migration, /expected_fingerprint/i, "commit must require the exact dry-run fingerprint");
assert.match(migration, /PROJECT_IMPORT_STALE_DRY_RUN/i, "stale dry-run commits must fail closed");
assert.match(migration, /PROJECT_IMPORT_UNRESOLVED_ROWS/i, "unresolved rows must block commit");
assert.match(migration, /PROJECT_IMPORT_ALREADY_COMMITTED/i, "re-commit must fail closed rather than duplicate Projects");
assert.match(migration, /legacy_profit_margin[^;]*customer_project_import_rows/is, "legacy margin must remain import evidence");
assert.doesNotMatch(migration, /insert\s+into\s+public\.customer_projects[\s\S]{0,900}legacy_profit_margin/i, "legacy Profit Margin must never populate canonical Project truth");
assert.doesNotMatch(migration, /insert\s+into\s+public\.customer_projects[\s\S]{0,900}legacy_(?:initial_contract_price|price_after_change_orders)/i, "legacy prices must never populate canonical Project truth");

for (const table of ["customer_project_import_batches", "customer_project_import_rows"]) {
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"), `${table} direct browser DML must be revoked`);
}

assert.match(addressMigration, /create or replace function private\.prepare_customer_project\s*\(\s*\)/i, "PB-9 address follow-up must harden the canonical Project prepare trigger");
assert.match(addressMigration, /historical_excel/i, "historical address snapshots must be explicitly marked");
assert.match(addressMigration, /legacy_text/i, "historical address text must be retained in the Project snapshot");
assert.match(addressMigration, /current_setting\s*\(\s*['"]modulex\.customer_project_import['"]\s*,\s*true\s*\)/i, "new historical snapshots must require the canonical import context");
assert.match(addressMigration, /set_config\s*\(\s*['"]modulex\.customer_project_import['"]\s*,\s*['"]on['"]\s*,\s*true\s*\)/i, "commit RPC must enable the historical snapshot context only transaction-locally");
assert.match(addressMigration, /project_address_snapshot\s*=\s*jsonb_build_object\s*\([\s\S]*['"]legacy_text['"][\s\S]*['"]source['"]\s*,\s*['"]historical_excel['"]/i, "commit RPC must persist the legacy address snapshot instead of silently losing it");
assert.doesNotMatch(addressMigration, /insert\s+into\s+public\.customer_addresses/i, "PB-9 must not invent canonical Customer Address rows from unstructured legacy text");

for (const header of [
  "Customer",
  "Project Name",
  "Project Address",
  "Start Date",
  "End Date",
  "Sales Rep",
  "Initial Contract Price",
  "Price After Change Orders",
  "Profit Margin",
]) {
  assert.match(extractor, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `extractor must recognize ${header}`);
}
assert.match(extractor, /zipfile/, "XLSX parser must not require a third-party Python package");
assert.match(extractor, /sharedStrings/i, "XLSX shared strings must be supported");
assert.match(extractor, /styles\.xml/i, "XLSX styles must be inspected for date/percent semantics");
assert.match(extractor, /--self-test/, "extractor must include a deterministic self-test");

assert.match(importer, /createHash\s*\(\s*["']sha256["']\s*\)/, "CLI must fingerprint the exact source file");
assert.match(importer, /project_excel_extract\.py/, "CLI must invoke the stdlib XLSX extractor");
assert.match(importer, /MODULEX_PROJECT_IMPORT_ACCESS_TOKEN/, "CLI must use an authenticated Admin token instead of service-role bypass");
assert.doesNotMatch(importer, /SUPABASE_SERVICE_ROLE/i, "PB-9 CLI must not bypass role checks with a service key");
assert.match(importer, /--commit/, "productive import must require an explicit commit switch");
assert.match(importer, /--fingerprint/, "productive import must require a prior dry-run fingerprint");
assert.match(importer, /commit requires --fingerprint/i, "CLI must fail closed when commit fingerprint is absent");
assert.match(importer, /dry_run_customer_project_import/, "default path must execute DB dry-run");
assert.match(importer, /stage_customer_project_import/, "normalized rows must be staged before dry-run");

console.log("PASS: PB-9 Historical Excel Import contract");
