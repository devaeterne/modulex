import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-payroll-finance-reconciliation.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260904153000_a6_payroll_finance_reconciliation.sql";

expect(exists(adminSqlPath), "Payroll Finance reconciliation Admin SQL must exist");
expect(exists(migrationPath), "Payroll Finance reconciliation migration mirror must exist");

const sql = read(adminSqlPath);
const migration = read(migrationPath);
expect(sql === migration, "Payroll Finance reconciliation Admin SQL and migration must stay byte-identical");

for (const table of [
  "hr_payroll_finance_settlement_state",
  "hr_payroll_finance_settlement_effects",
]) {
  expect(sql.includes(`table if not exists public.${table}`), `Reconciliation must define ${table}`);
  expect(sql.includes(`enable row level security`), "Reconciliation tables must enable RLS");
}

for (const fn of [
  "private.get_hr_payroll_finance_paid_amount",
  "private.reconcile_hr_payroll_finance_item",
  "private.reconcile_hr_payroll_finance_after_post",
]) {
  expect(sql.includes(`function ${fn}`), `Reconciliation must define ${fn}`);
}

expect(sql.includes("t.status = 'posted'"), "Settlement must derive from posted Finance history only");
expect(sql.includes("t.transaction_kind in ('employee_payment','reversal')"), "Settlement must be reversal-aware");
expect(sql.includes("v_is_fully_settled := v_paid_amount >= v_item.net_pay"), "HR effects must wait for full payroll settlement");
expect(sql.includes("if not v_was_fully_settled and v_is_fully_settled then"), "Reconciliation must apply effects only on transition to fully settled");
expect(sql.includes("elsif v_was_fully_settled and not v_is_fully_settled then"), "Reconciliation must revert effects if Finance reversals reopen payroll");
expect(sql.includes("v_variable_bonus is distinct from v_item.bonus_pay"), "Bonus source totals must reconcile to the payroll snapshot");
expect(sql.includes("v_variable_commission is distinct from v_item.commission_pay"), "Commission source totals must reconcile to the payroll snapshot");
expect(sql.includes("v_variable_other is distinct from v_item.other_earnings"), "Other earning source totals must reconcile to the payroll snapshot");
expect(sql.includes("v_variable_reimbursements is distinct from v_item.reimbursements"), "Reimbursement source totals must reconcile to the payroll snapshot");
expect(sql.includes("v_advance_total is distinct from v_item.advance_repayment"), "Advance source totals must reconcile to the payroll snapshot");
expect(sql.includes("effect_type = 'variable_pay'"), "Variable-pay lifecycle changes must be ledgered");
expect(sql.includes("effect_type = 'advance_repayment'"), "Advance repayment changes must be ledgered");
expect(sql.includes("effect_status = 'reverted'"), "Reversal must preserve an explicit reverted effect state");
expect(sql.includes("trg_reconcile_hr_payroll_finance_after_post"), "Finance posting must invoke payroll reconciliation through a DB trigger");

for (const signature of [
  "private.get_hr_payroll_finance_paid_amount(uuid)",
  "private.reconcile_hr_payroll_finance_item(uuid)",
  "private.reconcile_hr_payroll_finance_after_post()",
]) {
  expect(sql.includes(`revoke all on function ${signature} from public,anon,authenticated`), `${signature} must stay private to the DB boundary`);
}

console.log("A6 Payroll Finance reconciliation contract passed.");
