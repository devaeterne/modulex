import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `F5C requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
};
const readRepo = (relativePath) => {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `F5C requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
};
const functionBlock = (source, qualifiedName) => {
  const start = source.toLowerCase().indexOf(`create or replace function ${qualifiedName}`.toLowerCase());
  if (start < 0) return "";
  const next = source.toLowerCase().indexOf("create or replace function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
};

const sqlPath = "sql/project-f5c-payment-hardening.sql";
const migrationDir = path.join(repoRoot, "modulex-store/supabase/migrations");
const mirrors = fs.existsSync(migrationDir)
  ? fs.readdirSync(migrationDir).filter((name) => name.endsWith("_a6_f5c_project_payment_hardening.sql"))
  : [];

const sql = read(sqlPath);
assert(mirrors.length === 1, `F5C requires exactly one Store migration mirror, found ${mirrors.length}`);
const migration = readRepo(`modulex-store/supabase/migrations/${mirrors[0]}`);
assert(sql === migration, "F5C Admin SQL and Store migration mirror must remain byte-identical");

assert(!/create\s+table/i.test(sql), "F5C must not create a replacement payment/Finance ledger");
assert(!/insert\s+into\s+public\.finance_transactions/i.test(sql), "F5C must not fabricate Finance transactions");
assert(!/update\s+public\.finance_transactions/i.test(sql), "F5C Project hardening must not mutate Finance history");

const transactionGuard = functionBlock(sql, "private.guard_posted_project_payment_transaction");
assert(transactionGuard, "F5C must harden private.guard_posted_project_payment_transaction");
assert(/tg_op\s*=\s*'DELETE'/i.test(transactionGuard), "Posted Project-payment guard must explicitly handle DELETE");
assert(/old\.status\s+in\s*\(\s*'posted'\s*,\s*'voided'\s*\)/i.test(transactionGuard), "Posted/voided Project-payment DELETE must fail closed");
assert(/new\.status\s*=\s*'voided'/i.test(transactionGuard) && /voided_at/i.test(transactionGuard) && /void_reason/i.test(transactionGuard), "F5C must preserve the canonical posted-to-voided transition contract");
assert(/before\s+update\s+or\s+delete\s+on\s+public\.customer_project_payment_transactions/i.test(sql), "Project-payment immutability trigger must cover UPDATE and DELETE");

const allocationGuard = functionBlock(sql, "private.guard_posted_project_payment_allocation");
assert(allocationGuard, "F5C must add a posted Project-payment allocation guard");
assert(/tg_op\s+in\s*\(\s*'UPDATE'\s*,\s*'DELETE'\s*\)/i.test(allocationGuard) || /tg_op\s*=\s*'UPDATE'[\s\S]*tg_op\s*=\s*'DELETE'/i.test(allocationGuard), "Allocation guard must cover UPDATE/DELETE");
assert(/customer_project_payment_transactions/i.test(allocationGuard) && /status\s+in\s*\(\s*'posted'\s*,\s*'voided'\s*\)/i.test(allocationGuard), "Allocation guard must protect posted/voided source history");
assert(/before\s+update\s+or\s+delete\s+on\s+public\.customer_project_payment_allocations/i.test(sql), "Allocation immutability trigger must cover UPDATE and DELETE only");
assert(!/before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.customer_project_payment_allocations/i.test(sql), "Initial/reversal allocation INSERT must remain available");

for (const name of ["private.update_customer_project_payment", "private.delete_customer_project_payment"]) {
  const block = functionBlock(sql, name);
  assert(block, `F5C must redefine ${name}`);
  assert(/raise\s+exception/i.test(block), `${name} must fail closed`);
  assert(/immutable|void|reversal|correction/i.test(block), `${name} must direct callers to append-safe correction semantics`);
  assert(!/delete\s+from\s+public\.customer_project_payment/i.test(block), `${name} must no longer delete payment/allocation history`);
  assert(!/insert\s+into\s+public\.customer_project_payment_transactions/i.test(block), `${name} must not replace a posted payment row`);
}

const requirementDelete = functionBlock(sql, "private.delete_customer_project_payment_requirement");
assert(requirementDelete, "F5C must harden Payment Plan deletion where posted allocations exist");
assert(/customer_project_payment_allocations/i.test(requirementDelete) && /customer_project_payment_transactions/i.test(requirementDelete), "Payment Plan deletion must inspect payment allocation history");
assert(/status\s+in\s*\(\s*'posted'\s*,\s*'voided'\s*\)/i.test(requirementDelete), "Payment Plan deletion must fail closed for posted/voided allocation history");
assert(/raise\s+exception/i.test(requirementDelete), "Allocated Payment Plan deletion must reject instead of releasing historical allocations");

const domain = read("src/lib/customers/project-payments.ts");
const financeTab = read("src/components/customers/project-detail/ProjectFinanceTab.tsx");
for (const rpc of ["record_customer_project_payment", "allocate_customer_project_payment", "reverse_customer_project_payment", "void_customer_project_payment"]) {
  assert(domain.includes(`.rpc("${rpc}"`), `F5C must preserve canonical ${rpc} support`);
}
assert(!domain.includes('.rpc("update_customer_project_payment"'), "Admin adapter must stop calling legacy posted-payment edit RPC");
assert(!domain.includes('.rpc("delete_customer_project_payment"'), "Admin adapter must stop calling legacy posted-payment hard-delete RPC");
assert(!financeTab.includes(">Edit Payment</Button>"), "Project Finance must stop advertising destructive edits for posted payment history");
assert(!financeTab.includes(">Delete Payment</Button>"), "Project Finance must stop advertising destructive hard-delete for posted payment history");
assert(financeTab.includes("immutable") || financeTab.includes("correction"), "Project Finance must explain immutable posted history/correction ownership");
assert(financeTab.includes("requirement.received > 0") || financeTab.includes("requirement.received === 0"), "Payment Plan UI must not offer deletion when posted allocations exist");

const legacyContract = read("scripts/project-payment-edit-delete-contract.mjs");
assert(!legacyContract.includes("must expose an Edit Payment action"), "Legacy regression contract must no longer require Edit Payment");
assert(!legacyContract.includes("must expose a Delete Payment action"), "Legacy regression contract must no longer require Delete Payment");
assert(legacyContract.includes("F5C") || legacyContract.includes("immutable"), "Legacy edit/delete contract must document the F5C compatibility closeout");

console.log("PASS: A6-F5C Project payment reconciliation / compatibility hardening contract");
