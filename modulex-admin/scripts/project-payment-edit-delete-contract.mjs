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
  assert(fs.existsSync(fullPath), `Payment edit/delete requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function readRepo(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Payment edit/delete requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

const domain = read("src/lib/customers/project-payments.ts");
const financeTab = read("src/components/customers/project-detail/ProjectFinanceTab.tsx");
const migration = readRepo("modulex-store/supabase/migrations/20260903150000_customer_project_payment_edit_delete_audit.sql");

assert(domain.includes('.rpc("update_customer_project_payment"'), "Admin/Finance payment edits must use update_customer_project_payment RPC");
assert(domain.includes('.rpc("delete_customer_project_payment"'), "Admin/Finance hard deletes must use delete_customer_project_payment RPC");

assert(financeTab.includes("Edit Payment"), "Customer Payments must expose an Edit Payment action");
assert(financeTab.includes("Delete Payment"), "Customer Payments must expose a Delete Payment action");
assert(financeTab.includes("Update Payment"), "Finance must expose an explicit Update Payment confirmation action");
assert(financeTab.includes("Delete reason"), "Hard delete must require a visible deletion reason");

assert(migration.includes("customer_project_payment_audit_log"), "Hard delete/edit must write to a dedicated immutable audit table");
assert(migration.includes("before_snapshot"), "Audit log must preserve the pre-change payment snapshot");
assert(migration.includes("after_snapshot"), "Edit audit must preserve the post-change payment snapshot");
assert(migration.includes("allocation_snapshot"), "Audit log must preserve affected allocation snapshots");
assert(migration.includes("action_type"), "Audit log must distinguish update and delete actions");
assert(migration.includes("reason"), "Audit log must support a change/delete reason");
assert(migration.includes("actor_id") && migration.includes("created_at"), "Audit log must record who acted and when");

assert(migration.includes("delete from public.customer_project_payment_allocations"), "Financial edits/deletes must be able to clear affected allocations");
assert(migration.includes("delete from public.customer_project_payment_transactions"), "Delete Payment must hard-delete the transaction from the canonical ledger");
assert(migration.includes("p_amount is distinct from") || migration.includes("v_financial_change"), "Edit must detect amount/currency financial changes explicitly");
assert(migration.includes("p_currency_code is distinct from") || migration.includes("v_financial_change"), "Currency edits must be treated as financial changes");
assert(migration.includes("allocation_snapshot") && migration.includes("delete from public.customer_project_payment_allocations"), "Allocation history must be snapshotted before financial edits or hard delete");

assert(migration.includes("raise exception") && migration.includes("42501"), "Edit/delete RPCs must remain Admin/Finance role guarded");
assert(migration.includes("transaction_type <> 'payment'") || migration.includes("transaction_type = 'payment'"), "Only original customer payment rows may be edited or hard-deleted");
assert(migration.includes("reversal_of_transaction_id"), "Delete/edit must account for existing reversal dependencies and fail closed when unsafe");
assert(migration.includes("enable row level security"), "Audit table must have RLS enabled");
assert(migration.includes("revoke all on table public.customer_project_payment_audit_log"), "Browser roles must not receive direct audit-table access");

console.log("PASS: Project payment edit/delete audit contract");
