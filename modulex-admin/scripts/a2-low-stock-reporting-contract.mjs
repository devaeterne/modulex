import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectIncludes = (source, snippets, label) => {
  for (const snippet of snippets) {
    expect(source.includes(snippet), `${label} must include: ${snippet}`);
  }
};
const expectExcludes = (source, snippets, label) => {
  for (const snippet of snippets) {
    expect(!source.includes(snippet), `${label} must not include: ${snippet}`);
  }
};

const migrationPath = "sql/a2-low-stock-reporting.sql";
const acceptancePath = "docs/acceptance/a2-4-low-stock-reporting.md";
const lowStock = read("src/components/inventory/LowStockManager.tsx");
const inventoryReport = read("src/components/reports/InventoryReport.tsx");
const movementReport = read("src/components/reports/MovementReport.tsx");

expect(exists(migrationPath), "A2.4 low-stock/reporting migration must exist");
const migration = read(migrationPath);
expectIncludes(migration, [
  "threshold_configured",
  "is_out_of_stock",
  "is_stock_alert",
  "min_stock_level > 0",
  "search_low_stock_page",
  "search_inventory_product_report_page",
  "search_inventory_location_report_page",
  "search_inventory_movement_report_page",
  "security invoker",
  "revoke execute",
  "grant execute",
], "A2.4 migration");

expectIncludes(lowStock, [
  'rpc("search_low_stock_page"',
  "threshold_configured",
  "is_out_of_stock",
  "is_stock_alert",
  "total_count",
  "summary_out_of_stock",
], "LowStockManager");
expectExcludes(lowStock, [".limit(1000)", '.from("v_product_stock_summary")'], "LowStockManager");

expectIncludes(inventoryReport, [
  'rpc("search_inventory_product_report_page"',
  'rpc("search_inventory_location_report_page"',
  "total_count",
  "summary_on_hand",
  "summary_available",
  "Export CSV",
], "InventoryReport");
expectExcludes(inventoryReport, [".limit(1000)", '.from("v_product_stock_summary")', '.from("v_location_stock_summary")'], "InventoryReport");

expectIncludes(movementReport, [
  'rpc("search_inventory_movement_report_page"',
  "total_count",
  "summary_units",
  "summary_inbound",
  "summary_outbound",
  "Export CSV",
], "MovementReport");
expectExcludes(movementReport, [".limit(1000)", '.from("v_inventory_movement_history")'], "MovementReport");

expect(exists(acceptancePath), "A2.4 release-candidate acceptance artifact must exist");
const acceptance = read(acceptancePath);
expectIncludes(acceptance, [
  "A2.4 release candidate acceptance: PASS",
  "Production migration: PENDING POST-MERGE",
  "0 = unset",
  "Out of Stock is threshold-independent",
  "Inventory reconciliation preflight: PASS",
  "Movement reconciliation preflight: PASS",
  "Production inventory/movement mutation: NONE",
], "A2.4 acceptance artifact");

console.log("A2.4 low-stock + reporting contract: PASS");
