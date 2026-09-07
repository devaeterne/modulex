import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// TDD RED gate: the index-only migration is intentionally absent at this commit.
const root = process.cwd();
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
};

const migrationPath = "../modulex-store/supabase/migrations/20260908001000_customer_project_change_order_performance_hardening.sql";
const sqlPath = "sql/project-pb7-change-order-performance-hardening.sql";
const migration = read(migrationPath);
const sql = read(sqlPath);

assert.ok(migration.length > 0, "PB-7 performance hardening migration must exist");
assert.ok(sql.length > 0, "PB-7 performance hardening Admin SQL mirror must exist");
assert.equal(migration, sql, "PB-7 performance hardening migration and Admin SQL mirror must stay byte-identical");

const indexes = [
  ["customer_project_change_order_applications_linked_by_idx", "customer_project_change_order_applications", "linked_by"],
  ["customer_project_change_order_applications_order_id_idx", "customer_project_change_order_applications", "order_id"],
  ["customer_project_change_order_events_created_by_idx", "customer_project_change_order_events", "created_by"],
  ["customer_project_change_order_lines_created_by_idx", "customer_project_change_order_lines", "created_by"],
  ["customer_project_change_order_lines_product_id_idx", "customer_project_change_order_lines", "product_id"],
  ["customer_project_change_order_lines_target_order_item_id_idx", "customer_project_change_order_lines", "target_order_item_id"],
  ["customer_project_change_order_lines_updated_by_idx", "customer_project_change_order_lines", "updated_by"],
  ["customer_project_change_orders_correction_of_change_order_id_idx", "customer_project_change_orders", "correction_of_change_order_id"],
  ["customer_project_change_orders_cancelled_by_idx", "customer_project_change_orders", "cancelled_by"],
  ["customer_project_change_orders_created_by_idx", "customer_project_change_orders", "created_by"],
  ["customer_project_change_orders_reviewed_by_idx", "customer_project_change_orders", "reviewed_by"],
  ["customer_project_change_orders_submitted_by_idx", "customer_project_change_orders", "submitted_by"],
  ["customer_project_change_orders_updated_by_idx", "customer_project_change_orders", "updated_by"],
];

for (const [name, table, column] of indexes) {
  const pattern = new RegExp(`create\\s+index\\s+if\\s+not\\s+exists\\s+${name}\\s+on\\s+public\\.${table}\\s*\\(\\s*${column}\\s*\\)`, "i");
  assert.match(migration, pattern, `PB-7 hardening must add ${name} on ${table}(${column})`);
}

assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(?:into\s+|from\s+)?public\./i, "PB-7 performance hardening must not mutate business data");
assert.doesNotMatch(migration, /\bdrop\s+(table|column|constraint|function|index)\b/i, "PB-7 performance hardening must remain additive");

console.log("Project PB-7 performance hardening contract PASS");
