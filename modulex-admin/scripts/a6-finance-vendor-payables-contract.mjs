import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const sqlPath = "sql/a6-finance-vendor-payables.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql";
const adapter = "src/lib/finance/vendorPayables.ts";
const route = "src/app/(admin)/finance/bills/page.tsx";
const manager = "src/components/finance/FinanceVendorBillsManager.tsx";
const commitmentsPanel = "src/components/finance/vendor-payables/VendorCommitmentsPanel.tsx";
const billsPanel = "src/components/finance/vendor-payables/VendorBillsPanel.tsx";
const billEditor = "src/components/finance/vendor-payables/VendorBillEditorModal.tsx";
const billDetail = "src/components/finance/vendor-payables/VendorBillDetailPanel.tsx";
const paymentSchedule = "src/components/finance/FinancePaymentScheduleManager.tsx";

for (const file of [sqlPath, migrationPath, adapter, route, manager, commitmentsPanel, billsPanel, billEditor, billDetail]) {
  expect(exists(file), `Missing Vendor Payables artifact: ${file}`);
}

const sql = read(sqlPath);
const migration = read(migrationPath);
expect(sql === migration, "Vendor Payables Admin SQL and canonical migration must stay byte-identical");

for (const table of ["vendor_invoice_order_allocations", "vendor_payment_order_allocations"]) {
  expect(sql.includes(`public.${table}`), `Missing ${table}`);
  expect(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql), `${table} must enable RLS`);
}

for (const rpc of [
  "get_vendor_order_commitments_page",
  "get_vendor_order_commitment_detail",
  "get_vendor_invoice_commitment_reference_data",
  "set_vendor_invoice_order_allocations",
  "allocate_vendor_payment_to_orders",
]) {
  expect(sql.includes(`public.${rpc}`), `Missing public ${rpc}`);
  expect(sql.includes(`private.${rpc}`), `Missing private ${rpc}`);
}

expect(sql.includes("manual_vendor_cabinet"), "Vendor Cabinet order lines must be the commitment source");
expect(sql.includes("finance_assert_view") && sql.includes("finance_assert_manage"), "Finance permission cores must be reused");
expect(/security\s+definer/i.test(sql) && /set\s+search_path\s*=\s*''/i.test(sql), "SECURITY DEFINER functions must pin search_path");
expect(!/insert\s+into\s+public\.finance_transactions/i.test(sql), "Vendor Payables must not create a second cash ledger");
expect(/vendor_invoice_order_allocations[\s\S]{0,5000}for\s+update/i.test(sql), "Bill allocation capacity decisions must serialize on canonical AP rows");
expect(/vendor_payment_order_allocations[\s\S]{0,5000}reversal_of_allocation_id/i.test(sql), "Order settlement history must support append-only reversal rows");
expect(/customer_order_items[\s\S]{0,5000}manual_vendor_cabinet/i.test(sql), "Finance attribution must guard Vendor Cabinet financial identity");

const adapterSource = read(adapter);
for (const fn of [
  "getVendorOrderCommitmentsPage",
  "getVendorOrderCommitmentDetail",
  "getVendorInvoiceCommitmentReferenceData",
  "setVendorInvoiceOrderAllocations",
  "allocateVendorPaymentToOrders",
]) {
  expect(adapterSource.includes(fn), `Vendor Payables adapter must expose ${fn}`);
}
for (const state of ["planned", "committed", "cancelled", "not_invoiced", "partially_invoiced", "invoiced", "unpaid", "partially_paid", "paid"]) {
  expect(adapterSource.includes(`"${state}"`), `Vendor Payables adapter must type ${state}`);
}

const routeSource = read(route);
expect(routeSource.includes("PageBreadCrumb"), "Vendor Payables route must keep shared PageBreadCrumb");
expect(routeSource.includes("FinanceVendorBillsManager"), "Vendor Payables route must preserve the existing /finance/bills manager boundary");

const managerSource = read(manager);
for (const label of ["Commitments", "Vendor Bills", "Payment Schedule", "+ Add Vendor Bill"]) {
  expect(managerSource.includes(label), `Vendor Payables workspace must expose ${label}`);
}
expect(!managerSource.includes('title={editingId ? "Edit Vendor Bill Draft" : "New Vendor Bill Draft"}'), "Vendor Bills must not keep the permanent draft form at page top");
expect(!managerSource.includes("AP Lifecycle Inputs"), "Vendor Bills must not keep the permanent AP Lifecycle Inputs block");

const commitmentsSource = read(commitmentsPanel);
for (const term of ["Committed", "Invoiced", "Paid", "Remaining", "View Order", "View Project", "View Vendor", "View Vendor PDF", "Vendor Bills"]) {
  expect(commitmentsSource.includes(term), `Commitments UI must expose ${term}`);
}

const billsSource = read(billsPanel);
expect(billsSource.includes("+ Add Vendor Bill"), "Vendor Bills must use a contextual Add Vendor Bill action");

const detailSource = read(billDetail);
for (const tab of ["Overview", "Order Allocations", "Payments", "Audit"]) {
  expect(detailSource.includes(tab), `Vendor Bill detail must expose ${tab}`);
}

const editorSource = read(billEditor);
for (const term of ["Vendor", "Bill number", "Bill date", "Due date", "Currency"]) {
  expect(editorSource.includes(term), `Vendor Bill editor must expose ${term}`);
}

const scheduleSource = read(paymentSchedule);
expect(scheduleSource.includes("Open Vendor Bill is required"), "Payment Schedule must remain Vendor-Bill-based");
expect(!/commitment[^\n]{0,120}(schedule|payment)/i.test(scheduleSource), "Payment Schedule must not introduce commitment-only scheduling");

console.log("A6 Vendor Payables / Order Settlement contract: PASS");
