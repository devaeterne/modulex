import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");
const migrationName = "20260908200000_project_proposal_order_conversion_uuid_aggregate_fix.sql";
const adminPath = path.join(root, "supabase/migrations", migrationName);
const storePath = path.join(repoRoot, "modulex-store/supabase/migrations", migrationName);

assert.equal(fs.existsSync(adminPath), true, "Admin P6 UUID aggregate hotfix mirror must exist");
assert.equal(fs.existsSync(storePath), true, "Canonical Store P6 UUID aggregate hotfix must exist");

const adminSql = fs.readFileSync(adminPath, "utf8");
const storeSql = fs.readFileSync(storePath, "utf8");
assert.equal(adminSql, storeSql, "P6 UUID aggregate hotfix mirrors must be byte-identical");
assert.match(storeSql, /create\s+or\s+replace\s+function\s+public\.get_project_proposal_order_conversion_preview/i);
assert.match(storeSql, /array_agg\s*\(\s*cc\.order_id\s+order\s+by\s+cc\.created_at\s*,\s*cc\.id\s*\)/i,
  "P6 preview must choose converted UUID with a PostgreSQL-safe deterministic aggregate");
assert.doesNotMatch(storeSql, /min\s*\(\s*cc\.order_id\s*\)/i,
  "P6 preview must never call unsupported min(uuid)");

console.log("Project Proposal P6 UUID aggregate hotfix contract PASS");
