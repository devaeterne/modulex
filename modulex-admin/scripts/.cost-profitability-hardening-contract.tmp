import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationPaths = [
  "../modulex-store/supabase/migrations/20260910231103_cost_price_snapshot_hardening.sql",
  "../modulex-store/supabase/migrations/20260910231137_profitability_basis_hardening.sql",
  "../modulex-store/supabase/migrations/20260910231210_project_financial_summary_hardening.sql",
  "../modulex-store/supabase/migrations/20260910231226_order_profitability_view_hardening.sql",
  "../modulex-store/supabase/migrations/20260910231259_order_margin_assessment_hardening.sql",
];

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

for (const migrationPath of migrationPaths) {
  assert(fs.existsSync(path.join(root, migrationPath)), `Cost & Profitability hardening requires ${migrationPath}`);
}
const sql = migrationPaths.map((migrationPath) => fs.readFileSync(path.join(root, migrationPath), "utf8")).join("\n\n");

assert(/system_key\s*=\s*'cost'/i.test(sql), "Cost price group must have the stable system_key=cost");
assert(sql.includes("private.sync_product_cost_from_cost_price"), "Cost price changes must synchronize the operational product_costs history");
assert(sql.includes("source_product_price_id"), "Synced product_costs rows must retain Cost price provenance");
assert(/unit_cost_snapshot\s+numeric\s*\(\s*18\s*,\s*4\s*\)/i.test(sql), "Order line cost snapshots must preserve numeric(18,4) precision");
assert(sql.includes("cost_snapshot_at") && sql.includes("cost_source_id"), "Order lines must retain cost snapshot timestamp and source provenance");
assert(sql.includes("private.apply_customer_order_item_cost_snapshot"), "Order item writes must enforce frozen cost snapshots");
assert(sql.includes("private.freeze_customer_order_cost_snapshots"), "Order confirmation must freeze any existing line costs");
assert(sql.includes("confirmed_at"), "Cost snapshots must be anchored to the order confirmation lifecycle");

assert(sql.includes("private.v_profitability_order_lines"), "Profitability consumers must share one canonical line accounting projection");
assert(sql.includes("customer_visible_sell_amount"), "Profitability revenue must use canonical customer-visible pre-tax revenue");
assert(sql.includes("private.project_direct_cost_basis"), "Gross profit must include direct Project costs");
assert(sql.includes("role_key = 'contractor'") || sql.includes("role_key='contractor'"), "Contractor fixed obligations must be classified as direct Project costs");
assert(sql.includes("basis_type = 'fixed'") || sql.includes("basis_type='fixed'"), "Only fixed Contractor obligations may enter direct Project cost");
assert(sql.includes("private.project_commission_gross_profit_basis"), "Gross-profit commission basis must be replaced with hardened accounting");
assert(sql.includes("direct_project_cost"), "Project financial summary must expose direct Project cost separately");

assert(/create\s+or\s+replace\s+view\s+public\.v_order_profitability_current_cost/i.test(sql), "Order profitability compatibility view must be hardened in place");
assert(sql.includes("missing_cost_lines"), "Profitability must retain explicit missing-cost coverage");
assert(sql.includes("v_missing_cost"), "Order approval assessment must fail closed when any cost is missing");
assert(sql.includes("cost_evaluation"), "Approval keys must change when draft cost evaluation changes");

assert(!sql.includes("countertop_configurations"), "Countertop selling configuration must never be treated as COGS");
assert(!/\bmaterial_cost\b/i.test(sql), "Countertop material_cost selling input must never be treated as COGS");
assert(!/update\s+public\.project_commission_obligations/i.test(sql), "Immutable historical commission obligations must never be rewritten");
assert(!/insert\s+into\s+public\.project_commission_obligations/i.test(sql), "Migration must not silently replace historical commission obligations");

const orderViewSql = fs.readFileSync(
  path.join(root, "../modulex-store/supabase/migrations/20260910231226_order_profitability_view_hardening.sql"),
  "utf8",
);
const viewColumnOrder = [
  "o.id as order_id",
  "o.order_number",
  "o.order_date",
  "o.status",
  "o.customer_id",
  "c.customer_code",
  "c.name as customer_name",
  "o.price_group_id",
  "o.price_group_name_snapshot",
  "o.fulfillment_type",
  "o.currency_code",
  "o.subtotal",
  "o.discount_amount",
  "as net_sales",
  "end as estimated_cogs",
  "end as estimated_gross_profit",
  "end as estimated_margin_percent",
  "as missing_cost_lines",
  "as line_count",
  "o.tax_amount",
  "o.payment_commission_amount",
  "o.total_amount",
  "o.grand_total",
  "o.created_by",
  "o.confirmed_at",
  "o.completed_at",
  "o.created_at",
  "as manual_price_lines",
];
let viewOffset = 0;
for (const token of viewColumnOrder) {
  const nextOffset = orderViewSql.indexOf(token, viewOffset);
  assert(nextOffset >= 0, `Order profitability compatibility view must preserve column token: ${token}`);
  viewOffset = nextOffset + token.length;
}

console.log("PASS: Cost & Profitability hardening contract");
