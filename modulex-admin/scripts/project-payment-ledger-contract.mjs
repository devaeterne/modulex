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
const allSql = `${migration}\n${hardening}`;

assert(permissions.includes('"project_payments.view"'), "PB-3A requires project_payments.view");
assert(permissions.includes('"project_payments.manage"'), "PB-3A requires project_payments.manage");
assert(/sales:\s*\[[\s\S]*?"project_payments\.view"/.test(permissions), "Sales must receive project_payments.view");
assert(!/sales:\s*\[[\s\S]*?"project_payments\.manage"/.test(permissions), "Sales must not receive project_payments.manage");
assert(/finance:\s*\[[\s\S]*?"project_payments\.manage"/.test(permissions), "Finance must receive project_payments.manage");

assert(paymentDomain.includes('.rpc("get_customer_project_payment_ledger"'), "Finance/Admin must use authoritative Project payment ledger RPC");
assert(paymentDomain.includes('.rpc("create_customer_project_payment_requirement"'), "Project payment domain must create requirements through RPC");
assert(paymentDomain.includes('.rpc("record_customer_project_payment"'), "Project payment domain must record actual payments through RPC");
assert(paymentDomain.includes('.rpc("allocate_customer_project_payment"'), "Project payment domain must allocate payments through RPC");
assert(paymentDomain.includes('.rpc("reverse_customer_project_payment"'), "Project payment domain must reverse payments through RPC");
assert(paymentStatusDomain.includes('.rpc("get_customer_project_payment_status"'), "Sales must use sanitized Project payment status RPC");

for (const forbidden of ["amount", "paid_amount", "balance", "cost", "margin", "profit", "vendor_price", "expense_amount"]) {
  assert(!new RegExp(`\\b${forbidden}\\b`, "i").test(paymentStatusDomain), `Sales payment status adapter must not model restricted field ${forbidden}`);
}

for (const tab of ["Overview", "Orders", "Finance", "Procurement", "Fulfillment", "Documents", "Activity"]) {
  assert(projectDetail.includes(`"${tab}"`), `Project detail must expose ${tab} tab`);
}
assert(projectDetail.includes('role="tablist"'), "Project detail tabs must expose tablist semantics");
assert(projectDetail.includes('role="tab"'), "Project detail tabs must expose tab semantics");
assert(financeTab.includes("loadProjectPaymentStatus"), "Project Finance must support Sales-safe payment status");
assert(financeTab.includes("loadProjectPaymentLedger"), "Project Finance must support Admin/Finance ledger detail");
assert(financeTab.includes("ProjectFinancialSummary"), "Project Finance must preserve PB-2 profitability separately");

assert(invoiceDetail.includes("ledger_managed"), "Invoice detail must distinguish legacy and ledger-managed invoices");
assert(invoiceDetail.includes("Legacy payment tracking") || invoiceDetail.includes("ledgerManaged"), "Invoice detail must preserve an explicit legacy compatibility path");

for (const tableName of ["customer_project_payment_requirements", "customer_project_payment_transactions", "customer_project_payment_allocations"]) {
  assert(migration.includes(tableName), `PB-3A migration must create ${tableName}`);
}
for (const functionName of ["get_customer_project_payment_ledger", "get_customer_project_payment_status", "create_customer_project_payment_requirement", "record_customer_project_payment", "allocate_customer_project_payment", "reverse_customer_project_payment"]) {
  assert(allSql.includes(functionName), `PB-3A SQL must define ${functionName}`);
}
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
]) {
  assert(hardening.includes(`grant execute on function ${privateEntrypoint} to authenticated, service_role;`), `SECURITY INVOKER wrapper chain requires authenticated EXECUTE on ${privateEntrypoint}`);
}

console.log("PASS: PB-3A Project payment ledger contract");
