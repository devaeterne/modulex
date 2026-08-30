import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const sqlPath = "sql/a2-low-stock-reporting.sql";

assert.equal(exists(sqlPath), true, "A2.4 low-stock/reporting SQL package must exist");

const sql = read(sqlPath);
const lowStock = read("src/components/inventory/LowStockManager.tsx");
const inventoryReport = read("src/components/reports/InventoryReport.tsx");
const movementReport = read("src/components/reports/MovementReport.tsx");

// A threshold of zero is the explicit "not configured" state. A realistic
// regression here would turn every zero-stock product into an alert again.
assert.match(sql, /p\.min_stock_level\s*>\s*0[\s\S]{0,180}sum\(i\.quantity\s*-\s*i\.reserved_quantity\)[\s\S]{0,80}<=\s*p\.min_stock_level/i);

for (const rpc of [
  "search_low_stock_page",
  "search_inventory_product_report_page",
  "search_inventory_location_report_page",
  "search_inventory_movement_report_page",
  "get_inventory_report_filter_options",
]) {
  assert.match(sql, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${rpc}`, "i"), `${rpc} must be defined`);
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}`, "i"), `${rpc} must revoke PUBLIC execution`);
}

assert.match(sql, /count\s*\(\s*\*\s*\)\s+over\s*\(/i, "Report pages must return exact filtered counts");
assert.match(sql, /order\s+by[\s\S]{0,240}(?:product_id|location_id|movement_id)/i, "Report pagination must have a stable ID tie-breaker");
assert.match(sql, /inventory_movements_from_warehouse_created_at_idx/i, "Movement warehouse/date filtering must have a composite index");
assert.match(sql, /movement_type\s+inventory_movement_type/i, "Movement RPC must use the production inventory movement enum");
assert.match(sql, /v\.location_id[\s\S]{0,500}v\.is_active[\s\S]{0,80}count\s*\(\s*\*\s*\)\s+over/i, "Location RPC must project only its declared production columns");

assert.match(lowStock, /rpc\("search_low_stock_page"/);
assert.match(inventoryReport, /rpc\("search_inventory_product_report_page"/);
assert.match(inventoryReport, /rpc\("search_inventory_location_report_page"/);
assert.match(movementReport, /rpc\("search_inventory_movement_report_page"/);

for (const source of [lowStock, inventoryReport, movementReport]) {
  assert.doesNotMatch(source, /\.limit\(1000\)/, "A2.4 surfaces must not silently truncate reports to 1,000 rows");
}

for (const [name, source] of [["Low Stock", lowStock], ["Inventory", inventoryReport], ["Movement", movementReport]]) {
  assert.match(source, /p_export_all:\s*false/, `${name} queries must use bounded RPC pages`);
  assert.match(source, /total_count/, `${name} pagination/export must consume the exact filtered count`);
  assert.match(source, /do\s*\{[\s\S]*?while\s*\(true\)/, `${name} complete export/load must page until total_count`);
}
assert.match(inventoryReport, /p_query:\s*query\.trim\(\)[\s\S]{0,220}p_status:\s*statusFilter/, "Inventory filters must be forwarded to the RPC");
assert.match(movementReport, /p_query:\s*query\.trim\(\)[\s\S]{0,260}p_movement_type:/, "Movement filters must be forwarded to the RPC");
for (const [name, source] of [["Inventory", inventoryReport], ["Movement", movementReport]]) {
  assert.match(source, /const requestId = \+\+requestIdRef\.current/, `${name} requests must be versioned`);
  assert.match(source, /requestId !== requestIdRef\.current/, `${name} must ignore stale RPC responses`);
}

console.log("A2.4 low-stock + reporting contract: PASS");
