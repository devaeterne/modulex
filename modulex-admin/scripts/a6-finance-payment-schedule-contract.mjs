import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const sqlPath = "sql/a6-finance-payment-schedule.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260906113000_a6_finance_payment_schedule.sql";
const hardeningSqlPath = "sql/a6-finance-payment-schedule-hardening.sql";
const hardeningMigrationPath = "../modulex-store/supabase/migrations/20260906113100_a6_finance_payment_schedule_hardening.sql";
expect(exists(sqlPath), "A6-F3D Payment Schedule SQL must exist");
expect(exists(migrationPath), "A6-F3D shared migration mirror must exist");
expect(exists(hardeningSqlPath), "A6-F3D Payment Schedule hardening SQL must exist");
expect(exists(hardeningMigrationPath), "A6-F3D Payment Schedule hardening migration mirror must exist");
const sql = read(sqlPath);
const migration = read(migrationPath);
const hardeningSql = read(hardeningSqlPath);
const hardeningMigration = read(hardeningMigrationPath);
expect(sql === migration, "A6-F3D Admin SQL and shared migration must stay byte-identical");
expect(hardeningSql === hardeningMigration, "A6-F3D hardening SQL and migration must stay byte-identical");
expect(/vendor_invoices[\s\S]{0,180}for\s+update/i.test(hardeningSql), "F3D must serialize schedule capacity decisions on the canonical Vendor Bill row");
expect(/validate_vendor_payment_schedule_context/i.test(hardeningSql), "F3D concurrency hardening must protect canonical schedule validation");

// Existing-system-first boundary: schedule is planning, never a second AP settlement ledger.
expect(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.vendor_payment_schedules/i.test(sql), "F3D must add the missing AP payment schedule model");
expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(?:vendor_payments|finance_vendor_payments|vendor_invoice_payment_allocations)/i.test(sql), "F3D must not duplicate Vendor Payments or F3B allocations");
expect(!/alter\s+table\s+public\.vendor_invoices[\s\S]{0,800}add\s+column[\s\S]{0,200}scheduled_payment_date/i.test(sql), "F3D must support multiple installments instead of one scheduled date on the bill");
for (const term of ["vendor_id", "invoice_id", "scheduled_payment_date", "planned_amount", "currency_code", "payment_method_id", "source_account_id", "status"]) {
  expect(sql.includes(term), `Payment schedule must include ${term}`);
}
expect(/references\s+public\.vendor_invoices/i.test(sql), "Schedule must reuse canonical Vendor Bills");
expect(/references\s+public\.vendors/i.test(sql), "Schedule must reuse canonical Vendors");
expect(/references\s+public\.payment_methods/i.test(sql), "Schedule must reuse canonical Payment Methods");
expect(/references\s+public\.finance_accounts/i.test(sql), "Schedule must reuse canonical Finance accounts");
expect(/planned[\s\S]{0,300}cancelled/i.test(sql), "Schedule lifecycle must distinguish planned and cancelled rows");
expect(/sum\([\s\S]{0,200}amount_delta/i.test(sql), "Schedule read model must reuse actual F3B allocations for paid balance");
expect(/outstanding_amount/i.test(sql) && /scheduled_remaining_amount/i.test(sql), "Schedule must expose bill outstanding and unscheduled balance separately");
expect(/due_date/i.test(sql) && /scheduled_payment_date/i.test(sql), "F3D must preserve due date vs scheduled payment date semantics");

for (const rpc of [
  "get_vendor_payment_schedule_reference_data",
  "get_vendor_payment_schedules_page",
  "create_vendor_payment_schedule",
  "update_vendor_payment_schedule",
  "cancel_vendor_payment_schedule",
]) {
  expect(sql.includes(`private.${rpc}`), `A6-F3D private core ${rpc} is required`);
  expect(sql.includes(`public.${rpc}`), `A6-F3D public RPC ${rpc} is required`);
}
expect(/finance_assert_view/i.test(sql) && /finance_assert_manage/i.test(sql), "F3D must reuse Finance authorization cores");
expect(/security\s+definer/i.test(sql) && /set\s+search_path\s*=\s*''/i.test(sql), "F3D protected RPCs must pin SECURITY DEFINER search_path");
expect(/revoke\s+all\s+on\s+public\.vendor_payment_schedules/i.test(sql), "Direct schedule table mutation must stay closed to browser roles");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "F3D private cores must not be app-callable");

const adapter = "src/lib/finance/paymentSchedule.ts";
const route = "src/app/(admin)/finance/payment-schedule/page.tsx";
const manager = "src/components/finance/FinancePaymentScheduleManager.tsx";
for (const file of [adapter, route, manager]) expect(exists(file), `Missing A6-F3D Payment Schedule surface: ${file}`);
expect(read(route).includes("PageBreadCrumb"), "Payment Schedule route must use shared PageBreadCrumb");
const ui = read(manager);
for (const primitive of ["ComponentCard", "Alert", "Badge", "Button", "Label", "Input", "Select", "TableViewport"]) expect(ui.includes(primitive), `Payment Schedule must reuse shared ${primitive}`);
for (const term of ["Due date", "Scheduled date", "Planned", "Outstanding", "Unscheduled", "Payment Method", "Source account", "Cancel"]) expect(ui.toLowerCase().includes(term.toLowerCase()), `Payment Schedule UI must expose ${term}`);
const sidebar = read("src/layout/AppSidebar.tsx");
expect(sidebar.includes('path: "/finance/payment-schedule"') && sidebar.includes('permission: "finance.view"'), "Finance sidebar must expose Payment Schedule using finance.view");

console.log("A6-F3D Vendor Payment Schedule contract: PASS");