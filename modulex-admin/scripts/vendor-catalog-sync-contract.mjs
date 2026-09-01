import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const domain = read("src/lib/vendor-catalog/domain.ts");
const adapters = read("src/lib/vendor-catalog/adapters.ts");
const sync = read("src/lib/vendor-catalog/sync.ts");
const route = read("src/app/api/vendor-catalog/sync/route.ts");
const page = read("src/app/(admin)/products/vendor-imports/page.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");
const vercel = read("vercel.json");
const sql = read("sql/vendor-catalog-sync.sql");
const migration = read("../modulex-store/supabase/migrations/20260901223000_vendor_catalog_sync.sql");
const hardening = read("sql/vendor-catalog-sync-hardening.sql");
const hardeningMigration = read("../modulex-store/supabase/migrations/20260901223500_vendor_catalog_sync_hardening.sql");
const docs = read("docs/VENDOR_CATALOG_SYNC.md");

assert.match(domain, /NEW/);
assert.match(domain, /UPDATED/);
assert.match(domain, /UNCHANGED/);
assert.match(domain, /stableProductHash/);
assert.match(domain, /modulexPrice > 0/);

assert.match(adapters, /class KarranAdapter/);
assert.match(adapters, /products\.json/);
assert.match(adapters, /class RuvatiAdapter/);
assert.match(adapters, /wp-json\/wc\/store\/v1\/products/);
assert.match(adapters, /product-sitemap\.xml/);
assert.match(adapters, /dxf/i);
assert.match(adapters, /dwg/i);
assert.match(adapters, /vendorCatalogRegistry/);

assert.match(sync, /vendor_catalog_runs/);
assert.match(sync, /vendor_catalog_items/);
assert.match(sync, /vendor_catalog_snapshots/);
assert.match(sync, /vendor_catalog_assets/);
assert.doesNotMatch(sync, /store.*publish/i);

assert.match(route, /VENDOR_CATALOG_SYNC_SECRET/);
assert.match(route, /CRON_SECRET/);
assert.match(route, /timingSafeEqual/);
assert.match(route, /authorizeAdminSession/);
assert.match(route, /supabaseAdmin\.auth\.getUser/);
assert.match(route, /super_admin/);
assert.match(route, /Object\.keys\(vendorCatalogRegistry\)/);
assert.match(route, /runVendorCatalogSync/);
assert.match(route, /autoPublished:\s*false/);

assert.match(page, /Vendor Import Review/);
assert.match(page, /vendor_catalog_items/);
assert.match(page, /Run Vendor Sync/);
assert.match(page, /Synced \/ Unchanged/);
assert.match(page, /\.in\("change_state", changeStates\)/);
assert.match(page, /\["NEW", "UPDATED"\]/);
assert.match(page, /PENDING/);
assert.match(page, /APPROVED/);
assert.match(page, /IGNORED/);
assert.match(page, /reference data only/i);

assert.match(sidebar, /Vendor Imports/);
assert.match(sidebar, /\/products\/vendor-imports/);
assert.match(sidebar, /permission:\s*"products\.manage"/);

assert.match(vercel, /\/api\/vendor-catalog\/sync/);
assert.match(vercel, /0 7 \* \* \*/);

assert.match(sql, /enable row level security/i);
assert.match(sql, /vendor_catalog_items_admin_select/i);
assert.match(sql, /vendor_catalog_items_admin_update/i);
assert.match(sql, /vendor_price_reference/);
assert.match(sql, /canonical_product_id/);
assert.match(sql, /review_status/);
assert.match(sql, /Modulex selling price greater than zero/i);
assert.match(sql, /join public\.product_prices/i);
assert.equal(migration.trim(), sql.trim(), "Deployable migration must mirror canonical vendor SQL");

assert.match(hardening, /to service_role/i);
assert.match(hardening, /pp\.is_active\s*=\s*true/i);
assert.match(hardening, /pp\.amount\s*>\s*0/i);
assert.match(hardening, /pp\.valid_from\s*<=\s*now\(\)/i);
assert.equal(
  hardeningMigration.trim(),
  hardening.trim(),
  "Deployable hardening migration must mirror canonical vendor hardening SQL"
);

assert.match(docs, /never auto-publishes/i);
assert.match(docs, /Modulex selling price/i);
assert.match(docs, /How to add a vendor/i);

console.log("vendor catalog sync contract: ok");
