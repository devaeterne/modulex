import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-finance-vendor-bills.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260905234500_a6_finance_vendor_bills.sql";

expect(exists(adminSqlPath), "A6-F3B Vendor Bills SQL must exist");
expect(exists(migrationPath), "A6-F3B shared Supabase migration mirror must exist");
const sql = read(adminSqlPath);
const migration = read(migrationPath);
const vendorMasterSql = read("sql/a6-finance-vendor-master.sql");
expect(sql === migration, "A6-F3B Admin SQL and shared migration must stay byte-identical");

expect(/alter\s+table\s+public\.vendor_invoices[\s\S]{0,6000}due_date/i.test(sql), "F3B must extend existing vendor_invoices with due date");
expect(/alter\s+table\s+public\.vendor_invoices[\s\S]{0,8000}payment_term_id/i.test(sql), "F3B must reuse canonical payment_terms");
expect(/alter\s+table\s+public\.vendor_invoices[\s\S]{0,10000}status/i.test(sql), "F3B must extend existing vendor_invoices lifecycle");
expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.vendor_bills/i.test(sql), "F3B must not duplicate vendor_invoices with vendor_bills");
expect(/vendor_id/i.test(sql), "F3B must use canonical Vendor identity on AP bills");
expect(/vendor_invoices[\s\S]{0,5000}vendor_id[\s\S]{0,3000}references\s+public\.vendors/i.test(vendorMasterSql), "F3B must reuse the canonical Vendor FK established by F3A");
expect(/invoice_number_key/i.test(sql) && /duplicate|unique/i.test(sql), "Vendor invoice number duplicate protection must be preserved/strengthened");
expect(/base_currency_code/i.test(sql) && /base_amount/i.test(sql) && /fx_rate/i.test(sql) && /fx_rate_source/i.test(sql), "Vendor bills must retain historical main-currency/FX snapshot fields");

expect(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.vendor_invoice_lines/i.test(sql), "F3B must add source-document bill lines without creating a second bill header");
expect(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.vendor_invoice_payment_allocations/i.test(sql), "F3B must add bill-to-Finance payment allocations");
expect(/finance_transaction_id[\s\S]{0,500}references\s+public\.finance_transactions/i.test(sql), "Bill payment allocations must reference Finance transactions");
expect(/reversal_of_allocation_id/i.test(sql), "Bill payment allocations must support append-only reversal history");
expect(/overpayment|allocated[\s\S]{0,500}total_amount|outstanding/i.test(sql), "F3B must fail closed on overpayment and derive outstanding balance");
expect(/vendor_payment/i.test(sql), "F3B settlement allocations must reuse vendor_payment Finance kind");
expect(!/insert\s+into\s+public\.finance_transactions[\s\S]{0,1200}vendor_payment/i.test(sql), "F3B must not create a parallel vendor-payment engine; F3C owns payment creation");

for (const rpc of [
  "get_vendor_invoices_page",
  "get_vendor_invoice_detail",
  "create_vendor_invoice_draft",
  "update_vendor_invoice_draft",
  "set_vendor_invoice_lines",
  "open_vendor_invoice",
  "void_vendor_invoice",
  "allocate_vendor_payment_to_invoice",
  "reverse_vendor_invoice_payment_allocation",
]) {
  expect(sql.includes(`private.${rpc}`), `A6-F3B private core ${rpc} is required`);
  expect(sql.includes(`public.${rpc}`), `A6-F3B public RPC ${rpc} is required`);
}
expect(/finance_assert_view/i.test(sql) && /finance_assert_manage/i.test(sql), "F3B must reuse Finance authorization cores");
expect(/security\s+definer/i.test(sql) && /set\s+search_path\s*=\s*''/i.test(sql), "F3B protected RPC boundary must pin SECURITY DEFINER search_path");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "F3B private cores must not be app-callable");
expect(/revoke[\s\S]{0,500}(insert|update|delete|truncate)[\s\S]{0,700}vendor_invoices/i.test(sql), "F3B must preserve closed direct browser mutation on vendor_invoices");

expect(/customer_project_procurement_invoice_allocations/i.test(sql), "Existing procurement invoice allocation history must be preserved/bridged");
expect(!/drop\s+table[\s\S]{0,200}customer_project_procurement_invoice_allocations/i.test(sql), "F3B must not replace procurement invoice allocation truth");
expect(/record_customer_project_procurement_invoice/i.test(sql), "Existing procurement invoice recorder must be extended for AP semantics");

const route = "src/app/(admin)/finance/bills/page.tsx";
const manager = "src/components/finance/FinanceVendorBillsManager.tsx";
const adapter = "src/lib/finance/vendorBills.ts";
for (const file of [route, manager, adapter]) expect(exists(file), `Missing A6-F3B Vendor Bills surface: ${file}`);
expect(read(route).includes("PageBreadCrumb"), "Finance Vendor Bills route must use shared PageBreadCrumb");
const ui = read(manager);
for (const primitive of ["ComponentCard", "Alert", "Button", "Label", "Input", "Select", "TableViewport"]) {
  expect(ui.includes(primitive), `Finance Vendor Bills must reuse shared ${primitive}`);
}
for (const term of ["Due", "Outstanding", "Vendor", "Payment", "Project", "Order"]) {
  expect(ui.toLowerCase().includes(term.toLowerCase()), `Vendor Bills UI must expose ${term}`);
}
const sidebar = read("src/layout/AppSidebar.tsx");
expect(sidebar.includes('path: "/finance/bills"') && sidebar.includes('permission: "finance.view"'), "Finance sidebar must expose Vendor Bills using finance.view");

console.log("A6-F3B Vendor Bills / AP Core contract: PASS");