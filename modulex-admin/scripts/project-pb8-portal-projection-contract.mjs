import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adminRoot = process.cwd();
const repoRoot = path.resolve(adminRoot, "..");
const storeRoot = path.join(repoRoot, "modulex-store");

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolute), `PB-8 required file missing: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

const migrationPath = "modulex-store/supabase/migrations/20260908024500_customer_project_portal_projection.sql";
const migration = read(migrationPath);

for (const functionName of [
  "private.get_store_portal_projects",
  "private.get_store_portal_project",
  "public.get_store_portal_projects",
  "public.get_store_portal_project",
]) {
  assert.match(migration, new RegExp(functionName.replaceAll(".", "\\.")), `${functionName} must exist`);
}

assert.match(migration, /private\.get_store_portal_context\s*\(\s*\)/, "PB-8 must reuse the canonical portal context");
assert.match(migration, /cp\.customer_id\s*=\s*v_customer_id/, "Project reads must be customer-scoped");
assert.match(migration, /o\.project_id\s*=\s*cp\.id/, "Project Orders must derive from canonical project_id");
assert.match(migration, /s\.order_id\s*=\s*o\.id/, "Project Shipments must derive through canonical Orders");
assert.match(migration, /i\.order_id\s*=\s*o\.id/, "Project Installations must derive through canonical Orders");

for (const forbiddenKey of [
  "internal_notes",
  "cost",
  "margin",
  "commission",
  "vendor",
  "payment_detail",
  "audit",
  "sales_rep_id",
]) {
  const keyPattern = new RegExp(`['\"]${forbiddenKey}['\"]\\s*,`, "i");
  assert.doesNotMatch(migration, keyPattern, `PB-8 projection must not expose ${forbiddenKey}`);
}

assert.match(migration, /revoke execute on function public\.get_store_portal_projects\(integer, integer\) from public, anon/i);
assert.match(migration, /revoke execute on function public\.get_store_portal_project\(uuid\) from public, anon/i);
assert.match(migration, /grant execute on function public\.get_store_portal_projects\(integer, integer\) to authenticated/i);
assert.match(migration, /grant execute on function public\.get_store_portal_project\(uuid\) to authenticated/i);
assert.match(migration, /revoke execute on function private\.get_store_portal_projects\(integer, integer\) from public, anon, authenticated/i);
assert.match(migration, /revoke execute on function private\.get_store_portal_project\(uuid\) from public, anon, authenticated/i);

const projectsDomain = read("modulex-store/src/lib/portal/projects.ts");
assert.match(projectsDomain, /requireStorePortalContext\s*\(/, "Project domain must require portal context");
assert.match(projectsDomain, /get_store_portal_projects/, "Project list must use the PB-8 RPC");
assert.match(projectsDomain, /get_store_portal_project/, "Project detail must use the PB-8 RPC");

const projectList = read("modulex-store/src/components/portal/PortalProjectList.tsx");
const projectDetail = read("modulex-store/src/components/portal/PortalProjectDetail.tsx");
assert.match(projectList, /project_number/);
assert.match(projectDetail, /Orders/);
assert.match(projectDetail, /Shipments/);
assert.match(projectDetail, /Installations/);
assert.match(projectDetail, /kind\s*===\s*["']dealer["'].*Documents/s, "Documents navigation must remain dealer-only");
assert.doesNotMatch(projectDetail, /href=["']\/account\/documents["']/, "PB-8 must not invent Customer Portal document access");

for (const route of [
  "modulex-store/src/app/account/(portal)/projects/page.tsx",
  "modulex-store/src/app/account/(portal)/projects/[id]/page.tsx",
  "modulex-store/src/app/dealer/(portal)/projects/page.tsx",
  "modulex-store/src/app/dealer/(portal)/projects/[id]/page.tsx",
]) {
  read(route);
}

const navigation = read("modulex-store/src/components/portal/PortalNavigation.tsx");
assert.match(navigation, /["']Projects["']\s*,\s*["']\/account\/projects["']/);
assert.match(navigation, /["']Projects["']\s*,\s*["']\/dealer\/projects["']/);

const storeRoadmap = read("modulex-store/STORE_ROADMAP.md");
const projectPlan = read("docs/PROJECT_BASE_PLAN.md");
assert.match(storeRoadmap, /PB-8[^\n]*Portal Project Projection/i, "Store roadmap must track PB-8");
assert.match(projectPlan, /PB-8 — Portal Project Projection `\[~\]`/, "Project plan must mark PB-8 in progress before closeout");

console.log("PASS: PB-8 portal Project projection contract");
