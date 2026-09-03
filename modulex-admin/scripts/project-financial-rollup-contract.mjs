import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `PB-2 requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

const migration = read("../modulex-store/supabase/migrations/20260903150000_project_financial_rollup.sql");
const runtimeFix = read("../modulex-store/supabase/migrations/20260903151500_project_financial_rollup_runtime_fix.sql");
const advisorHardening = read("../modulex-store/supabase/migrations/20260903153000_project_financial_rollup_advisor_hardening.sql");
const domain = read("src/lib/customers/project-financial.ts");
const summaryUi = read("src/components/customers/ProjectFinancialSummary.tsx");
const detailUi = read("src/components/customers/ProjectDetailWorkspace.tsx");
const projectFinanceUi = read("src/components/customers/project-detail/ProjectFinanceTab.tsx");

assert(migration.includes("get_customer_project_financial_summary"), "PB-2 must expose one canonical Project financial summary RPC");
assert(/security\s+definer/i.test(migration) && migration.includes("set search_path"), "PB-2 financial implementation must use a pinned privileged boundary");
assert(advisorHardening.includes("private.get_customer_project_financial_summary") && /security\s+definer/i.test(advisorHardening), "PB-2 privileged implementation must end in private schema behind SECURITY DEFINER");
assert(/create\s+or\s+replace\s+function\s+public\.get_customer_project_financial_summary[\s\S]*?language\s+sql[\s\S]*?set\s+search_path\s*=\s*pg_catalog,\s*private/i.test(advisorHardening), "PB-2 public RPC must end as a SECURITY INVOKER SQL wrapper over the private implementation");
assert(!/create\s+or\s+replace\s+function\s+public\.get_customer_project_financial_summary[\s\S]{0,300}?security\s+definer/i.test(advisorHardening), "PB-2 public RPC must not remain SECURITY DEFINER because authenticated browser EXECUTE would trigger the exposed-definer advisor");
assert(advisorHardening.includes("select private.get_customer_project_financial_summary($1)"), "PB-2 exposed wrapper must delegate only to the private guarded implementation");
assert(migration.includes("super_admin") && migration.includes("admin") && migration.includes("finance"), "Project financial RPC must restrict cost/margin data to Admin/Finance roles");
assert(migration.includes("v_order_profitability_current_cost") && migration.includes("revoke") && migration.includes("anon") && migration.includes("authenticated"), "PB-2 must remove direct anon/authenticated access to the raw profitability view");
assert(migration.includes("issued") && migration.includes("partially_paid") && migration.includes("paid") && migration.includes("overdue"), "Invoiced amount must come only from issued-or-later non-void invoice lifecycle states");
for (const category of ["Cabinet", "Countertop", "Sink", "Labor", "Material", "Other"]) assert(migration.includes(`'${category}'`), `PB-2 category mapping must include ${category}`);
assert(migration.includes("gross_margin_percent") && migration.includes("markup_percent"), "PB-2 must calculate Gross Margin and Markup as separate metrics");
assert(migration.includes("cost_complete") && migration.includes("missing_cost_lines"), "PB-2 must fail closed on incomplete cost coverage instead of presenting false profitability");
assert(migration.includes("mixed_currency") && migration.includes("currency_code"), "PB-2 must expose currency consistency instead of inventing FX conversion");
assert(migration.includes("(select s.default_currency from settings s)") && runtimeFix.includes("(select s.default_currency from settings s)"), "PB-2 currency fallback and production forward fix must bind the settings CTE alias");

assert(domain.includes('hasPermission(profile.roles, "pricing.cost.view")'), "Project financial domain must enforce pricing.cost.view in the Admin client");
assert(domain.includes('.rpc("get_customer_project_financial_summary"'), "Project financial domain must use the canonical PB-2 RPC");
assert(summaryUi.includes('title="Project Financial Summary"') && summaryUi.includes("ComponentCard") && summaryUi.includes("Alert") && summaryUi.includes("TableViewport"), "Project Financial Summary must use shared Admin card/alert/table primitives");
for (const metric of ["Total Sales", "Total Cost", "Gross Profit", "Gross Margin", "Markup", "Invoiced", "Paid", "Balance"]) assert(summaryUi.includes(metric), `Project Financial Summary must show ${metric}`);
assert(summaryUi.includes("missingCostLines") && summaryUi.includes("mixedCurrency"), "Project Financial Summary must visibly explain incomplete costs and mixed-currency blocking states");

assert(
  detailUi.includes('hasPermission(profile.roles, "pricing.cost.view")') &&
    detailUi.includes("canViewProjectFinancials") &&
    detailUi.includes("canViewCostMargin={canViewProjectFinancials}"),
  "Project Detail must compute and pass the PB-2 pricing.cost.view gate"
);
assert(
  projectFinanceUi.includes("ProjectFinancialSummary") &&
    projectFinanceUi.includes("canViewCostMargin ? (") &&
    projectFinanceUi.includes("showProfitability ? <ProjectFinancialSummary"),
  "Project Finance tab must keep PB-2 cost/margin behind pricing.cost.view even when profitability is collapsed"
);

console.log("PASS: PB-2 Project financial rollup contract");
