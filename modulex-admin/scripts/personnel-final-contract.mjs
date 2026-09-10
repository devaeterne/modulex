import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "modulex-admin");
const repoRoot = resolve(root, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    checks.push({ name, ok: false, error });
    console.error(`✗ ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("=== Modulex Personnel final-domain contract ===\n");

const productionRoutes = [
  "employees",
  "departments",
  "positions",
  "attendance",
  "leave",
  "lifecycle",
  "documents",
  "performance",
  "compliance",
  "compensation",
  "benefits",
  "payroll",
  "reports",
];

check("PER-A1 keeps every real Personnel route as a production surface", () => {
  for (const route of productionRoutes) {
    const path = resolve(root, `src/app/(admin)/personnel/${route}/page.tsx`);
    assert.equal(existsSync(path), true, `Missing production Personnel route: ${route}`);
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /coming soon|placeholder|not implemented/i, `${route} must not be a placeholder`);
  }
});

check("Personnel navigation exposes the production route set", () => {
  const sidebar = read("src/layout/AppSidebar.tsx");
  for (const route of productionRoutes) {
    assert.match(sidebar, new RegExp(`path:\\s*\"/personnel/${route}\"`), `Sidebar missing ${route}`);
  }
});

check("Finance payroll is a settlement/read surface, not an HR calculation editor", () => {
  const page = read("src/app/(admin)/finance/payroll/page.tsx");
  const manager = read("src/components/hr/PayrollManager.tsx");
  assert.match(page, /<PayrollManager\s+mode="finance"\s*\/>/);
  assert.doesNotMatch(page, /Finance payroll processing/i);
  assert.match(manager, /mode\??:\s*"hr"\s*\|\s*"finance"/);
  assert.match(manager, /const canManagePayroll\s*=\s*mode\s*===\s*"hr"/);
  assert.match(manager, /canManagePayroll/);
  assert.match(manager, /Payment source of truth/);
  assert.match(manager, /\/finance\/transactions\?/);
  assert.doesNotMatch(manager, /update\(\{\s*status:\s*["']paid["']/);
});

check("Finance role copy describes settlement rather than payroll processing", () => {
  const permissions = read("src/lib/auth/permissions.ts");
  const financeDescription = permissions.match(/finance:\s*"([^"]+)"/)?.[1] ?? "";
  assert.ok(financeDescription, "Finance role description not found");
  assert.doesNotMatch(financeDescription, /payroll processing/i);
  assert.match(financeDescription, /payroll/i);
  assert.match(financeDescription, /settlement|payment/i);
});

check("Canonical migration hardens HR-owned payroll writes and HR audit FKs", () => {
  const migrationDir = resolve(repoRoot, "modulex-store/supabase/migrations");
  const migration = readdirSync(migrationDir).find((name) => name.endsWith("_personnel_final_domain_closeout.sql"));
  assert.ok(migration, "Personnel final-domain migration is missing from canonical Store migration mirror");
  const sql = readFileSync(resolve(migrationDir, migration), "utf8");
  for (const table of ["hr_payroll_periods", "hr_payroll_runs", "hr_payroll_items"]) {
    assert.match(sql, new RegExp(table));
  }
  assert.match(sql, /array\['super_admin','admin','hr'\]/);
  assert.match(sql, /prepare_hr_payroll_run/);
  assert.match(sql, /set_hr_payroll_run_status/);
  assert.match(sql, /revoke all on table public\.hr_payroll_finance_settlement_state/i);
  assert.match(sql, /revoke all on table public\.hr_payroll_finance_settlement_effects/i);
  assert.match(sql, /create index if not exists hr_payroll_runs_created_by_idx/i);
  assert.match(sql, /create index if not exists hr_leave_requests_approved_by_idx/i);
});

check("PER-A2 contract documents ownership, lifecycle, audit and performance guarantees", () => {
  const path = resolve(root, "docs/PERSONNEL_DOMAIN_CONTRACT.md");
  assert.equal(existsSync(path), true, "Personnel domain contract is missing");
  const contract = readFileSync(path, "utf8");
  for (const route of productionRoutes) assert.match(contract, new RegExp(`\\| ${route} \\| production \\|`, "i"));
  for (const term of ["RBAC", "validation", "lifecycle", "audit", "pagination", "HR-owned", "Finance-owned"]) {
    assert.match(contract, new RegExp(term, "i"), `Contract should cover ${term}`);
  }
});

check("Leave regression stays behind canonical workflow RPCs", () => {
  const leave = read("src/components/hr/LeaveManager.tsx");
  assert.match(leave, /set_hr_leave_request_status/);
  assert.match(leave, /initialize_hr_leave_balances/);
  assert.doesNotMatch(leave, /from\("hr_leave_balances"\)\.update/);
});

check("Personnel payroll mutation paths stay in HR while cash settlement stays in Finance", () => {
  const compensation = read("src/components/hr/CompensationManager.tsx");
  const payroll = read("src/components/hr/PayrollManager.tsx");
  assert.match(compensation, /profile\?\.role === "hr"/);
  assert.match(payroll, /prepare_hr_payroll_run/);
  assert.match(payroll, /set_hr_payroll_run_status/);
  assert.match(payroll, /get_hr_payroll_finance_settlement/);
  assert.match(payroll, /getFinancePayrollObligations/);
});

const failed = checks.filter((item) => !item.ok);
console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
console.log("=== PERSONNEL FINAL DOMAIN CONTRACT PASS ===");
