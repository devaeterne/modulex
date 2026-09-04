import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-finance-core.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260904120000_a6_finance_core.sql";

expect(exists(adminSqlPath), "A6-F1 Admin Finance SQL must exist");
expect(exists(migrationPath), "A6-F1 shared Supabase migration mirror must exist");

const sql = read(adminSqlPath);
const migration = read(migrationPath);
expect(sql === migration, "A6-F1 Admin SQL and shared Supabase migration must stay byte-identical");

for (const table of [
  "finance_accounts",
  "finance_categories",
  "finance_fx_rates",
  "finance_transactions",
  "finance_transaction_links",
  "finance_transaction_audit",
  "finance_idempotency_requests",
]) {
  expect(new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${table}`, "i").test(sql), `A6-F1 must create ${table}`);
  expect(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql), `${table} must enable RLS`);
}

for (const accountType of ["bank", "cash", "clearing"]) {
  expect(sql.includes(`'${accountType}'`), `Finance account type ${accountType} is required`);
}
for (const status of ["draft", "posted", "voided"]) {
  expect(sql.includes(`'${status}'`), `Finance transaction status ${status} is required`);
}
for (const kind of [
  "expense",
  "customer_receipt",
  "vendor_payment",
  "employee_payment",
  "deposit",
  "withdrawal",
  "transfer",
  "refund",
  "reversal",
]) {
  expect(sql.includes(`'${kind}'`), `Finance transaction kind ${kind} is required`);
}

for (const column of [
  "source_account_id",
  "destination_account_id",
  "transaction_at",
  "currency_code",
  "base_currency_code",
  "base_amount",
  "fx_rate",
  "fx_rate_source",
  "reversal_of_transaction_id",
]) {
  expect(sql.includes(column), `Finance transaction snapshot is missing ${column}`);
}
expect(sql.includes("general_settings") && sql.includes("default_currency"), "Finance posting must derive company base currency from general_settings.default_currency");
expect(/source_account_id[\s\S]{0,1400}destination_account_id/i.test(sql), "Finance transactions must model source/destination account direction");
expect(/transfer[\s\S]{0,1200}source_account_id[\s\S]{0,1200}destination_account_id/i.test(sql), "Transfers must validate both account sides");
expect(/finance_fx_rates[\s\S]{0,2500}observed_at/i.test(sql), "Finance FX rates must be timestamped for transaction-time snapshot selection");

for (const link of ["project_id", "order_id", "customer_id", "employee_id", "vendor_code", "source_document_type", "source_document_id", "allocated_amount"]) {
  expect(sql.includes(link), `Finance optional attribution is missing ${link}`);
}
expect(/allocated_amount[\s\S]{0,2200}transaction/i.test(sql), "Finance allocations must be reconciled to transaction amount");

for (const marker of ["idempotency_key", "request_fingerprint", "pg_advisory_xact_lock"]) {
  expect(sql.includes(marker), `Finance retry-safety is missing ${marker}`);
}

for (const privateCore of [
  "create_finance_account",
  "update_finance_account",
  "create_finance_category",
  "upsert_finance_fx_rate",
  "create_finance_transaction_draft",
  "update_finance_transaction_draft",
  "set_finance_transaction_links",
  "post_finance_transaction",
  "void_finance_transaction",
  "reverse_finance_transaction",
]) {
  expect(sql.includes(`private.${privateCore}`), `Private Finance core ${privateCore} is required`);
  expect(sql.includes(`public.${privateCore}`), `Public Finance RPC wrapper ${privateCore} is required`);
}
for (const readRpc of ["get_finance_overview", "get_finance_accounts", "get_finance_categories", "get_finance_transactions_page"]) {
  expect(sql.includes(`public.${readRpc}`), `Finance read RPC ${readRpc} is required`);
}

expect(/security\s+definer/i.test(sql), "Finance private mutation cores must use SECURITY DEFINER with explicit role checks");
expect(/current_user_has_any_role[\s\S]{0,200}finance/i.test(sql), "Finance mutation cores must enforce Finance/Admin roles");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "Private Finance cores must be revoked from application roles");
expect(/revoke\s+(?:insert\s*,\s*update\s*,\s*delete\s*,\s*truncate|truncate\s*,\s*insert\s*,\s*update\s*,\s*delete)/i.test(sql), "Finance tables must revoke direct authenticated mutation/TRUNCATE privileges");
expect(/posted[\s\S]{0,1500}immutable/i.test(sql), "Posted Finance transactions must have a database immutability guard");
expect(/finance_transaction_links[\s\S]{0,2500}(?:draft|posted)/i.test(sql), "Finance links must be lifecycle-guarded");

const routes = [
  "src/app/(admin)/finance/page.tsx",
  "src/app/(admin)/finance/transactions/page.tsx",
  "src/app/(admin)/finance/accounts/page.tsx",
];
for (const route of routes) expect(exists(route), `Missing A6-F1 Finance route: ${route}`);
expect(exists("src/lib/finance/core.ts"), "A6-F1 Finance typed adapter must exist");

const sidebar = read("src/layout/AppSidebar.tsx");
for (const route of ["/finance", "/finance/transactions", "/finance/accounts"]) {
  expect(sidebar.includes(`path: "${route}"`), `Finance sidebar is missing ${route}`);
}

const permissions = read("src/lib/auth/permissions.ts");
expect(permissions.includes('"finance.view"') && permissions.includes('"finance.manage"'), "Finance view/manage permissions must remain explicit");

const uiSources = routes.map(read).join("\n");
expect(uiSources.includes("PageBreadCrumb"), "Finance pages must use the shared breadcrumb convention");

console.log("A6-F1 Finance Core + Cash/Bank contract: PASS");

// A6-F2: bridge the existing company_expenses source model into Finance Core.
// This deliberately extends the F1 workflow instead of creating a duplicate CI owner.
const expenseSqlPath = "sql/a6-finance-expenses.sql";
const expenseMigrationPath = "../modulex-store/supabase/migrations/20260905050000_a6_finance_expenses.sql";
expect(exists(expenseSqlPath), "A6-F2 Finance Expenses SQL must exist");
expect(exists(expenseMigrationPath), "A6-F2 shared Supabase migration mirror must exist");

const expenseSql = read(expenseSqlPath);
const expenseMigration = read(expenseMigrationPath);
expect(expenseSql === expenseMigration, "A6-F2 Admin SQL and shared migration must stay byte-identical");
expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(?:finance_)?expenses\b/i.test(expenseSql), "A6-F2 must not create a parallel expense source table");
expect(/alter\s+table\s+public\.company_expenses/i.test(expenseSql), "A6-F2 must extend existing company_expenses");
expect(/finance_category_id/i.test(expenseSql), "company_expenses must link the canonical Finance expense category");
expect(/status[\s\S]{0,500}'draft'[\s\S]{0,500}'posted'[\s\S]{0,500}'void'/i.test(expenseSql), "company_expenses lifecycle must support draft, posted and void");
expect(/source_document_type[\s\S]{0,300}'company_expense'|company_expense[\s\S]{0,300}source_document_type/i.test(expenseSql), "A6-F2 must link company_expenses through Finance transaction source-document links");
expect(/transaction_kind[\s\S]{0,500}'expense'|'expense'[\s\S]{0,500}transaction_kind/i.test(expenseSql), "A6-F2 posting must reuse Finance expense transactions");
expect(/revoke\s+(?:insert\s*,\s*update\s*,\s*delete\s*,\s*truncate|truncate\s*,\s*insert\s*,\s*update\s*,\s*delete)[\s\S]{0,300}company_expenses/i.test(expenseSql), "A6-F2 must close direct authenticated company_expenses mutations");

for (const rpc of [
  "get_company_expenses_page",
  "create_company_expense_draft",
  "update_company_expense_draft",
  "delete_company_expense_draft",
  "post_company_expense",
  "void_company_expense",
]) {
  expect(expenseSql.includes(`private.${rpc}`), `A6-F2 private core ${rpc} is required`);
  expect(expenseSql.includes(`public.${rpc}`), `A6-F2 public RPC ${rpc} is required`);
}
expect(/get_executive_report/i.test(expenseSql) && /get_executive_monthly_trend/i.test(expenseSql), "A6-F2 must preserve/update existing Executive expense reporting dependencies");
expect(/security\s+definer/i.test(expenseSql) && /set\s+search_path\s*=\s*''/i.test(expenseSql), "A6-F2 mutation cores must use pinned SECURITY DEFINER boundaries");
expect(/idempotency/i.test(expenseSql), "A6-F2 posting must reuse Finance idempotency semantics");

const expenseRoute = "src/app/(admin)/finance/expenses/page.tsx";
const expenseManager = "src/components/finance/FinanceExpensesManager.tsx";
const expenseAdapter = "src/lib/finance/expenses.ts";
for (const file of [expenseRoute, expenseManager, expenseAdapter]) {
  expect(exists(file), `Missing A6-F2 Expense surface: ${file}`);
}
expect(read(expenseRoute).includes("PageBreadCrumb"), "Finance Expenses route must use shared PageBreadCrumb");
const expenseUi = read(expenseManager);
for (const primitive of ["ComponentCard", "Alert", "Button", "Label", "Input", "Select", "TextArea", "TableViewport"]) {
  expect(expenseUi.includes(primitive), `Finance Expenses must reuse shared ${primitive}`);
}
expect(sidebar.includes('path: "/finance/expenses"'), "Finance sidebar must expose the Expenses route under finance.view");

console.log("A6-F2 Finance Expenses bridge contract: PASS");
