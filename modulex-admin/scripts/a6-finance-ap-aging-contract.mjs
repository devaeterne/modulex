import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-finance-ap-aging.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260906141000_a6_finance_ap_aging.sql";
for (const file of [adminSqlPath, migrationPath]) expect(exists(file), `Missing A6-F3F artifact: ${file}`);
const sql = read(adminSqlPath);
const migration = read(migrationPath);
expect(sql === migration, "A6-F3F Admin SQL and migration must stay byte-identical");

expect(!/create\s+table/i.test(sql), "F3F is projection-only and must not create a second AP balance ledger");
for (const rpc of ["get_ap_aging_summary", "get_ap_aging_page"]) {
  expect(sql.includes(`private.${rpc}`), `Missing private ${rpc}`);
  expect(sql.includes(`public.${rpc}`), `Missing public ${rpc}`);
}
expect(/finance_assert_view/i.test(sql), "F3F read models must reuse finance.view authorization");
expect(/security\s+definer/i.test(sql) && /set\s+search_path\s*=\s*''/i.test(sql), "F3F private read cores must pin SECURITY DEFINER search_path");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "F3F private read cores must not be app-callable");
expect(/grant\s+execute[\s\S]{0,300}authenticated/i.test(sql), "F3F public read wrappers must be authenticated-only");

for (const source of [
  "vendor_invoices",
  "vendor_invoice_payment_allocations",
  "vendor_payment_schedules",
  "finance_transactions",
  "finance_payment_instruments",
  "finance_transaction_links",
]) expect(sql.includes(source), `F3F must project canonical ${source} truth`);
expect(/vendor_invoice_paid_amount/i.test(sql), "F3F must reuse canonical paid amount calculation");
expect(/finance_base_currency/i.test(sql), "F3F main-currency totals must use the canonical Finance base currency");
expect(/base_amount/i.test(sql) && /total_amount/i.test(sql), "F3F outstanding base projection must derive from stored bill FX/base snapshot");
for (const bucket of ["current", "1_30", "31_60", "61_90", "90_plus"]) expect(sql.includes(`'${bucket}'`), `Missing AP aging bucket ${bucket}`);
expect(/unconverted/i.test(sql), "F3F must surface unresolved base-currency snapshots instead of silently zeroing them");
expect(/scheduled/i.test(sql), "F3F must project scheduled payments");
expect(/issued/i.test(sql) && /cleared/i.test(sql) && /returned/i.test(sql), "F3F must project check lifecycle states");

const route = "src/app/(admin)/finance/ap-aging/page.tsx";
const manager = "src/components/finance/FinanceApAgingManager.tsx";
const adapter = "src/lib/finance/apAging.ts";
for (const file of [route, manager, adapter]) expect(exists(file), `Missing A6-F3F Admin surface: ${file}`);
expect(read(route).includes("PageBreadCrumb"), "AP Aging route must use shared PageBreadCrumb");
const ui = read(manager);
for (const primitive of ["ComponentCard", "Alert", "Badge", "Button", "Select", "TableViewport", "TableStateRow"]) {
  expect(ui.includes(primitive), `AP Aging UI must reuse shared ${primitive}`);
}
for (const term of ["AP Aging", "Open AP", "Overdue", "Scheduled", "Outstanding Checks", "Cleared Checks", "Vendor", "Invoice"]) {
  expect(ui.toLowerCase().includes(term.toLowerCase()), `AP Aging UI must expose ${term}`);
}
expect(ui.includes("getVendorPaymentsPage") && ui.includes("getPaymentSchedulesPage"), "Vendor financial drill-down must reuse existing payment/schedule projections");
expect(ui.includes("getVendorBillDetail"), "AP Aging drill-down must reuse canonical Vendor Bill detail");
expect(!/<(?:input|select|button)\b/.test(ui), "AP Aging UI must not render native controls directly");

const overview = read("src/components/finance/FinanceOverview.tsx");
expect(overview.includes("/finance/ap-aging"), "Finance Overview must link to AP Aging without adding a duplicate report hub");

console.log("A6-F3F AP Aging & Vendor Financial Projection contract: PASS");
