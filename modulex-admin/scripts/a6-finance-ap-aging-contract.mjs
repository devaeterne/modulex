import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const functionBlock = (source, qualifiedName) => {
  const start = source.indexOf(`create or replace function ${qualifiedName}`);
  if (start < 0) return "";
  const next = source.indexOf("create or replace function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
};

const adminSqlPath = "sql/a6-finance-ap-aging.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260906141000_a6_finance_ap_aging.sql";
const vendorBillsSqlPath = "sql/a6-finance-vendor-bills.sql";
const paymentScheduleSqlPath = "sql/a6-finance-payment-schedule.sql";
for (const file of [adminSqlPath, migrationPath, vendorBillsSqlPath, paymentScheduleSqlPath]) expect(exists(file), `Missing A6-F3F dependency/artifact: ${file}`);
const sql = read(adminSqlPath);
const migration = read(migrationPath);
const vendorBillsSql = read(vendorBillsSqlPath);
const paymentScheduleSql = read(paymentScheduleSqlPath);
expect(sql === migration, "A6-F3F Admin SQL and migration must stay byte-identical");

expect(!/create\s+table/i.test(sql), "F3F is projection-only and must not create a second AP balance ledger");
for (const rpc of ["get_ap_aging_summary", "get_ap_aging_page"]) {
  expect(sql.includes(`private.${rpc}`), `Missing private ${rpc}`);
  expect(sql.includes(`public.${rpc}`), `Missing public ${rpc}`);
}
expect(/finance_assert_view/i.test(sql), "F3F read models must reuse finance.view authorization");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "F3F private read cores must not be app-callable");
expect(/grant\s+execute[\s\S]{0,300}authenticated/i.test(sql), "F3F public read wrappers must be authenticated-only");
for (const rpc of ["get_ap_aging_page", "get_ap_aging_summary"]) {
  const privateBlock = functionBlock(sql, `private.${rpc}`);
  const publicBlock = functionBlock(sql, `public.${rpc}`);
  expect(/security\s+definer/i.test(privateBlock) && /set\s+search_path\s*=\s*''/i.test(privateBlock), `Private ${rpc} must pin SECURITY DEFINER search_path`);
  expect(/security\s+definer/i.test(publicBlock), `Public ${rpc} must bridge authenticated callers to the revoked private Finance core with SECURITY DEFINER`);
  expect(/set\s+search_path\s*=\s*''/i.test(publicBlock), `Public ${rpc} must pin an empty search_path`);
}

for (const source of [
  "vendor_invoices",
  "finance_transactions",
  "finance_payment_instruments",
  "finance_transaction_links",
]) expect(sql.includes(source), `F3F must project canonical ${source} truth`);
expect(/vendor_invoice_paid_amount/i.test(sql), "F3F must reuse canonical paid amount calculation");
expect(/vendor_invoice_paid_amount[\s\S]*vendor_invoice_payment_allocations/i.test(vendorBillsSql) || /vendor_invoice_payment_allocations[\s\S]*vendor_invoice_paid_amount/i.test(vendorBillsSql), "Canonical Vendor Bill paid helper must remain derived from vendor_invoice_payment_allocations");
expect(/vendor_invoice_planned_amount/i.test(sql), "F3F must reuse the canonical planned-payment helper rather than treating schedules as actual payments");
expect(/vendor_invoice_planned_amount[\s\S]*vendor_payment_schedules/i.test(paymentScheduleSql) || /vendor_payment_schedules[\s\S]*vendor_invoice_planned_amount/i.test(paymentScheduleSql), "Canonical planned-payment helper must remain derived from vendor_payment_schedules");
expect(/finance_base_currency/i.test(sql), "F3F main-currency totals must use the canonical Finance base currency");
expect(/base_amount/i.test(sql) && /total_amount/i.test(sql), "F3F outstanding base projection must derive from stored bill FX/base snapshot");
expect(/i\.status\s*=\s*'open'/i.test(sql), "AP Aging must include only open Vendor Bills");
expect(/greatest\(i\.total_amount\s*-\s*paid\.paid_amount,\s*0\)\s*>\s*0/i.test(sql), "AP Aging must exclude fully paid Vendor Bills");
expect(/i\.due_date\s+is\s+null\s+or\s+i\.due_date\s*>=\s*v_as_of[\s\S]{0,80}'current'/i.test(sql), "Current bucket must include not-due or undated open bills");
expect(/v_as_of\s*-\s*i\.due_date\s*<=\s*30[\s\S]{0,50}'1_30'/i.test(sql), "1–30 bucket boundary must be explicit");
expect(/v_as_of\s*-\s*i\.due_date\s*<=\s*60[\s\S]{0,50}'31_60'/i.test(sql), "31–60 bucket boundary must be explicit");
expect(/v_as_of\s*-\s*i\.due_date\s*<=\s*90[\s\S]{0,50}'61_90'/i.test(sql), "61–90 bucket boundary must be explicit");
expect(/else\s+'90_plus'/i.test(sql), "90+ bucket boundary must be explicit");
expect(/unconverted/i.test(sql), "F3F must surface unresolved base-currency snapshots instead of silently zeroing them");
expect(/scheduled/i.test(sql), "F3F must project scheduled payments");
expect(/issued/i.test(sql) && /cleared/i.test(sql) && /returned/i.test(sql), "F3F must project check lifecycle states separately");

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

const sidebar = read("src/layout/AppSidebar.tsx");
expect(/name:\s*"AP Aging"[\s\S]{0,100}path:\s*"\/finance\/ap-aging"[\s\S]{0,100}permission:\s*"finance\.view"/.test(sidebar), "Finance sidebar must expose AP Aging under finance.view");
const overview = read("src/components/finance/FinanceOverview.tsx");
expect(overview.includes("/finance/ap-aging"), "Finance Overview must link to AP Aging without adding a duplicate report hub");

console.log("A6-F3F AP Aging & Vendor Financial Projection contract: PASS");
