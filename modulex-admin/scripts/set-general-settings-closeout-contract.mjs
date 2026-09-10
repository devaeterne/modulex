import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(here, "..");
const repoRoot = path.resolve(adminRoot, "..");
const readAdmin = (file) => fs.readFileSync(path.join(adminRoot, file), "utf8");
const readRepo = (file) => {
  const fullPath = path.join(repoRoot, file);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
};

const migration = readRepo("modulex-store/supabase/migrations/20260910160000_set_general_settings_final_closeout.sql");
const settingsTypes = readAdmin("src/lib/settings/types.ts");
const orderSettings = readAdmin("src/components/settings/OrderDocumentSettings.tsx");
const invoiceSettings = readAdmin("src/components/settings/InvoiceDocumentSettings.tsx");
const orderPrint = readAdmin("src/components/customers/CustomerOrderPrint.tsx");
const invoicePrint = readAdmin("src/components/customers/CustomerInvoicePrint.tsx");
const orderDomain = readAdmin("src/lib/customers/order-domain.ts");
const newOrder = readAdmin("src/components/customers/NewCustomerOrder.tsx");
const storeCompany = readRepo("modulex-store/src/lib/store/company/queries.ts");
const roadmap = readRepo("modulex-admin/ADMIN_ROADMAP.md");

// SET-A4: numbering stays in the canonical singleton and keeps the existing sequences as counters.
for (const column of [
  "order_number_prefix",
  "order_number_padding",
  "invoice_number_prefix",
  "invoice_number_padding",
]) {
  assert.match(migration, new RegExp(`\\b${column}\\b`), `${column} must be owned by general_settings`);
  assert.match(settingsTypes, new RegExp(`\\b${column}\\b`), `${column} must be represented in the Admin settings contract`);
}
assert.match(migration, /customer_order_number_seq/, "Order numbering must retain the canonical order sequence");
assert.match(migration, /customer_invoice_number_seq/, "Invoice numbering must retain the canonical invoice sequence");
assert.match(migration, /order_number_prefix[\s\S]*order_number_padding/, "Order defaults must consume configured numbering format");
assert.match(migration, /invoice_number_prefix[\s\S]*invoice_number_padding/, "Invoice defaults must consume configured numbering format");

// SET-A2: no hard-coded USD fallback may decide customer/order/invoice business currency.
assert.match(migration, /ALTER COLUMN currency_code DROP DEFAULT/i, "Customer currency must stop using a static USD column default");
assert.match(migration, /general_settings[\s\S]*default_currency/, "Missing business currency must resolve from canonical general_settings");
assert.doesNotMatch(migration, /coalesce\(new\.currency_code,\s*'USD'\)/i, "Order/invoice default triggers must not fall back to USD");
assert.doesNotMatch(newOrder, /customer\?\.currency_code\s*\|\|\s*"USD"/, "Create Order UI must not use a customer USD fallback");
assert.doesNotMatch(newOrder, /function money\([^)]*currency\s*=\s*"USD"/, "Create Order formatter must require the resolved currency");
assert.doesNotMatch(newOrder, /currency:\s*"USD"/, "Create Order formatting failure must not silently change the currency to USD");
assert.match(orderDomain, /defaultCurrency/, "Order context must expose canonical default currency");
assert.doesNotMatch(orderPrint, /DEFAULT_GENERAL_SETTINGS/, "Order documents must not silently render from local fallback settings");
assert.doesNotMatch(invoicePrint, /DEFAULT_GENERAL_SETTINGS/, "Invoice documents must not silently render from local fallback settings");
assert.doesNotMatch(orderPrint, /settings\.default_currency\s*\|\|\s*"USD"/, "Order print currency must remain the order transaction snapshot");
assert.doesNotMatch(invoicePrint, /settings\.default_currency\s*\|\|\s*"USD"/, "Invoice print currency must remain the invoice transaction snapshot");
assert.doesNotMatch(orderPrint, /currency:\s*"USD"/, "Order print formatting failure must not silently change the transaction currency");
assert.doesNotMatch(invoicePrint, /currency:\s*"USD"/, "Invoice print formatting failure must not silently change the transaction currency");
assert.match(settingsTypes, /timezone:\s*"UTC"/, "Local settings fallback must align with the DB timezone default");

// SET-A3: Tax Rules retain server-side usage and gain actor audit without changing Order→Invoice snapshots.
for (const column of ["created_by", "updated_by"]) {
  assert.match(migration, new RegExp(`order_tax_rules[\\s\\S]*${column}`), `Tax Rules must record ${column}`);
}
assert.match(migration, /auth\.uid\(\)/, "Tax Rule audit must stamp the authenticated actor");
assert.match(migration, /REVOKE[\s\S]+order_tax_rules[\s\S]+FROM anon/i, "Anonymous Tax Rule DML grants must be removed");

// SET-A1/A5: Store uses public narrow wrappers; private helper execution is not a public contract.
assert.match(storeCompany, /callPublicRpc[\s\S]*get_store_public_profile/, "Store company profile must use the public RPC wrapper");
assert.match(storeCompany, /callPublicRpc[\s\S]*get_store_public_company_locations/, "Store company locations must use the public RPC wrapper");
assert.match(migration, /create or replace function public\.get_store_public_profile\(\)[\s\S]*security definer/i, "Public company profile wrapper must own the privilege boundary");
assert.match(migration, /create or replace function public\.get_store_public_company_locations\(\)[\s\S]*security definer/i, "Public company locations wrapper must own the privilege boundary");
assert.match(migration, /REVOKE EXECUTE ON FUNCTION store_api_private\.get_store_public_profile\(\) FROM anon, authenticated/i, "Private company profile helper must not be directly executable by Store roles");
assert.match(migration, /REVOKE EXECUTE ON FUNCTION store_api_private\.get_store_public_company_locations\(\) FROM anon, authenticated/i, "Private company locations helper must not be directly executable by Store roles");

// Existing document settings UI is extended rather than duplicated.
for (const source of [orderSettings, invoiceSettings]) {
  assert.match(source, /Number Prefix/, "Document settings UI must expose the configured number prefix");
  assert.match(source, /Padding/, "Document settings UI must expose configured number padding");
}

// SET-A5 final exit gate follows the current Admin Final Workstreams roadmap shape.
assert.match(roadmap, /## SET — General Settings[\s\S]*Status: `\[x\]`/, "SET General Settings workstream status must be closed");
for (const id of ["SET-A1", "SET-A2", "SET-A3", "SET-A4", "SET-A5"]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] \\*\\*${id}\\b`), `${id} must be closed in ADMIN_ROADMAP.md`);
}

console.log("SET / General Settings final closeout contract: ok");
