import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
};
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

const sqlPath = "sql/a6-finance-ar-aging.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260906214500_a6_finance_ar_aging.sql";
const sql = read(sqlPath);
const migration = read(migrationPath);
const domain = read("src/lib/finance/arAging.ts");
const manager = read("src/components/finance/FinanceArAgingManager.tsx");
const route = read("src/app/(admin)/finance/ar-aging/page.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");

expect(sql.length > 0, "F5B AR Aging SQL must exist");
expect(sql === migration, "F5B Admin SQL and Store migration must stay byte-identical");
expect(/create or replace function private\.ar_aging_invoice_projection\s*\(/i.test(sql), "F5B must define private AR aging projection");
for (const fn of [
  "get_ar_aging_page",
  "get_ar_aging_summary",
  "get_customer_ar_balance",
  "get_customer_payment_history",
]) {
  expect(new RegExp(`create or replace function public\\.${fn}\\s*\\(`, "i").test(sql), `F5B must expose ${fn}`);
}
expect(/greatest\s*\(\s*coalesce\s*\(\s*i\.total_amount/i.test(sql), "F5B must derive outstanding from invoice total minus canonical paid amount");
expect(/i\.status\s+not\s+in\s*\(\s*'draft'\s*,\s*'void'\s*,\s*'paid'\s*\)/i.test(sql), "F5B must exclude draft, void and paid invoices from open AR");
for (const bucket of ["current", "1_30", "31_60", "61_90", "90_plus"]) {
  expect(sql.includes(`'${bucket}'`), `F5B must include ${bucket} aging bucket`);
}
expect(sql.includes("customer_project_payment_finance_links"), "F5B payment history must understand Project-to-Finance bridges");
expect(/not exists\s*\([\s\S]{0,600}customer_project_payment_finance_links/i.test(sql), "F5B legacy Project payment history must exclude bridged payments");
expect(sql.includes("finance_receipt") && sql.includes("project_payment"), "F5B payment history must expose source identity");
expect(!/get_(?:current|latest)_.*(?:exchange|fx).*rate|from\s+(?:public\.)?(?:fx_rates|exchange_rates)\b/i.test(sql), "F5B must not revalue historical AR using current FX");
expect(sql.includes("private.finance_assert_view()"), "F5B private reads must enforce finance.view");
expect(/revoke execute on function private\.ar_aging_invoice_projection[\s\S]*from public/i.test(sql), "F5B private projection must not be browser-executable");

expect(domain.includes('rpc("get_ar_aging_page"'), "F5B domain must call get_ar_aging_page");
expect(domain.includes('rpc("get_ar_aging_summary"'), "F5B domain must call get_ar_aging_summary");
expect(domain.includes('rpc("get_customer_ar_balance"'), "F5B domain must call get_customer_ar_balance");
expect(domain.includes('rpc("get_customer_payment_history"'), "F5B domain must call get_customer_payment_history");
expect(domain.includes("parseDbDecimal"), "F5B domain must parse DB decimal values through shared validation");

expect(route.includes("FinanceArAgingManager"), "F5B route must render FinanceArAgingManager");
expect(manager.includes("TableViewport"), "F5B table must use shared TableViewport");
expect(manager.includes("TableStateRow"), "F5B table must use shared TableStateRow");
expect(manager.includes("Customer Payment History"), "F5B UI must expose Customer Payment History");
expect(manager.includes("Finance Receipt") && manager.includes("Legacy Project Payment"), "F5B UI must distinguish payment history sources");
expect(manager.includes("Aging reference date"), "F5B UI must describe the date as an aging reference, not a historical snapshot date");
expect(manager.includes("does not reconstruct a historical balance snapshot"), "F5B UI must explain that the reference date only changes aging buckets");
expect(!manager.includes(">As of date<"), "F5B UI must not imply that the reference date reconstructs historical AR balances");
expect(sidebar.includes('path: "/finance/ar-aging"'), "Finance sidebar must expose AR Aging");
expect(/AR Aging[\s\S]{0,120}finance\.view/.test(sidebar), "AR Aging navigation must require finance.view");

console.log("A6-F5B AR Aging / Customer Balance / Payment History contract: PASS");
