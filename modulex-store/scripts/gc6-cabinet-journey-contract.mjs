import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migrationPath = "modulex-store/supabase/migrations/20260830021500_gc6_cabinet_journey.sql";
const storePagePath = "modulex-store/src/app/cabinet-process/page.tsx";
const storeQueriesPath = "modulex-store/src/lib/store/content/queries.ts";
const adminManagerPath = "modulex-admin/src/components/store/StoreCabinetContentManager.tsx";
const adminPagePath = "modulex-admin/src/app/(admin)/store/cabinet-content/page.tsx";
const adminLibPath = "modulex-admin/src/lib/store/cabinetContent.ts";
const secondaryCmsPath = "modulex-admin/src/lib/store/secondaryCms.ts";
const sidebarPath = "modulex-admin/src/layout/AppSidebar.tsx";
const sitemapPath = "modulex-store/src/app/sitemap.ts";

assert(exists(migrationPath), "GC-6 migration is missing");
assert(exists(storePagePath), "Cabinet process public page is missing");
assert(exists(adminManagerPath), "Admin Cabinet Content manager is missing");
assert(exists(adminPagePath), "Admin Cabinet Content route is missing");
assert(exists(adminLibPath), "Admin Cabinet Content data module is missing");

const migration = read(migrationPath);
assert(migration.includes("create table if not exists public.store_process_steps"), "store_process_steps table missing");
assert(migration.includes("create table if not exists public.store_faq_entries"), "store_faq_entries table missing");
assert(migration.includes("get_store_public_process_steps"), "process public RPC missing");
assert(migration.includes("get_store_public_faq_entries"), "FAQ public RPC missing");
assert(migration.includes("enable row level security"), "GC-6 RLS missing");
assert(migration.includes("revoke all on table public.store_process_steps"), "process direct grants are not revoked");
assert(migration.includes("revoke all on table public.store_faq_entries"), "FAQ direct grants are not revoked");

const queries = read(storeQueriesPath);
assert(queries.includes("getStorePublicProcessSteps"), "Store process query wrapper missing");
assert(queries.includes("getStorePublicFaqEntries"), "Store FAQ query wrapper missing");
assert(queries.includes("get_store_public_process_steps"), "Store does not use process public RPC");
assert(queries.includes("get_store_public_faq_entries"), "Store does not use FAQ public RPC");
assert(queries.includes('getStorePublicPage("cabinet-process")'), "Cabinet readiness is not CMS-backed");

const publicPage = read(storePagePath);
assert(publicPage.includes("getStoreCabinetJourneyReadiness"), "Cabinet page does not use the readiness boundary");
assert(!/granitecenterva\.com/i.test(publicPage), "Granite source URL leaked into Store runtime page");
for (const banned of ["50% off", "24 business hours", "2–4 weeks", "100% Satisfaction", "licensed, bonded", "free 3D design"]) {
  assert(!publicPage.toLowerCase().includes(banned.toLowerCase()), `Unsupported source promise leaked into Store page: ${banned}`);
}

const secondaryCms = read(secondaryCmsPath);
assert(secondaryCms.includes('"cabinet-process"'), "cabinet-process is not an Admin-managed page slug");
const sidebar = read(sidebarPath);
assert(sidebar.includes('path: "/store/cabinet-content"'), "Cabinet Content is missing from Admin Store navigation");
const sitemap = read(sitemapPath);
assert(sitemap.includes("getStoreCabinetJourneyReadiness"), "Cabinet process readiness is missing from sitemap handling");
assert(sitemap.includes("/cabinet-process"), "Cabinet process URL is missing from sitemap handling");

console.log("GC-6 cabinet journey contract passed");
