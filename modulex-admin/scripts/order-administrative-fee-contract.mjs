import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adminRoot = process.cwd();
const repoRoot = path.resolve(adminRoot, "..");

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolute), `Administrative Fee required file missing: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

const baseMigration = [
  read("modulex-store/supabase/migrations/20260908150000_customer_order_administrative_fee.sql"),
  read("modulex-store/supabase/migrations/20260908150500_customer_order_administrative_fee_defaults.sql"),
  read("modulex-store/supabase/migrations/20260908151000_customer_order_visible_pricing_rpc.sql"),
].join("\n");
const revenueTruthMigration = read("modulex-store/supabase/migrations/20260908153000_customer_order_administrative_fee_revenue_truth.sql");
const migration = `${baseMigration}\n${revenueTruthMigration}`;
const settingsTypes = read("modulex-admin/src/lib/settings/types.ts");
const settingsUi = read("modulex-admin/src/components/settings/AdministrativeFeeSettings.tsx");
const orderTypes = read("modulex-admin/src/lib/customers/types.ts");
const orderDomain = read("modulex-admin/src/lib/customers/order-administrative-fee-domain.ts");
const newOrder = read("modulex-admin/src/components/customers/NewCustomerOrder.tsx");
const editOrder = read("modulex-admin/src/components/customers/EditCustomerOrder.tsx");
const orderPrint = read("modulex-admin/src/components/customers/CustomerOrderPrint.tsx");
const invoiceDetail = read("modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx");
const invoicePrint = read("modulex-admin/src/components/customers/CustomerInvoicePrint.tsx");

// Separate canonical semantics. Existing payment-method commission remains historical and distinct.
assert.match(migration, /administrative_fee_default_percent/i, "General Settings must own the Administrative Fee default");
assert.match(migration, /administrative_fee_percent/i, "Orders must snapshot Administrative Fee percent");
assert.match(migration, /administrative_fee_amount/i, "Orders must snapshot Administrative Fee amount");
assert.match(migration, /base_sell_amount/i, "Orders must retain base sell truth");
assert.match(migration, /customer_visible_sell_amount/i, "Orders must retain fee-inclusive customer-visible sell truth");
assert.doesNotMatch(migration, /rename\s+column\s+payment_commission|drop\s+column\s+payment_commission/i, "Legacy payment commission columns must not be renamed or dropped");
assert.doesNotMatch(migration, /update\s+public\.customer_orders[\s\S]{0,500}administrative_fee_percent\s*=\s*payment_commission_percent/i, "Historical payment commission must not be reinterpreted as Administrative Fee");

// Defaults: company default is 3%, existing Orders remain 0% until explicitly revised.
assert.match(migration, /administrative_fee_default_percent[^;]*default\s+3(?:\.0+)?/i, "Administrative Fee company default must be 3%");
assert.match(migration, /update\s+public\.customer_orders[\s\S]*administrative_fee_percent\s*=\s*0\.000/i, "Existing Orders must be explicitly backfilled with a 0% Administrative Fee snapshot");
assert.match(migration, /set_customer_order_defaults[\s\S]*administrative_fee_default_percent/i, "Future Orders that omit a fee must snapshot the current General Settings default");

// Authoritative math and deterministic visible-line allocation.
assert.match(migration, /base_sell_amount[\s\S]{0,1400}administrative_fee_amount[\s\S]{0,1400}tax_amount/i, "Authoritative totals must calculate base sell, then Administrative Fee, then tax");
assert.match(migration, /customer_order_visible_line_pricing/i, "Migration must expose one canonical customer-visible line-pricing helper/projection");
assert.match(migration, /line_no/i, "Visible-line allocation must use stable line order");
assert.match(migration, /base_allocated_cents|fee_allocated_cents/i, "Visible-line allocation must explicitly handle deterministic cent remainder");

// Revenue/profitability truth must use Base Sell + Administrative Fee, never tax or the legacy payment adjustment.
assert.match(revenueTruthMigration, /get_customer_project_financial_summary[\s\S]*customer_visible_sell_amount/i, "Project financial summary must use fee-inclusive pre-tax sell revenue");
assert.match(revenueTruthMigration, /assess_customer_order[\s\S]*customer_visible_sell_amount/i, "Order margin assessment must use fee-inclusive pre-tax sell revenue");
assert.match(revenueTruthMigration, /get_customer_project_change_order_summary[\s\S]*customer_visible_sell_amount/i, "Change Order canonical revenue must include Administrative Fee");
assert.match(revenueTruthMigration, /link_customer_project_change_order_revision[\s\S]*customer_visible_sell_amount/i, "Change Order revision deltas must read the Administrative Fee sell snapshot");
assert.match(revenueTruthMigration, /order_snapshot\s*\?\s*'customer_visible_sell_amount'/i, "Historical revision snapshots must fall back safely when the new sell snapshot field is absent");
assert.doesNotMatch(revenueTruthMigration, /project_commission_scope_basis|project_commission_gross_profit_basis/i, "Administrative Fee revenue hardening must not reinterpret the PB-6 employee commission ledger");

// Explicit overrides must be present before Sales assessment and before approval-key identity is built.
assert.match(revenueTruthMigration, /create\s+or\s+replace\s+function\s+private\.create_customer_order\([\s\S]*p_administrative_fee_percent[\s\S]*create_customer_order_core[\s\S]*administrative_fee_percent\s*=\s*v_fee[\s\S]*assess_customer_order/i, "Create & Confirm must apply the explicit Administrative Fee before Sales risk assessment");
assert.match(revenueTruthMigration, /create\s+or\s+replace\s+function\s+private\.update_customer_order\([\s\S]*p_administrative_fee_percent[\s\S]*'administrative_fee_percent'\s*,\s*v_fee/i, "Confirmed revision approval identity must include the proposed Administrative Fee");
assert.match(revenueTruthMigration, /update\s+public\.customer_orders[\s\S]{0,800}administrative_fee_percent\s*=\s*v_fee[\s\S]{0,1800}assess_customer_order/i, "Direct Draft revisions must apply Administrative Fee before Sales assessment");

// Create/edit boundaries use Administrative Fee separately; legacy payment commission is not repurposed.
assert.match(orderDomain, /administrativeFeePercent/i, "Order domain input must expose Administrative Fee percent");
assert.match(orderDomain, /p_administrative_fee_percent/i, "Order domain must send Administrative Fee through the canonical RPC boundary");
assert.match(migration, /p_administrative_fee_percent/i, "Order create/update SQL boundary must accept Administrative Fee separately");

// Admin UI/settings terminology.
assert.match(settingsTypes, /administrative_fee_default_percent/i, "General Settings type must include Administrative Fee default");
assert.match(settingsUi, /Administrative Fee/i, "General Settings UI must expose Administrative Fee default");
assert.match(orderTypes, /administrative_fee_percent/i, "CustomerOrder type must include Administrative Fee snapshot fields");
assert.match(newOrder, /Administrative Fee \(%\)/, "New Order must expose Administrative Fee (%)");
assert.match(editOrder, /Administrative Fee \(%\)/, "Edit Order must expose Administrative Fee (%)");
assert.doesNotMatch(newOrder, /Applied Commission \(%\)/, "New Order must not present legacy Applied Commission as the commercial fee control");
assert.doesNotMatch(editOrder, /Applied Commission \(%\)/, "Edit Order must not present legacy Applied Commission as the commercial fee control");

// Future customer-facing invoice lines use the fee-inclusive visible projection, not a fee line.
assert.match(migration, /create_customer_invoice_from_order/i, "Invoice creation must be updated by the Administrative Fee migration");
assert.match(migration, /customer_order_visible_line_pricing/i, "Invoice creation must consume canonical customer-visible line pricing");
assert.doesNotMatch(migration, /insert\s+into\s+public\.customer_invoice_items[\s\S]{0,1200}(?:administrative fee|admin fee)/i, "Invoice creation must never create a customer-facing Administrative Fee item");

for (const [name, source] of [
  ["CustomerOrderPrint", orderPrint],
  ["CustomerInvoiceDetail", invoiceDetail],
  ["CustomerInvoicePrint", invoicePrint],
]) {
  assert.doesNotMatch(source, /Administrative Fee|Admin Fee|Applied Commission|Payment Commission/i, `${name} must not expose fee/commission terminology to customers`);
}

console.log("PASS: Order Administrative Fee contract");
