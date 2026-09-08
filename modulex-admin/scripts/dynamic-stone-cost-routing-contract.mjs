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
assert.match(sql, /lower\(btrim\(name\)\)\s*=\s*'cost'/i);
assert.match(sql, /public\.product_prices/i);
assert.doesNotMatch(sql, /public\.product_costs/i);
assert.match(sql, /vendor_price_reference/i);
assert.match(sql, /currency_code/i);
assert.match(sql, /is_active\s*=\s*false/i);
assert.match(sql, /valid_to\s*=\s*v_now/i);

// Dynamic Stone must resolve the dedicated Cost price group rather than the base List Price group.
const dynamicBranch = sql.search(/new\.vendor_code\s*=\s*'dynamicstone'/i);
const costLookup = sql.search(/lower\(btrim\(name\)\)\s*=\s*'cost'/i);
const baseLookup = sql.search(/is_base_price\s*=\s*true/i);
assert.ok(dynamicBranch >= 0 && costLookup > dynamicBranch);
assert.ok(baseLookup > dynamicBranch);

// Other vendors retain the base List Price route.
assert.match(sql, /is_base_price\s*=\s*true/i);
assert.match(sql, /insert\s+into\s+public\.product_prices/i);

console.log("dynamic stone Cost price-group routing contract: ok");
