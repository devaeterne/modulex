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
const sidebarSource = readFileSync(resolve(process.cwd(), "src/layout/AppSidebar.tsx"), "utf8");
const warehouseTableSource = readFileSync(
  resolve(process.cwd(), "src/components/warehouses/WarehousesTable.tsx"),
  "utf8"
);
const zonesTableSource = readFileSync(
  resolve(process.cwd(), "src/components/zones/ZonesTable.tsx"),
  "utf8"
);
const locationsTableSource = readFileSync(
  resolve(process.cwd(), "src/components/locations/LocationsTable.tsx"),
  "utf8"
);

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

check("Multiple roles union their permissions and route access", () => {
  const roles = ["finance", "hr"];
  assert.equal(hasPermission(roles, "finance.manage"), true);
  assert.equal(hasPermission(roles, "personnel.manage"), true);
  assert.equal(hasPermission(roles, "store.manage"), false);
  assert.equal(canAccessPath(roles, "/finance"), true);
  assert.equal(canAccessPath(roles, "/personnel/employees"), true);
});

check("Warehouse manages stock while Shipping cannot run general stock operations", () => {
  assert.equal(hasPermission("warehouse", "inventory.manage"), true);
  assert.equal(hasPermission("shipping", "inventory.manage"), false);
  assert.equal(hasPermission("shipping", "shipments.manage"), true);
});

check("Sidebar navigation permissions match direct-route permissions", () => {
  const navEntries = [...sidebarSource.matchAll(/path:\s*"([^"]+)"\s*,\s*permission:\s*"([^"]+)"/g)].map((match) => ({
    path: match[1],
    permission: match[2],
  }));

  assert.ok(navEntries.length > 0, "Expected to discover sidebar navigation entries");

  const mismatches = navEntries
    .map(({ path, permission }) => ({
      path,
      sidebarPermission: permission,
      routePermission: requiredPermissionForPath(path),
    }))
    .filter((entry) => entry.sidebarPermission !== entry.routePermission);

  assert.deepEqual(mismatches, []);
});

check("Profile is available to every active Admin role", () => {
  assert.equal(requiredPermissionForPath("/profile"), "profile.view");
  for (const role of ["super_admin", "admin", "sales", "finance", "hr", "warehouse", "shipping"]) {
    assert.equal(hasPermission(role, "profile.view"), true, `${role} should have profile.view`);
    assert.equal(canAccessPath(role, "/profile"), true, `${role} should access /profile`);
  }
});

check("Store lead list/detail route permissions are distinct", () => {
  assert.equal(requiredPermissionForPath("/store/leads"), "leads.view");
  assert.equal(requiredPermissionForPath("/store/leads/abc"), "leads.manage");
});

check("Store CMS manage-only navigation stays manage-only on direct URLs", () => {
  assert.equal(requiredPermissionForPath("/store/content"), "store.manage");
  assert.equal(requiredPermissionForPath("/store/colors"), "store.manage");
  assert.equal(requiredPermissionForPath("/store/marketing"), "store.manage");
});

check("Finance-sensitive route rules remain protected", () => {
  assert.equal(requiredPermissionForPath("/pricing/cost-margin"), "pricing.cost.view");
  assert.equal(requiredPermissionForPath("/settings/general/tax-rules"), "finance.manage");
  assert.equal(requiredPermissionForPath("/customers/payment-methods"), "finance.manage");
});

check("Personnel and low-stock routes map to their dedicated permissions", () => {
  assert.equal(requiredPermissionForPath("/personnel/employees"), "personnel.view");
  assert.equal(requiredPermissionForPath("/personnel/departments"), "personnel.manage");
  assert.equal(requiredPermissionForPath("/personnel/positions"), "personnel.manage");
  assert.equal(requiredPermissionForPath("/low-stock"), "inventory.view");
});

check("Warehouse structure mutation routes require warehouse.manage", () => {
  for (const path of [
    "/warehouses/new",
    "/warehouses/warehouse-1/edit",
    "/zones/new",
    "/zones/zone-1/edit",
    "/locations/new",
    "/locations/location-1/edit",
  ]) {
    assert.equal(requiredPermissionForPath(path), "warehouse.manage", `${path} should require warehouse.manage`);
    assert.equal(canAccessPath("warehouse", path), false, `warehouse role should not mutate ${path}`);
    assert.equal(canAccessPath("shipping", path), false, `shipping role should not mutate ${path}`);
    assert.equal(canAccessPath("admin", path), true, `admin should mutate ${path}`);
  }
});

check("Warehouse structure list mutations require warehouse.manage in the UI", () => {
  const tables = [
    ["WarehousesTable", warehouseTableSource, 2],
    ["ZonesTable", zonesTableSource, 3],
    ["LocationsTable", locationsTableSource, 3],
  ];

  for (const [name, source, expectedHandlerGuards] of tables) {
    assert.match(source, /getCurrentProfile/, `${name} should resolve the active profile`);
    assert.match(
      source,
      /hasPermission\(profile\.role,\s*"warehouse\.manage"\)/,
      `${name} should derive warehouse.manage from the active role`
    );
    assert.match(
      source,
      /onDoubleClick=\{canManage\s*\?/,
      `${name} should disable double-click editing for read-only roles`
    );

    const handlerGuards = source.match(/if \(!canManage\) return;/g) ?? [];
    assert.ok(
      handlerGuards.length >= expectedHandlerGuards,
      `${name} should guard every mutation handler with warehouse.manage`
    );

    const conditionalMutationGroups = source.match(/\{canManage\s*(?:&&|\?)\s*\(/g) ?? [];
    assert.ok(
      conditionalMutationGroups.length >= 2,
      `${name} should hide add/edit/status/delete mutation controls for read-only roles`
    );
  }
});

check("Role/path access follows the permission matrix", () => {
  assert.equal(canAccessPath("sales", "/store/leads/abc"), true);
  assert.equal(canAccessPath("finance", "/pricing/cost-margin"), true);
  assert.equal(canAccessPath("finance", "/customers/payment-methods"), true);
  assert.equal(canAccessPath("shipping", "/stock-operations"), false);
  assert.equal(canAccessPath("hr", "/personnel/employees"), true);
});

const failed = checks.filter((item) => !item.ok);
console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
console.log("=== RBAC SMOKE PASS ===");
