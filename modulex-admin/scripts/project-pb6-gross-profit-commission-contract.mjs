import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const migrationPath = "../modulex-store/supabase/migrations/20260905180000_customer_project_gross_profit_commission.sql";
const sqlPath = "sql/project-pb6-gross-profit-commission.sql";
const domainPath = "src/lib/customers/project-participants-commission-domain.ts";
const componentPath = "src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";
const sidebarPath = "src/layout/AppSidebar.tsx";

assert.equal(exists(migrationPath), true, "PB-6 gross-profit canonical migration must exist");
assert.equal(exists(sqlPath), true, "PB-6 gross-profit Admin SQL mirror must exist");

const migration = read(migrationPath);
const sql = read(sqlPath);
const domain = read(domainPath);
const component = read(componentPath);
const sidebar = read(sidebarPath);

assert.equal(migration, sql, "PB-6 gross-profit migration and Admin SQL mirror must stay byte-identical");

for (const token of [
  "gross_profit_percentage",
  "basis_revenue_amount",
  "basis_cost_amount",
  "project_commission_gross_profit_basis",
  "get_customer_project_commission_calculation_preview",
  "PROJECT_COMMISSION_COST_INCOMPLETE",
  "product_costs",
  "quantity",
]) assert.match(migration, new RegExp(token, "i"), `Gross-profit DB contract must contain ${token}`);

assert.match(migration, /is_active\s*=\s*true[\s\S]*valid_to\s+is\s+null/i, "Gross-profit basis must use canonical current active product costs");
assert.match(migration, /line_total/i, "Gross-profit revenue must use Order line revenue");
assert.match(migration, /missing_cost_line_count/i, "Gross-profit preview must expose missing-cost line count");
assert.match(migration, /PROJECT_COMMISSION_SCOPE_MIXED_CURRENCY|PROJECT_COMMISSION_GROSS_PROFIT_MIXED_CURRENCY/i, "Gross-profit basis must fail closed on mixed currencies");
assert.match(migration, /PROJECT_COMMISSION_GROSS_PROFIT_NONPOSITIVE/i, "Gross-profit basis must fail closed when gross profit is zero or negative");
assert.match(migration, /v_basis_type\s*=\s*'gross_profit_percentage'[\s\S]*project_commission_gross_profit_basis/i, "Create RPC must recalculate gross profit server-side");
assert.match(migration, /basis_revenue_amount[\s\S]*basis_cost_amount/i, "Create RPC must snapshot gross-profit revenue and cost");
assert.doesNotMatch(migration, /grant\s+execute[\s\S]*to\s+anon/i, "Gross-profit preview must not be exposed to anon");

assert.match(domain, /gross_profit_percentage/i, "Client domain must support gross-profit percentage basis");
assert.match(domain, /get_customer_project_commission_calculation_preview/i, "Client domain must use richer calculation preview RPC");
assert.match(domain, /mode:\s*"revenue"\s*\|\s*"gross_profit"/i, "Client preview type must distinguish revenue and gross-profit calculations");

for (const token of ["Fixed amount", "Sales %", "Gross profit %", "Commission Preview", "Scoped sales", "Product cost", "Gross profit", "Estimated commission", "Incomplete cost data"]) {
  assert.match(component, new RegExp(token, "i"), `Project commission UI must expose ${token}`);
}
assert.doesNotMatch(component, />Unavailable</i, "Commission preview must not show an unexplained Unavailable state");

assert.match(sidebar, /Project Participant Roles[\s\S]*\/settings\/general\/project-participant-roles/i, "General Settings sidebar must expose Project Participant Roles");

console.log("Project PB-6 gross profit commission contract PASS");
