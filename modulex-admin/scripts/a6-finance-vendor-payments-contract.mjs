import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const sqlPath = "sql/a6-finance-vendor-payments.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260905235900_a6_finance_vendor_payments.sql";
expect(exists(sqlPath), "A6-F3C Vendor Payments SQL must exist");
expect(exists(migrationPath), "A6-F3C shared migration mirror must exist");
const sql = read(sqlPath);
const migration = read(migrationPath);
expect(sql === migration, "A6-F3C Admin SQL and shared migration must stay byte-identical");

expect(/alter\s+table\s+public\.finance_transactions[\s\S]{0,1800}payment_method_id/i.test(sql), "F3C must extend Finance transactions with canonical payment_method_id");
expect(/references\s+public\.payment_methods/i.test(sql), "F3C payment method must reuse canonical payment_methods");
expect(/system_key[\s\S]{0,500}check/i.test(sql), "F3C must ensure canonical Check payment method exists");
expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(?:vendor_payments|finance_vendor_payments)/i.test(sql), "F3C must not duplicate Finance vendor_payment ledger");
expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.vendor_invoice_payment_allocations/i.test(sql), "F3C must reuse F3B bill payment allocations");
expect(!/(?:add\s+column(?:\s+if\s+not\s+exists)?|create\s+table[\s\S]{0,1200})\s+scheduled_payment_date\b/i.test(sql), "F3C must not add F3D scheduled-payment storage");

expect(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.finance_payment_instruments/i.test(sql), "F3C must add the missing payment-instrument child model");
for (const term of ["transaction_id", "payment_method_id", "instrument_type", "instrument_number", "issued_at", "cleared_at", "voided_at", "returned_at", "source_account_id"]) {
  expect(sql.includes(term), `Payment instrument model must include ${term}`);
}
for (const status of ["issued", "cleared", "voided", "returned"]) expect(sql.includes(`'${status}'`), `Check lifecycle must include ${status}`);
expect(/unique[\s\S]{0,1200}(source_account_id|instrument_number)/i.test(sql) || /unique\s+index[\s\S]{0,1200}(source_account_id|instrument_number)/i.test(sql), "Check number uniqueness must be scoped to the source financial account");
expect(/finance_payment_instrument_audit/i.test(sql), "Instrument lifecycle must have append-safe audit history");

for (const rpc of [
  "get_vendor_payments_page",
  "get_vendor_payment_detail",
  "get_vendor_payment_reference_data",
  "create_vendor_payment_draft",
  "post_vendor_payment",
  "delete_vendor_payment_draft",
  "clear_vendor_payment_instrument",
  "void_vendor_payment_instrument",
  "return_vendor_payment_instrument",
]) {
  expect(sql.includes(`private.${rpc}`), `A6-F3C private core ${rpc} is required`);
  expect(sql.includes(`public.${rpc}`), `A6-F3C public RPC ${rpc} is required`);
}
expect(/private\.reverse_vendor_payment\s*\(\s*p_transaction_id\s+uuid\s*,\s*p_reason\s+text\s*,\s*p_idempotency_key\s+uuid\s*\)/i.test(sql), "Vendor Payment reversal private signature must remain stable for Finance-aware extension");
expect(/public\.reverse_vendor_payment\s*\(\s*p_transaction_id\s+uuid\s*,\s*p_reason\s+text\s*,\s*p_idempotency_key\s+uuid/i.test(sql), "Vendor Payment reversal public signature must remain stable for current clients");
expect(/private\.create_finance_transaction_draft/i.test(sql), "Vendor payment draft creation must reuse Finance Core draft creation");
expect(/private\.post_finance_transaction/i.test(sql), "Vendor payment posting must reuse Finance Core posting/FX");
expect(/private\.reverse_finance_transaction/i.test(sql), "Check void/return correction must reuse Finance reversal");
expect(/private\.allocate_vendor_payment_to_invoice/i.test(sql), "Vendor payment posting must reuse F3B bill allocation core");
expect(/private\.reverse_vendor_invoice_payment_allocation/i.test(sql), "Check void/return must reconcile F3B allocations");
expect(/unapplied/i.test(sql), "F3C must explicitly expose unapplied vendor payment balance");
expect(/vendor_id/i.test(sql) && /vendor_payment/i.test(sql), "Vendor payments must require canonical Vendor attribution");
expect(/modulex\.vendor_payment_flow/i.test(sql), "Generic vendor_payment creation/posting must be closed behind the canonical source-managed flow");
expect(/finance_assert_view/i.test(sql) && /finance_assert_manage/i.test(sql), "F3C must reuse Finance authorization cores");
expect(/security\s+definer/i.test(sql) && /set\s+search_path\s*=\s*''/i.test(sql), "F3C protected RPCs must pin SECURITY DEFINER search_path");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "F3C private cores must not be app-callable");

const adapter = "src/lib/finance/vendorPayments.ts";
const route = "src/app/(admin)/finance/vendor-payments/page.tsx";
const manager = "src/components/finance/FinanceVendorPaymentsManager.tsx";
for (const file of [adapter, route, manager]) expect(exists(file), `Missing A6-F3C Vendor Payments surface: ${file}`);
expect(read(route).includes("PageBreadCrumb"), "Vendor Payments route must use shared PageBreadCrumb");
const ui = read(manager);
for (const primitive of ["ComponentCard", "Alert", "Badge", "Button", "Label", "Input", "Select", "TableViewport"]) expect(ui.includes(primitive), `Vendor Payments must reuse shared ${primitive}`);
for (const term of ["Vendor", "Payment Method", "Check", "Allocated", "Unapplied", "Clear", "Return"]) expect(ui.toLowerCase().includes(term.toLowerCase()), `Vendor Payments UI must expose ${term}`);
const transactionUi = read("src/components/finance/FinanceTransactionsManager.tsx");
expect(!/kindOptions[\s\S]{0,500}value:\s*"vendor_payment"/.test(transactionUi), "Generic Finance draft UI must route vendor payments through canonical Vendor Payments flow");
const sidebar = read("src/layout/AppSidebar.tsx");
expect(sidebar.includes('path: "/finance/vendor-payments"') && sidebar.includes('permission: "finance.view"'), "Finance sidebar must expose Vendor Payments using finance.view");

console.log("A6-F3C Vendor Payments + Check Lifecycle contract: PASS");
