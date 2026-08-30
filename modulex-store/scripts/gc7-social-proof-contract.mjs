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

const migrationPath = "modulex-store/supabase/migrations/20260830093000_gc7_attributed_social_proof.sql";
const homePath = "modulex-store/src/app/page.tsx";
const queriesPath = "modulex-store/src/lib/store/content/queries.ts";
const adminManagerPath = "modulex-admin/src/components/store/StoreReviewsManager.tsx";
const adminPagePath = "modulex-admin/src/app/(admin)/store/reviews/page.tsx";
const adminLibPath = "modulex-admin/src/lib/store/reviews.ts";
const sidebarPath = "modulex-admin/src/layout/AppSidebar.tsx";
const permissionsPath = "modulex-admin/src/lib/auth/permissions.ts";

assert(exists(migrationPath), "GC-7 migration is missing");
assert(exists(adminManagerPath), "Admin Store Reviews manager is missing");
assert(exists(adminPagePath), "Admin Store Reviews route is missing");
assert(exists(adminLibPath), "Admin reviews data module is missing");

const migration = read(migrationPath);
assert(migration.includes("create table if not exists public.store_testimonials"), "store_testimonials table missing");
assert(migration.includes("get_store_public_testimonials"), "published-only testimonial RPC missing");
assert(migration.includes("parent_attributed"), "parent attribution classification missing");
assert(migration.includes("source_page_url"), "testimonial source URL missing");
assert(migration.includes("attribution_text"), "visible testimonial attribution missing");
assert(migration.includes("revoke all on table public.store_testimonials"), "direct testimonial grants are not revoked");

const queries = read(queriesPath);
assert(queries.includes("getStorePublicTestimonials"), "Store testimonial query wrapper missing");
assert(queries.includes("get_store_public_testimonials"), "Store testimonial RPC call missing");

const home = read(homePath);
assert(home.includes("getStorePublicTestimonials"), "Homepage does not load published testimonials");
assert(home.includes("Granite & Cabinet Center customer reviews"), "Parent-company review identity is not visible");
assert(home.includes("not Oakwell-specific reviews"), "Oakwell-vs-parent review disclaimer missing");
assert(home.includes("sourcePageUrl"), "Source link is not rendered with testimonial content");

const sidebar = read(sidebarPath);
assert(sidebar.includes('path: "/store/reviews"'), "Store Reviews missing from Admin navigation");
const permissions = read(permissionsPath);
assert(permissions.includes('path === "/store/reviews"'), "Store Reviews direct route is not protected");

console.log("GC-7 attributed social proof contract passed");
