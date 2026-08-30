import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

const migrationPath = "sql/a2-inventory-movements.sql";
expect(fs.existsSync(path.join(root, migrationPath)), "A2.2 migration must exist");

const migration = read(migrationPath);
const inventoryTable = read("src/components/inventory/InventoryTable.tsx");
const stockOperationForm = read("src/components/stock-operations/StockOperationForm.tsx");
const guidedStockOperation = read("src/components/scan/GuidedStockOperation.tsx");

// Inventory semantics: quantity is physical on-hand, while available is on-hand minus reserved.
expect(/quantity\s*-\s*reserved_quantity/i.test(migration), "Available stock must remain on-hand minus reserved");
expect(/LOW_STOCK[\s\S]{0,220}quantity\s*-\s*(?:i\.)?reserved_quantity/i.test(migration), "Low-stock status must be based on available stock");
expect(inventoryTable.includes("On Hand"), "Inventory UI must label physical quantity as On Hand");

// Server-side inventory discovery must support structured filters and real pagination.
expect(/create\s+or\s+replace\s+function\s+public\.search_stock_page/i.test(migration), "A2.2 must provide a paginated inventory RPC");
for (const parameter of ["p_offset", "p_warehouse_id", "p_stock_status"]) {
  expect(migration.includes(parameter), `Paginated inventory RPC must support ${parameter}`);
  expect(inventoryTable.includes(parameter), `Inventory UI must pass ${parameter}`);
}
expect(/count\s*\(\s*\*\s*\)\s+over\s*\(/i.test(migration), "Paginated inventory RPC must return a total count");
expect(inventoryTable.includes('rpc("search_stock_page"'), "Inventory UI must use the server-side paginated RPC");
expect(inventoryTable.includes("Previous") && inventoryTable.includes("Next"), "Inventory UI must expose previous/next pagination controls");

// Repeated admin/scan submissions must be retry-safe and reject key reuse with changed payloads.
for (const marker of ["idempotency_key", "request_fingerprint", "pg_advisory_xact_lock"]) {
  expect(migration.includes(marker), `A2.2 idempotency contract is missing ${marker}`);
}
for (const rpc of ["stock_in_idempotent", "stock_out_idempotent", "stock_transfer_idempotent", "reserve_stock_idempotent", "release_stock_idempotent"]) {
  expect(migration.includes(`public.${rpc}`), `A2.2 migration must define ${rpc}`);
  expect(stockOperationForm.includes(`\"${rpc}\"`) || guidedStockOperation.includes(`\"${rpc}\"`), `Admin operation surfaces must call ${rpc}`);
}
expect(stockOperationForm.includes("p_idempotency_key"), "Desktop stock operations must send an idempotency key");
expect(guidedStockOperation.includes("p_idempotency_key"), "Guided scan operations must send an idempotency key");

// Movement history is an append-only ledger; corrections are linked as new movements.
expect(migration.includes("reversal_of_movement_id"), "Movement ledger must support linked compensating/reversal records");
expect(/before\s+update\s+or\s+delete[\s\S]{0,220}inventory_movements/i.test(migration), "Movement ledger must block UPDATE/DELETE at the database layer");
expect(/drop\s+policy\s+if\s+exists\s+inventory_movements_update_admin_only/i.test(migration), "Legacy movement UPDATE policy must be removed");
expect(/drop\s+policy\s+if\s+exists\s+inventory_movements_delete_super_admin_only/i.test(migration), "Legacy movement DELETE policy must be removed");
expect(/reason/i.test(migration) && /reference_no/i.test(migration), "Movement validation must explicitly address reason/reference traceability");

console.log("A2.2 inventory + movements contract: PASS");
