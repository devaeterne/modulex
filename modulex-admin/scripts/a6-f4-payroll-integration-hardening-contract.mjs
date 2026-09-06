import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminSqlPath = path.join(here, "../sql/a6-f4-payroll-integration-hardening.sql");
const storeMigrationPath = path.join(
  here,
  "../../modulex-store/supabase/migrations/20260906170000_a6_f4_payroll_integration_hardening.sql",
);
const financePayrollClientPath = path.join(here, "../src/lib/finance/payroll.ts");
const financeManagerPath = path.join(here, "../src/components/finance/FinanceTransactionsManager.tsx");
const payrollManagerPath = path.join(here, "../src/components/hr/PayrollManager.tsx");

assert.ok(existsSync(adminSqlPath), "F4 hardening SQL must exist");
assert.ok(existsSync(storeMigrationPath), "Store migration mirror must exist");
assert.ok(existsSync(financePayrollClientPath), "F4 Finance payroll client must exist");

const sql = readFileSync(adminSqlPath, "utf8");
const storeSql = readFileSync(storeMigrationPath, "utf8");
const financePayrollClient = readFileSync(financePayrollClientPath, "utf8");
const financeManager = readFileSync(financeManagerPath, "utf8");
const payrollManager = readFileSync(payrollManagerPath, "utf8");

assert.equal(storeSql, sql, "Admin SQL and Store migration mirror must be byte-identical");

for (const required of [
  "hr_payroll_item",
  "hr_variable_pay",
  "hr_advance",
  "private.validate_finance_employee_payment_link",
  "private.validate_finance_employee_payment_posting",
  "private.reconcile_hr_direct_finance_source",
  "private.prepare_hr_payroll_run",
  "private.save_employee_payment_draft",
  "public.save_employee_payment_draft",
  "public.get_finance_payroll_obligations",
  "private.finance_base_currency()",
]) {
  assert.ok(sql.includes(required), `F4 hardening SQL must include ${required}`);
}

assert.match(
  sql,
  /source_document_type\s+not\s+in\s*\(\s*'hr_payroll_item'\s*,\s*'hr_variable_pay'\s*,\s*'hr_advance'\s*\)/i,
  "Employee payment source types must fail closed to the canonical HR source vocabulary",
);
assert.match(sql, /Finance payment would exceed the Variable Pay amount/i, "Direct Variable Pay settlement must prevent overpayment");
assert.match(sql, /Finance payment would exceed the Advance amount/i, "Direct Advance disbursement must prevent duplicate overpayment");
assert.match(sql, /status\s*=\s*'paid'/i, "Direct Variable Pay settlement must mark fully paid HR sources paid");
assert.match(sql, /status\s*=\s*'approved'/i, "Direct Variable Pay reversal must restore source eligibility");
assert.match(sql, /company base currency/i, "Payroll preparation must fail closed on unsupported source currency");
assert.match(
  sql,
  /not exists[\s\S]*source_document_type\s*=\s*'hr_variable_pay'/i,
  "Payroll preparation must defensively exclude Variable Pay already settled directly in Finance",
);
assert.match(
  sql,
  /language\s+sql\s+security\s+definer[\s\S]*set\s+search_path\s*=\s*''/i,
  "Public Finance bridge RPCs must use SECURITY DEFINER with a pinned empty search_path",
);
assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.save_employee_payment_draft/i, "Atomic employee payment draft RPC must revoke broad execute access");
assert.match(
  sql,
  /grant\s+execute\s+on\s+function\s+public\.save_employee_payment_draft[\s\S]*to\s+authenticated/i,
  "Atomic employee payment draft RPC must be authenticated-only",
);
assert.ok(
  !/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(?:finance_payroll|payroll_ledger|employee_payment_ledger)/i.test(sql),
  "F4 must not create a duplicate payroll/payment ledger",
);

assert.ok(financePayrollClient.includes("saveEmployeePaymentDraft"), "Finance client must expose the atomic employee payment draft RPC");
assert.ok(financePayrollClient.includes("getFinancePayrollObligations"), "Finance client must expose the read-only payroll obligation projection");
assert.ok(financeManager.includes("saveEmployeePaymentDraft"), "Finance Employee Payment UI must use the atomic draft RPC");
assert.ok(!financeManager.includes("Employee/Payroll link failed"), "Finance UI must no longer expose the known two-step orphan-draft failure mode");
assert.ok(payrollManager.includes("Pay Remaining"), "Payroll UI must offer a Pay Remaining handoff to Finance");
assert.ok(payrollManager.includes("payrollItemId"), "Pay Remaining handoff must preserve Payroll Item context");
assert.ok(payrollManager.includes("getFinancePayrollObligations"), "Payroll UI must surface the Finance obligation projection");

console.log("A6 F4 payroll/Finance hardening contract passed.");
