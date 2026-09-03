import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `PB-3A requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function readRepo(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `PB-3A requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

const permissions = read("src/lib/auth/permissions.ts");
const projectDetail = read("src/components/customers/ProjectDetailWorkspace.tsx");
const invoiceDetail = read("src/components/customers/CustomerInvoiceDetail.tsx");
const paymentDomain = read("src/lib/customers/project-payments.ts");
const paymentStatusDomain = read("src/lib/customers/project-payment-status.ts");
const financeTab = read("src/components/customers/project-detail/ProjectFinanceTab.tsx");
const migration = readRepo("modulex-store/supabase/migrations/20260903143000_customer_project_payment_ledger.sql");
const hardening = readRepo("modulex-store/supabase/migrations/20260903143500_customer_project_payment_ledger_hardening.sql");
const invoiceRoleGuard = readRepo("modulex-store/supabase/migrations/20260903144000_customer_project_payment_invoice_role_guard.sql");
const advisorCleanup = readRepo("modulex-store/supabase/migrations/20260903144500_customer_project_payment_advisor_cleanup.sql");
const allSql = `${migration}\n${hardening}\n${invoiceRoleGuard}\n${advisorCleanup}`;
const salesPermissions = permissions.match(/sales:\s*\[([\s\S]*?)\],\s*finance:/)?.[1] ?? "";
const financePermissions = permissions.match(/finance:\s*\[([\s\S]*?)\],\s*hr:/)?.[1] ?? "";

assert(permissions.includes('"project_payments.view"'), "PB-3A requires project_payments.view");
assert(permissions.includes('"project_payments.manage"'), "PB-3A requires project_payments.manage");
assert(salesPermissions.includes('"project_payments.view"'), "Sales must receive project_payments.view");
assert(!salesPermissions.includes('"project_payments.manage"'), "Sales must not receive project_payments.manage");
assert(financePermissions.includes('"project_payments.manage"'), "Finance must receive project_payments.manage");

assert(paymentDomain.includes('.rpc("get_customer_project_payment_ledger"'), "Finance/Admin must use authoritative Project payment ledger RPC");
assert(paymentDomain.includes('.rpc("create_customer_project_payment_requirement"'), "Project payment domain must create requirements through RPC");
assert(paymentDomain.includes('.rpc("record_customer_project_payment"'), "Project payment domain must record actual payments through RPC");
assert(paymentDomain.includes('.rpc("allocate_customer_project_payment"'), "Project payment domain must allocate payments through RPC");
assert(paymentDomain.includes('.rpc("reverse_customer_project_payment"'), "Project payment domain must reverse payments through RPC");
assert(paymentStatusDomain.includes('.rpc("get_customer_project_payment_status"'), "Sales must use sanitized Project payment status RPC");

for (const forbidden of ["amount", "paid_amount", "balance", "cost", "margin", "profit", "vendor_price", "expense_amount"]) {
  assert(!new RegExp(`\\b${forbidden}\\b`, "i").test(paymentStatusDomain), `Sales payment status adapter must not model restricted field ${forbidden}`);
}

for (const tab of ["Overview", "Orders", "Finance", "Procurement", "Fulfillment", "Documents", "Activity"]) assert(projectDetail.includes(`"${tab}"`), `Project detail must expose ${tab} tab`);
assert(projectDetail.includes('role="tablist"'), "Project detail tabs must expose tablist semantics");
assert(projectDetail.includes('role="tab"'), "Project detail tabs must expose tab semantics");
assert(financeTab.includes("loadProjectPaymentStatus"), "Project Finance must support Sales-safe payment status");
assert(financeTab.includes("loadProjectPaymentLedger"), "Project Finance must support Admin/Finance ledger detail");
assert(financeTab.includes("ProjectFinancialSummary"), "Project Finance must preserve PB-2 profitability separately");

