import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

const required = [
  "sql/a6-finance-f7-hardening.sql",
  "docs/acceptance/a6-f7-finance-hardening.md",
  "docs/acceptance/a6-f6-finance-reporting.md",
  "docs/FINANCE_DOMAIN_PLAN.md",
  "ADMIN_ROADMAP.md",
  "sql/a6-finance-core.sql",
  "sql/a6-finance-core-hardening.sql",
];

for (const file of required) {
  expect(exists(file), `Missing A6-F7 artifact: ${file}`);
}

const sql = read("sql/a6-finance-f7-hardening.sql");
const core = read("sql/a6-finance-core.sql");
const coreHardening = read("sql/a6-finance-core-hardening.sql");
const f6Acceptance = read("docs/acceptance/a6-f6-finance-reporting.md");
const f7Acceptance = read("docs/acceptance/a6-f7-finance-hardening.md");
const plan = read("docs/FINANCE_DOMAIN_PLAN.md");
const roadmap = read("ADMIN_ROADMAP.md");

const migrationsDir = path.join(root, "../modulex-store/supabase/migrations");
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith("_a6_finance_f7_hardening.sql"));
expect(migrationFiles.length === 1, `Expected exactly one A6-F7 Store migration mirror, found ${migrationFiles.length}`);
const migration = fs.readFileSync(path.join(migrationsDir, migrationFiles[0]), "utf8");
expect(sql === migration, "A6-F7 Admin SQL and Store migration mirror must be byte-identical");

const coveringIndexes = [
  "customer_project_payment_finance_links_created_by_idx",
  "finance_accounts_created_by_idx",
  "finance_accounts_updated_by_idx",
  "finance_categories_created_by_idx",
  "finance_categories_updated_by_idx",
  "finance_fx_rates_created_by_idx",
  "finance_idempotency_requests_created_by_idx",
  "finance_payment_instrument_audit_actor_idx",
  "finance_payment_instruments_created_by_idx",
  "finance_payment_instruments_updated_by_idx",
  "finance_transaction_links_created_by_idx",
  "finance_transactions_fx_rate_idx",
  "finance_transactions_updated_by_idx",
  "hr_payroll_finance_settlement_effects_actor_idx",
  "hr_payroll_finance_settlement_state_updated_by_idx",
  "vendor_invoice_audit_actor_idx",
  "vendor_invoice_idempotency_requests_created_by_idx",
  "vendor_invoice_lines_created_by_idx",
  "vendor_invoice_lines_updated_by_idx",
  "vendor_invoice_payment_allocations_actor_idx",
  "vendor_payment_schedule_audit_actor_idx",
  "vendor_payment_schedules_cancelled_by_idx",
  "vendor_payment_schedules_created_by_idx",
  "vendor_payment_schedules_updated_by_idx",
];
for (const indexName of coveringIndexes) {
  expect(sql.includes(indexName), `F7 hardening SQL missing Finance covering index: ${indexName}`);
}

expect(!/\bdrop\s+(table|index|function|schema)\b/i.test(sql), "F7 hardening must not destructively drop Finance schema objects");
expect(!/\bdelete\s+from\b|\bupdate\s+public\.|\binsert\s+into\b/i.test(sql), "F7 hardening migration must not rewrite production business data");
expect(!/\bgrant\b|\brevoke\b|\bsecurity\s+definer\b/i.test(sql), "F7 performance hardening must not widen or rewrite Finance authorization boundaries");

expect(core.includes("pg_advisory_xact_lock"), "Finance idempotency must serialize same-key retries with a transaction advisory lock");
expect(core.includes("finance_idempotency_requests_unique_key unique (operation, idempotency_key)"), "Finance idempotency must retain its unique operation/key boundary");
expect(coreHardening.includes("where id=p_transaction_id and status='draft' for update"), "Draft delete must keep row locking before destructive cleanup");
expect(coreHardening.includes("v_other_allocated + new.allocated_amount > v_transaction.amount"), "Finance allocations must remain protected against over-allocation");
expect(core.includes("reversal_of_transaction_id"), "Finance history must retain append-safe reversal linkage");
expect(core.includes("base_currency_code") && core.includes("base_amount") && core.includes("fx_rate"), "Finance Core must retain stored FX/base snapshots");

expect(/F6[^\n]*COMPLETE[^\n]*PRODUCTION VERIFIED/i.test(plan), "Finance plan must close F6 as production verified before F7 closeout");
expect(/F7[^\n]*(ACTIVE|IN PROGRESS|HARDENING)/i.test(plan), "Finance plan must identify F7 as active/in progress");
expect(/PRODUCTION VERIFIED/i.test(f6Acceptance), "F6 acceptance must record post-merge production verification");
expect(/F7/i.test(roadmap) && /Finance/i.test(roadmap), "Admin roadmap must track the active F7 Finance package");

for (const phrase of [
  "RLS/RPC/RBAC",
  "idempotency",
  "concurrency",
  "append-safe",
  "FX snapshot",
  "allocation reconciliation",
  "migration",
  "Security Advisor",
  "Performance Advisor",
  "signed-in Admin",
  "ROLLBACK",
]) {
  expect(f7Acceptance.toLowerCase().includes(phrase.toLowerCase()), `F7 acceptance must cover: ${phrase}`);
}

console.log("A6-F7 Finance hardening contract: ok");
