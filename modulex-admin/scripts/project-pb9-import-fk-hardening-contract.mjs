import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..");
const migrationPath = path.join(
  repoRoot,
  "modulex-store/supabase/migrations/20260908103000_customer_project_import_fk_hardening.sql",
);

assert.ok(fs.existsSync(migrationPath), "PB-9 FK hardening migration must exist");
const migration = fs.readFileSync(migrationPath, "utf8");

for (const [indexName, column] of [
  ["customer_project_import_batches_committed_by_idx", "committed_by"],
  ["customer_project_import_batches_created_by_idx", "created_by"],
  ["customer_project_import_batches_updated_by_idx", "updated_by"],
]) {
  assert.match(
    migration,
    new RegExp(`create\\s+index\\s+(?:if\\s+not\\s+exists\\s+)?${indexName}\\s+on\\s+public\\.customer_project_import_batches\\s*\\(\\s*${column}\\s*\\)`, "i"),
    `${indexName} must cover ${column}`,
  );
}

assert.doesNotMatch(migration, /create\s+table|alter\s+table|create\s+or\s+replace\s+function|drop\s+/i,
  "PB-9 FK hardening must remain index-only");

console.log("PASS: PB-9 import FK hardening contract");
