import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

const required = [
  "sql/a6-finance-reporting.sql",
  "src/lib/finance/reports.ts",
  "src/app/(admin)/finance/reports/page.tsx",
  "src/components/finance/reports/FinanceReportsWorkspace.tsx",
  "src/components/customers/project-detail/ProjectFinanceActuals.tsx",
  "docs/acceptance/a6-f6-finance-reporting.md",
];

for (const file of required) {
  expect(exists(file), `Missing A6-F6 artifact: ${file}`);
}

const sql = read("sql/a6-finance-reporting.sql");
const client = read("src/lib/finance/reports.ts");
const route = read("src/app/(admin)/finance/reports/page.tsx");
const workspace = read("src/components/finance/reports/FinanceReportsWorkspace.tsx");
const projectActuals = read("src/components/customers/project-detail/ProjectFinanceActuals.tsx");
const projectFinanceTab = read("src/components/customers/project-detail/ProjectFinanceTab.tsx");
const projectWorkspace = read("src/components/customers/ProjectDetailWorkspace.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");

for (const rpc of [
  "get_finance_reporting_summary",
  "get_finance_cash_flow_series",
  "get_finance_account_movements_page",
  "get_finance_project_actuals_page",
  "get_project_finance_actuals",
]) {
  expect(sql.includes(rpc), `F6 SQL missing RPC: ${rpc}`);
  expect(client.includes(rpc), `F6 client missing RPC: ${rpc}`);
}

expect(sql.includes("private.finance_assert_view()"), "F6 reporting must enforce Finance view authorization");
expect(/security definer/i.test(sql), "F6 reporting private/public wrappers must use reviewed SECURITY DEFINER boundaries");
expect(/set search_path\s*=\s*''/i.test(sql), "F6 SECURITY DEFINER functions must pin an empty search_path");
expect(/revoke execute on function[\s\S]*from public, anon/i.test(sql), "F6 public RPCs must revoke PUBLIC/anon execute");
expect(/grant execute on function[\s\S]*to authenticated/i.test(sql), "F6 public RPCs must explicitly grant authenticated execute");
expect(/status\s*=\s*'posted'/i.test(sql), "F6 actual reporting must be posted-only");
expect(sql.includes("base_amount"), "F6 reporting must use stored base snapshots");
expect(/allocated_amount[\s\S]*\/\s*[^\n;]*amount[\s\S]*\*\s*[^\n;]*base_amount/i.test(sql), "F6 Project allocation must convert base value proportionally from the transaction snapshot");
expect(sql.includes("source_account_id") && sql.includes("destination_account_id"), "F6 cash direction must use Finance account sides");
expect(sql.includes("reversal_of_transaction_id"), "F6 operating reporting must handle reversals explicitly");
expect(sql.includes("customer_receipt"), "F6 operating income must include canonical Customer Receipts");
for (const kind of ["expense", "vendor_payment", "employee_payment"]) {
  expect(sql.includes(kind), `F6 operating expense must include ${kind}`);
}
for (const neutralKind of ["deposit", "withdrawal", "transfer", "refund"]) {
  expect(sql.includes(neutralKind), `F6 cash reporting must preserve ${neutralKind} visibility`);
}

expect(sidebar.includes('path: "/finance/reports"') && sidebar.includes('permission: "finance.view"'), "Finance sidebar must expose /finance/reports under finance.view");
expect(route.includes("Finance Reports") && route.includes("FinanceReportsWorkspace"), "Finance Reports route must mount the F6 workspace");
expect(projectWorkspace.includes('hasPermission(profile.roles, "finance.view")'), "Project workspace must derive finance.view before exposing Finance actuals");
expect(projectWorkspace.includes("ProjectFinanceActuals") && projectWorkspace.includes("canViewFinanceReporting"), "Project Finance workspace must mount Finance actuals behind finance.view independently from Project payment permission");
expect(projectFinanceTab.includes("ProjectFinancialSummary"), "F6 must preserve the existing commercial/current-cost Project summary");
expect(projectActuals.includes("getProjectFinanceActuals"), "Project Finance actuals card must consume the canonical F6 client");
expect(workspace.includes("getArAgingSummary") && workspace.includes("getApAgingSummary"), "F6 workspace must reuse canonical AR/AP summaries");

const migrationsDir = path.join(root, "../modulex-store/supabase/migrations");
const migrationFiles = exists("../modulex-store/supabase/migrations")
  ? fs.readdirSync(migrationsDir).filter((name) => name.endsWith("_a6_finance_reporting.sql"))
  : [];
expect(migrationFiles.length === 1, `Expected exactly one A6-F6 Store migration mirror, found ${migrationFiles.length}`);
const migration = fs.readFileSync(path.join(migrationsDir, migrationFiles[0]), "utf8");
expect(sql === migration, "A6-F6 Admin SQL and Store migration mirror must be byte-identical");

console.log("A6-F6 finance reporting contract: ok");
