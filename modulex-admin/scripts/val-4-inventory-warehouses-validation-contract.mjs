import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const select = read("src/components/form/Select.tsx");
const warehouseForm = read("src/components/warehouses/WarehouseForm.tsx");
const stockOperationForm = read("src/components/stock-operations/StockOperationForm.tsx");
const inventoryTable = read("src/components/inventory/InventoryTable.tsx");
const roadmap = read("ADMIN_ROADMAP.md");

assert(/error\?: boolean/.test(select), "Select must expose an explicit error state");
assert(/aria-invalid=\{error \|\| undefined\}/.test(select), "Select error state must expose aria-invalid");
assert(/ADMIN_FIELD_STATES\.error/.test(select), "Select error state must use the canonical admin error token");

assert(/type WarehouseFieldErrors/.test(warehouseForm), "Warehouse form must keep field-level validation errors");
assert(/setFieldErrors/.test(warehouseForm), "Warehouse form must publish field-level validation errors");
assert(/document\.getElementById\(firstInvalidField\)\?\.focus\(\)/.test(warehouseForm), "Warehouse form must focus the first invalid field");
assert(/id="warehouse-code"[\s\S]*required[\s\S]*error=\{Boolean\(fieldErrors\.code\)\}/.test(warehouseForm), "Warehouse code must expose required/error semantics");
assert(/id="warehouse-name"[\s\S]*required[\s\S]*error=\{Boolean\(fieldErrors\.name\)\}/.test(warehouseForm), "Warehouse name must expose required/error semantics");
assert(/id="warehouse-type"[\s\S]*error=\{Boolean\(fieldErrors\.warehouse_type\)\}/.test(warehouseForm), "Warehouse type must expose invalid selection semantics");
assert(/setErrorMessage\(error\.message\)/.test(warehouseForm), "Warehouse DB errors must remain visible instead of being replaced by a generic retry message");

assert(/parseDbDecimal/.test(stockOperationForm), "Stock operation quantity must use the shared DB decimal validator");
assert(/STOCK_QUANTITY_DECIMAL\s*=\s*\{\s*precision:\s*12,\s*scale:\s*2,\s*min:\s*0\.01,\s*allowNull:\s*false\s*\}/.test(stockOperationForm), "Stock quantity must match numeric(12,2) and positive DB semantics");
assert(/type StockOperationFieldErrors/.test(stockOperationForm), "Stock operation form must keep field-level validation errors");
assert(/document\.getElementById\(firstInvalidField\)\?\.focus\(\)/.test(stockOperationForm), "Stock operation form must focus the first invalid field");
assert(/id="stock-operation-product"[\s\S]*error=\{Boolean\(fieldErrors\.productId\)\}/.test(stockOperationForm), "Product selection must expose invalid state");
assert(/id="stock-operation-quantity"[\s\S]*error=\{Boolean\(fieldErrors\.quantity\)\}/.test(stockOperationForm), "Quantity must expose invalid state and inline feedback");
assert(/p_quantity:\s*validatedQuantity/.test(stockOperationForm), "RPC payloads must use the normalized validated quantity");
assert(/setErrorMessage\(\s*result\.error\.message \|\|/.test(stockOperationForm), "Stock RPC errors must preserve the server message when available");
assert(/stock_in_idempotent/.test(stockOperationForm) && /stock_transfer_idempotent/.test(stockOperationForm) && /stock_out_idempotent/.test(stockOperationForm) && /reserve_stock_idempotent/.test(stockOperationForm) && /release_stock_idempotent/.test(stockOperationForm), "Existing idempotent stock RPC boundaries must remain intact");
assert(!/\.insert\(|\.update\(|\.delete\(/.test(inventoryTable), "Inventory overview must remain read-only; mutations belong to protected stock operations");

assert(/- \[~\] VAL-4 — Inventory \+ Warehouses \+ Stock Operations/.test(roadmap), "VAL-4 must be marked in progress until production acceptance");

console.log("VAL-4 Inventory + Warehouses + Stock Operations validation contract: PASS");
