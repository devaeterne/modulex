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
  assert(fs.existsSync(fullPath), `Payment edit/delete closeout requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function readRepo(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Payment edit/delete closeout requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

const domain = read("src/lib/customers/project-payments.ts");
const financeTab = read("src/components/customers/project-detail/ProjectFinanceTab.tsx");
const legacyMigration = readRepo("modulex-store/supabase/migrations/20260903150000_customer_project_payment_edit_delete_audit.sql");
const f5c = read("sql/project-f5c-payment-hardening.sql");

// Historical PB-3A audit provenance remains in place for rows created before F5C.
assert(legacyMigration.includes("customer_project_payment_audit_log"), "Legacy edit/delete audit history must remain queryable for historical provenance");
assert(legacyMigration.includes("before_snapshot"), "Historical audit rows must preserve pre-change snapshots");
assert(legacyMigration.includes("after_snapshot"), "Historical edit audit rows must preserve post-change snapshots");
assert(legacyMigration.includes("allocation_snapshot"), "Historical audit rows must preserve allocation snapshots");
assert(legacyMigration.includes("enable row level security"), "Historical audit table must retain RLS");
assert(legacyMigration.includes("revoke all on table public.customer_project_payment_audit_log"), "Historical audit table must remain unavailable to browser roles");

// F5C closes the destructive compatibility exception without dropping the public ABI.
assert(!domain.includes('.rpc("update_customer_project_payment"'), "F5C Admin adapter must not call the legacy posted-payment edit RPC");
assert(!domain.includes('.rpc("delete_customer_project_payment"'), "F5C Admin adapter must not call the legacy posted-payment hard-delete RPC");
assert(!financeTab.includes(">Edit Payment</Button>"), "F5C Project Finance must present posted payment history as immutable");
assert(!financeTab.includes(">Delete Payment</Button>"), "F5C Project Finance must not expose destructive posted-payment deletion");
assert(financeTab.includes("immutable") && financeTab.includes("void/reversal"), "F5C UI must direct corrections to append-safe void/reversal semantics");

assert(f5c.includes("private.update_customer_project_payment"), "F5C must preserve the legacy update ABI as a fail-closed compatibility stub");
assert(f5c.includes("private.delete_customer_project_payment"), "F5C must preserve the legacy delete ABI as a fail-closed compatibility stub");
assert(f5c.includes("Posted Project payment history is immutable"), "F5C compatibility stubs must reject destructive posted-history mutation");
assert(!/create\s+table/i.test(f5c), "F5C must not replace or rewrite the historical audit model");

console.log("PASS: Project payment edit/delete audit compatibility closed by F5C immutable history");
