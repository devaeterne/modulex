import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-finance-employee-payments.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260904150000_a6_finance_employee_payments.sql";
const corePath = "src/lib/finance/core.ts";
const financeManagerPath = "src/components/finance/FinanceTransactionsManager.tsx";
const payrollPath = "src/components/hr/PayrollManager.tsx";
const employeesPath = "src/components/hr/EmployeeDirectory.tsx";

expect(exists(adminSqlPath), "A6 Finance Employee Payments Admin SQL must exist");
expect(exists(migrationPath), "A6 Finance Employee Payments migration mirror must exist");

const sql = read(adminSqlPath);
const migration = read(migrationPath);
const core = read(corePath);
const financeManager = read(financeManagerPath);
const payroll = read(payrollPath);
const employees = read(employeesPath);

expect(sql === migration, "Finance Employee Payments Admin SQL and Supabase migration must stay byte-identical");

for (const fn of [
  "private.validate_finance_employee_payment_link",
  "private.validate_finance_employee_payment_posting",
  "public.get_finance_employee_directory",
  "public.get_finance_employee_payroll_items",
  "public.get_hr_payroll_finance_settlement",
  "public.get_hr_employee_finance_payments",
]) {
  expect(sql.includes(`function ${fn}`), `Finance Employee Payments must define ${fn}`);
}

expect(sql.includes("new.source_document_type = 'hr_payroll_item'"), "Payroll Item attribution must use the canonical source-document type");
expect(sql.includes("public.hr_payroll_items"), "Payroll Item links must validate against canonical HR payroll items");
expect(sql.includes("new.employee_id is distinct from v_payroll_employee"), "Payroll Item attribution must match the linked Employee");
expect(sql.includes("transaction_kind = 'employee_payment'"), "Employee payment posting must have a dedicated invariant");
expect(sql.includes("old.status is distinct from 'draft'"), "Employee payment posting validator must execute on draft-to-posted transition rather than skip it");
expect(sql.includes("new.status is distinct from 'posted'"), "Employee payment posting validator must execute when the new status becomes posted");
expect(!sql.includes("old.status is not distinct from 'draft'"), "Employee payment posting validator must not invert the draft transition guard");
expect(!sql.includes("new.status is not distinct from 'posted'"), "Employee payment posting validator must not invert the posted transition guard");
expect(sql.includes("count(distinct l.employee_id)"), "Posted employee payments must resolve exactly one Employee");
expect(sql.includes("coalesce(sum(l.allocated_amount),0)"), "Employee payment posting must reconcile allocated amount");
expect(sql.includes("v_allocated_total is distinct from v_transaction.amount"), "Employee payment allocation must equal the Finance amount");
expect(sql.includes("trg_validate_finance_employee_payment_posting"), "Employee payment posting invariant must be protected by a DB trigger");

expect(sql.includes("source_document_type = 'hr_payroll_item'"), "Payroll settlement must select canonical Payroll Item Finance links");
expect(sql.includes("t.status = 'posted'"), "Payroll settlement must count posted Finance history only");
expect(sql.includes("t.transaction_kind in ('employee_payment','reversal')"), "Payroll settlement must account for compensating Finance reversals");
expect(sql.includes("greatest(i.net_pay"), "Payroll settlement must derive remaining pay from HR net pay and Finance paid amount");

for (const fn of [
  "get_finance_employee_directory()",
  "get_finance_employee_payroll_items(uuid)",
  "get_hr_payroll_finance_settlement(uuid)",
  "get_hr_employee_finance_payments(uuid)",
]) {
  expect(sql.includes(`grant execute on function public.${fn} to authenticated`), `${fn} must be authenticated-only`);
  expect(sql.includes(`revoke all on function public.${fn} from public,anon`), `${fn} must not be public/anon executable`);
}

expect(core.includes("export type FinanceEmployeeOption"), "Finance adapter must type Employee selector options");
expect(core.includes("export type FinancePayrollItemOption"), "Finance adapter must type Payroll Item selector options");
expect(core.includes("export async function getFinanceEmployeeDirectory"), "Finance adapter must expose Employee choices");
expect(core.includes("get_finance_employee_directory"), "Finance adapter must call Employee directory RPC");
expect(core.includes("export async function getFinanceEmployeePayrollItems"), "Finance adapter must expose Payroll Item choices");
expect(core.includes("get_finance_employee_payroll_items"), "Finance adapter must call Payroll Item RPC");

expect(financeManager.includes('id="finance-employee"'), "Employee payment UI must expose Employee selection");
expect(financeManager.includes('id="finance-payroll-item"'), "Employee payment UI must expose optional Payroll Item selection");
expect(financeManager.includes("setFinanceTransactionLinks"), "Employee payment draft save must persist canonical Finance links");
expect(financeManager.includes('source_document_type: payrollItemId ? "hr_payroll_item" : null'), "Salary payment must identify Payroll Item source type");
expect(financeManager.includes("allocated_amount: numericAmount"), "Employee payment link must allocate the Finance amount");

expect(payroll.includes("get_hr_payroll_finance_settlement"), "Payroll UI must load Finance settlement projection");
expect(payroll.includes("Finance Paid"), "Payroll UI must show Finance paid amount");
expect(payroll.includes("Remaining"), "Payroll UI must show remaining pay");
expect(payroll.includes("payment_status"), "Payroll UI must show derived payment status");
expect(!payroll.includes('setRunStatus("paid")'), "Payroll UI must not manually mark money as paid");
expect(!payroll.includes('Mark Paid'), "Payroll UI must not expose a manual Mark Paid action");

expect(employees.includes("get_hr_employee_finance_payments"), "Employee Directory must load Finance payment history projection");
expect(employees.includes("Payments"), "Employee Directory must expose Payments action/history");
expect(employees.includes("Finance payment history"), "Employee payment history must be identified as a Finance projection");

console.log("A6 Finance Employee Payments contract passed.");
