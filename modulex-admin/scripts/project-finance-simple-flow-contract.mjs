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
  assert(fs.existsSync(fullPath), `Simple Project Finance requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function readRepo(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Simple Project Finance requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

const domain = read("src/lib/customers/project-payments.ts");
const financeTab = read("src/components/customers/project-detail/ProjectFinanceTab.tsx");
const migration = readRepo("modulex-store/supabase/migrations/20260903171000_customer_project_payment_plan_quick_flow.sql");

assert(domain.includes('.rpc("record_and_allocate_customer_project_payment"'), "Payment Received must use one atomic payment+allocation RPC");
assert(domain.includes('.rpc("delete_customer_project_payment_requirement"'), "Payment Plan delete must use a role-guarded delete RPC");

assert(financeTab.includes("Payment Received"), "Payment Plan rows must expose Payment Received");
assert(financeTab.includes("Add Plan"), "Payment Plan creation must move behind an Add Plan action");
assert(financeTab.includes("Delete Plan"), "Payment Plan rows must expose Delete Plan");
assert(financeTab.includes("Payment History"), "Project Finance must expose a compact Payment History section");
assert(financeTab.includes('label="Order Value"'), "Simple overview must keep Order Value");
assert(financeTab.includes('label="Collected"'), "Simple overview must keep Collected");
assert(financeTab.includes('label="Balance"'), "Simple overview must show customer Balance");
assert(financeTab.includes('label="Credit"'), "Simple overview must show project Credit");
assert(!financeTab.includes('title="Allocate Payment"'), "Project Finance must not expose the technical Allocate Payment card in the primary flow");
assert(!financeTab.includes('title="Reverse Payment"'), "Project Finance must not expose the technical Reverse Payment card in the primary flow");
assert(!financeTab.includes('>Record Payment</Button>'), "Project Finance must not expose the separate Record Payment primary form");

assert(migration.includes("customer_project_payment_requirement_audit_log"), "Deleted payment plans must have a dedicated immutable audit log");
assert(migration.includes("allocation_snapshot"), "Payment Plan deletion audit must preserve released allocations");
assert(migration.includes("delete from public.customer_project_payment_allocations"), "Deleting a plan must release its live allocations");
assert(migration.includes("delete from public.customer_project_payment_requirements"), "Deleting a plan must remove the live requirement row");
assert(migration.includes("record_and_allocate_customer_project_payment"), "Quick payment flow must be atomic inside the database");
assert(migration.includes("42501"), "Quick payment and plan deletion RPCs must remain role guarded");
assert(migration.includes("enable row level security"), "Plan deletion audit must enable RLS");
assert(migration.includes("Project payment requirement audit rows are immutable"), "Plan deletion audit rows must be immutable");

console.log("PASS: Project Finance simple flow contract");