assert(invoiceDetail.includes("ledger_managed"), "Invoice detail must distinguish legacy and ledger-managed invoices");
assert(invoiceDetail.includes("Legacy payment tracking") || invoiceDetail.includes("ledgerManaged"), "Invoice detail must preserve an explicit legacy compatibility path");
assert(invoiceDetail.includes('hasPermission(profile.role, "project_payments.manage")'), "Invoice payment controls must use the dedicated Project payment mutation permission");
assert(invoiceDetail.includes("canManagePayments") && invoiceDetail.includes("!ledgerManaged && canManagePayments"), "Legacy paid_amount controls must be hidden from Sales");
assert(invoiceRoleGuard.includes("Sales cannot record customer payments"), "DB must reject Sales paid_amount mutations even for legacy invoices");

for (const tableName of ["customer_project_payment_requirements", "customer_project_payment_transactions", "customer_project_payment_allocations"]) assert(migration.includes(tableName), `PB-3A migration must create ${tableName}`);
for (const functionName of ["get_customer_project_payment_ledger", "get_customer_project_payment_status", "create_customer_project_payment_requirement", "record_customer_project_payment", "allocate_customer_project_payment", "reverse_customer_project_payment"]) assert(allSql.includes(functionName), `PB-3A SQL must define ${functionName}`);
assert(migration.includes("ledger_managed"), "PB-3A migration must add ledger_managed invoice compatibility state");
assert(migration.includes("customer_invoices") && migration.includes("paid_amount"), "PB-3A migration must reconcile ledger-managed invoices to paid_amount compatibility projection");
assert(!migration.toLowerCase().includes("insert into public.customer_project_payment_transactions select"), "PB-3A must not fabricate historical payment transactions from existing invoice paid_amount");
assert(allSql.includes("voided_at") && allSql.includes("voided_by") && allSql.includes("void_reason"), "PB-3A payment voids must retain explicit immutable audit metadata");
assert(hardening.includes("revoke") && hardening.includes("grant"), "PB-3A hardening migration must define explicit execute/table access boundaries");

for (const privateEntrypoint of [
  "private.get_customer_project_payment_ledger(uuid)",
  "private.get_customer_project_payment_status(uuid)",
  "private.create_customer_project_payment_requirement(uuid, text, numeric, text, date, text, uuid)",
  "private.record_customer_project_payment(uuid, numeric, text, date, uuid, text, text)",
  "private.allocate_customer_project_payment(uuid, uuid, numeric)",
  "private.reverse_customer_project_payment(uuid, numeric, text)",
  "private.void_customer_project_payment(uuid, text)",
]) assert(hardening.includes(`grant execute on function ${privateEntrypoint} to authenticated, service_role;`), `SECURITY INVOKER wrapper chain requires authenticated EXECUTE on ${privateEntrypoint}`);

for (const indexName of [
  "customer_project_payment_requirements_cancelled_by_idx",
  "customer_project_payment_requirements_created_by_idx",
  "customer_project_payment_requirements_updated_by_idx",
  "customer_project_payment_transactions_payment_method_idx",
  "customer_project_payment_transactions_created_by_idx",
  "customer_project_payment_transactions_voided_by_idx",
  "customer_project_payment_allocations_created_by_idx",
]) assert(advisorCleanup.includes(indexName), `PB-3A advisor cleanup must add ${indexName}`);

for (const tableName of [
  "customer_project_payment_requirements",
  "customer_project_payment_transactions",
  "customer_project_payment_allocations",
]) {
  assert(advisorCleanup.includes(`on public.${tableName}`), `PB-3A advisor cleanup must define explicit deny RLS for ${tableName}`);
}
assert(advisorCleanup.includes("as restrictive") && advisorCleanup.includes("using (false)") && advisorCleanup.includes("with check (false)"), "PB-3A ledger tables must keep explicit deny-by-default RLS policies");

console.log("PASS: PB-3A Project payment ledger contract");
