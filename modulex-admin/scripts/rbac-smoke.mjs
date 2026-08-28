import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadModule(filePath) {
  const source = readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;

  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
      throw new Error(`Unexpected runtime import in RBAC smoke: ${specifier}`);
    },
  });
  vm.runInContext(compiled, context, { filename: filePath });
  return module.exports;
}

const permissions = loadModule(resolve(process.cwd(), "src/lib/auth/permissions.ts"));
const { hasPermission, requiredPermissionForPath, canAccessPath } = permissions;

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

console.log("=== Modulex RBAC deterministic smoke ===\n");

check("Sales can manage Store leads but not Store CMS", () => {
  assert.equal(hasPermission("sales", "leads.manage"), true);
  assert.equal(hasPermission("sales", "store.manage"), false);
});

check("Finance sees cost/margin and finance operations but not personnel", () => {
  assert.equal(hasPermission("finance", "pricing.cost.view"), true);
  assert.equal(hasPermission("finance", "finance.manage"), true);
  assert.equal(hasPermission("finance", "personnel.view"), false);
});

check("HR manages personnel without general dashboard access", () => {
  assert.equal(hasPermission("hr", "personnel.manage"), true);
  assert.equal(hasPermission("hr", "dashboard.view"), false);
});

check("Warehouse manages stock while Shipping cannot run general stock operations", () => {
  assert.equal(hasPermission("warehouse", "inventory.manage"), true);
  assert.equal(hasPermission("shipping", "inventory.manage"), false);
  assert.equal(hasPermission("shipping", "shipments.manage"), true);
});

check("Store lead list/detail route permissions are distinct", () => {
  assert.equal(requiredPermissionForPath("/store/leads"), "leads.view");
  assert.equal(requiredPermissionForPath("/store/leads/abc"), "leads.manage");
});

check("Finance-sensitive route rules remain protected", () => {
  assert.equal(requiredPermissionForPath("/pricing/cost-margin"), "pricing.cost.view");
  assert.equal(requiredPermissionForPath("/settings/general/tax-rules"), "finance.manage");
});

check("Personnel and low-stock routes map to their dedicated permissions", () => {
  assert.equal(requiredPermissionForPath("/personnel/employees"), "personnel.view");
  assert.equal(requiredPermissionForPath("/low-stock"), "inventory.view");
});

check("Role/path access follows the permission matrix", () => {
  assert.equal(canAccessPath("sales", "/store/leads/abc"), true);
  assert.equal(canAccessPath("finance", "/pricing/cost-margin"), true);
  assert.equal(canAccessPath("shipping", "/stock-operations"), false);
  assert.equal(canAccessPath("hr", "/personnel/employees"), true);
});

const failed = checks.filter((item) => !item.ok);
console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
console.log("=== RBAC SMOKE PASS ===");
