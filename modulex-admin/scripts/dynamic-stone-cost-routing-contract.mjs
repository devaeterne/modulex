import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migrationsDir = resolve(root, "../modulex-store/supabase/migrations");
const migrationName = readdirSync(migrationsDir)
  .filter((name) => name.endsWith("_dynamic_stone_cost_routing.sql"))
  .sort()
  .at(-1);

assert.ok(migrationName, "Dynamic Stone cost routing migration must exist");

const sql = readFileSync(resolve(migrationsDir, migrationName), "utf8");

assert.match(sql, /new\.vendor_code\s*=\s*'dynamicstone'/i);
assert.match(sql, /public\.product_costs/i);
assert.match(sql, /vendor_price_reference/i);
assert.match(sql, /currency_code/i);
assert.match(sql, /is_active\s*=\s*false/i);
assert.match(sql, /valid_to\s*=\s*v_now/i);
assert.match(sql, /Dynamic Stone vendor catalog/i);

// Dynamic Stone must return from its cost branch before the legacy List Price path.
const dynamicBranch = sql.search(/new\.vendor_code\s*=\s*'dynamicstone'/i);
const basePriceLookup = sql.search(/from\s+public\.price_groups/i);
assert.ok(dynamicBranch >= 0 && basePriceLookup > dynamicBranch);
assert.match(sql.slice(dynamicBranch, basePriceLookup), /return\s+new\s*;/i);

// Other vendors keep the existing List Price propagation path.
assert.match(sql, /from\s+public\.price_groups/i);
assert.match(sql, /insert\s+into\s+public\.product_prices/i);

console.log("dynamic stone cost routing contract: ok");
