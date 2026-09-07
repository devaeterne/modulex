import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const canonicalPath = "sql/customer-contact-address-lifecycle.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260907150000_customer_contact_address_lifecycle.sql";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const normalize = (sql) => sql.replace(/\s+/g, " ").trim();

assert.equal(fs.existsSync(path.join(root, canonicalPath)), true, "CUST-7 canonical Customer lifecycle SQL must exist");
assert.equal(fs.existsSync(path.join(root, migrationPath)), true, "CUST-7 shared Supabase migration mirror must exist");

const canonical = read(canonicalPath);
const migration = read(migrationPath);
assert.equal(normalize(migration), normalize(canonical), "CUST-7 migration must remain semantically identical to the canonical Admin lifecycle SQL");

const functions = [
  "create_customer_contact",
  "update_customer_contact",
  "set_customer_contact_primary",
  "deactivate_customer_contact",
  "update_customer_address",
  "deactivate_customer_address",
];
for (const functionName of functions) {
  assert.match(migration, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b`, "i"), `${functionName} must be created by the shared migration`);
  assert.match(migration, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?from\\s+public`, "i"), `${functionName} must revoke PUBLIC execution`);
  assert.match(migration, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?to\\s+authenticated`, "i"), `${functionName} must grant execution only to authenticated callers`);
}

assert.equal((migration.match(/security\s+invoker/gi) ?? []).length, functions.length, "Every CUST-7 lifecycle RPC must remain SECURITY INVOKER");
assert.equal((migration.match(/set\s+search_path\s*=\s*''/gi) ?? []).length, functions.length, "Every CUST-7 lifecycle RPC must pin an empty search_path");
assert.match(migration, /customer_activity/i, "CUST-7 lifecycle mutations must remain audited");
assert.doesNotMatch(migration, /delete\s+from\s+public\.customer_(?:contacts|addresses)/i, "CUST-7 lifecycle must remain soft-delete only");

console.log("CUST-7 Customer lifecycle migration contract: PASS");