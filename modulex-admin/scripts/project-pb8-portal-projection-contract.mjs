import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adminRoot = process.cwd();
const repoRoot = path.resolve(adminRoot, "..");

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolute), `PB-8 required file missing: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

const migrationPath = "modulex-store/supabase/migrations/20260908024500_customer_project_portal_projection.sql";
const migration = read(migrationPath);
const paginationMigrationPath = "modulex-store/supabase/migrations/20260908032000_customer_project_portal_pagination.sql";
const paginationMigration = read(paginationMigrationPath);

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
  assert.doesNotMatch(paginationMigration, keyPattern, `PB-8 pagination projection must not expose ${forbiddenKey}`);
}

assert.match(migration, /revoke execute on function public\.get_store_portal_projects\(integer, integer\) from public, anon/i);
assert.match(migration, /revoke execute on function public\.get_store_portal_project\(uuid\) from public, anon/i);
assert.match(migration, /grant execute on function public\.get_store_portal_projects\(integer, integer\) to authenticated/i);
assert.match(migration, /grant execute on function public\.get_store_portal_project\(uuid\) to authenticated/i);
assert.match(migration, /revoke execute on function private\.get_store_portal_projects\(integer, integer\) from public, anon, authenticated, service_role/i);
assert.match(migration, /revoke execute on function private\.get_store_portal_project\(uuid\) from public, anon, authenticated, service_role/i);
assert.match(migration, /grant execute on function private\.get_store_portal_projects\(integer, integer\) to authenticated/i);
assert.match(migration, /grant execute on function private\.get_store_portal_project\(uuid\) to authenticated/i);

assert.match(paginationMigration, /create or replace function private\.get_store_portal_projects/i, "pagination must harden the existing scoped list RPC");
assert.match(paginationMigration, /count\(\*\)[\s\S]*from\s+public\.customer_projects\s+cp[\s\S]*cp\.customer_id\s*=\s*v_customer_id/i, "total count must remain customer-scoped");
assert.match(paginationMigration, /'total_count'\s*,\s*v_total_count/i, "pagination RPC must return total_count");
assert.match(paginationMigration, /limit v_limit offset v_offset/i, "pagination RPC must keep bounded limit/offset semantics");
assert.match(paginationMigration, /order by\s+cp\.created_at\s+desc\s*,\s*cp\.id\s+desc/i, "page slices must use a unique deterministic tie-breaker");
assert.match(paginationMigration, /jsonb_agg\s*\(\s*row_data\s+order by\s+created_at\s+desc\s*,\s*project_id\s+desc\s*\)/i, "aggregate order must preserve the deterministic page slice");

const projectsDomain = read("modulex-store/src/lib/portal/projects.ts");
assert.match(projectsDomain, /requireStorePortalContext\s*\(/, "Project domain must require portal context");
assert.match(projectsDomain, /get_store_portal_projects/, "Project list must use the PB-8 RPC");
assert.match(projectsDomain, /get_store_portal_project/, "Project detail must use the PB-8 RPC");
assert.match(projectsDomain, /PortalProjectPage/, "Project list domain must preserve paging metadata");
assert.match(projectsDomain, /total_count/, "Project list domain must consume server total_count");
assert.match(projectsDomain, /totalCount/, "Project list domain must expose totalCount to the route");
assert.match(projectsDomain, /2_147_483_647/, "Project list domain must cap offsets to PostgreSQL integer range before RPC invocation");

const projectList = read("modulex-store/src/components/portal/PortalProjectList.tsx");
const projectDetail = read("modulex-store/src/components/portal/PortalProjectDetail.tsx");
assert.match(projectList, /project_number/);
assert.match(projectList, /Previous/, "Project list must render previous-page navigation");
assert.match(projectList, /Next/, "Project list must render next-page navigation");
assert.match(projectList, /totalCount/, "Project list must use total count to determine navigation bounds");
assert.match(projectDetail, /Orders/);
assert.match(projectDetail, /Shipments/);
assert.match(projectDetail, /Installations/);
assert.match(projectDetail, /kind\s*===\s*["']dealer["'].*Documents/s, "Documents navigation must remain dealer-only");
assert.doesNotMatch(projectDetail, /href=["']\/account\/documents["']/, "PB-8 must not invent Customer Portal document access");

const accountProjectsRoute = read("modulex-store/src/app/account/(portal)/projects/page.tsx");
const dealerProjectsRoute = read("modulex-store/src/app/dealer/(portal)/projects/page.tsx");
for (const route of [accountProjectsRoute, dealerProjectsRoute]) {
  assert.match(route, /searchParams/, "Portal Project list routes must consume ?page=");
  assert.match(route, /getPortalProjects\s*\(\s*PAGE_SIZE\s*,\s*offset\s*\)/, "Portal Project routes must pass paging offset to the RPC domain");
  assert.match(route, /page={page}/, "Portal Project routes must pass current page to the list UI");
  assert.match(route, /totalCount={pageData\.totalCount}/, "Portal Project routes must pass server total count to the list UI");
}

for (const route of [
  "modulex-store/src/app/account/(portal)/projects/[id]/page.tsx",
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
