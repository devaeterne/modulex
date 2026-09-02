import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const domain = read("src/lib/vendor-catalog/domain.ts");
const adapters = read("src/lib/vendor-catalog/adapters.ts");
const sync = read("src/lib/vendor-catalog/sync.ts");
const check = read("src/lib/vendor-catalog/check.ts");
const mappings = read("src/lib/vendor-catalog/mappings.ts");
const auth = read("src/lib/vendor-catalog/auth.ts");
const approve = read("src/lib/vendor-catalog/approve.ts");
const approval = read("src/lib/vendor-catalog/approval.ts");
const route = read("src/app/api/vendor-catalog/sync/route.ts");
const checkRoute = read("src/app/api/vendor-catalog/check/route.ts");
const vendorsRoute = read("src/app/api/vendor-catalog/vendors/route.ts");
const mappingsRoute = read("src/app/api/vendor-catalog/category-mappings/route.ts");
const approveRoute = read("src/app/api/vendor-catalog/items/[itemId]/approve/route.ts");
const page = read("src/app/(admin)/products/vendor-imports/page.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");
const vercel = read("vercel.json");
const sql = read("sql/vendor-catalog-sync.sql");
const migration = read("../modulex-store/supabase/migrations/20260901223000_vendor_catalog_sync.sql");
const hardening = read("sql/vendor-catalog-sync-hardening.sql");
const hardeningMigration = read("../modulex-store/supabase/migrations/20260901223500_vendor_catalog_sync_hardening.sql");
const reviewV2 = read("sql/vendor-catalog-sync-review-v2.sql");
const reviewV2Migration = read("../modulex-store/supabase/migrations/20260902001500_vendor_catalog_sync_review_v2.sql");
const reviewV3 = read("sql/vendor-catalog-sync-family-v3.sql");
const reviewV3Migration = read("../modulex-store/supabase/migrations/20260902093000_vendor_catalog_sync_family_v3.sql");
const docs = read("docs/VENDOR_CATALOG_SYNC.md");

assert.match(domain, /NEW/);
assert.match(domain, /UPDATED/);
assert.match(domain, /UNCHANGED/);
assert.match(domain, /stableProductHash/);
assert.match(domain, /stableDiscoveryHash/);
assert.match(domain, /enrich\?/);
assert.match(domain, /modulexPrice > 0/);
assert.match(domain, /VendorCatalogCategory/);
assert.match(domain, /VendorCatalogDiscoveryScope/);
assert.match(domain, /familyKey/);
assert.match(domain, /variantCode/);
assert.match(domain, /variantLabel/);
assert.match(domain, /listCategories\?/);

assert.match(adapters, /class KarranAdapter/);
assert.match(adapters, /products\.json/);
assert.match(adapters, /class RuvatiAdapter/);
assert.match(adapters, /wp-json\/wc\/store\/v1\/products/);
assert.match(adapters, /product-sitemap\.xml/);
assert.match(adapters, /async enrich/);
assert.match(adapters, /fetchDetailAssets/);
assert.match(adapters, /dxf/i);
assert.match(adapters, /dwg/i);
assert.match(adapters, /vendorCatalogRegistry/);
assert.match(adapters, /listCategories/);
assert.match(adapters, /collections\.json/);
assert.match(adapters, /collections\/.*products\.json/);
assert.match(adapters, /params\.set\("category"/);
assert.match(adapters, /KARRAN_COLOR_SUFFIXES/);
assert.match(adapters, /titleLower\.includes/);

assert.match(sync, /vendor_catalog_runs/);
assert.match(sync, /vendor_catalog_items/);
assert.match(sync, /vendor_catalog_snapshots/);
assert.match(sync, /vendor_catalog_assets/);
assert.match(sync, /discovery_hash/);
assert.match(sync, /chunk/);
assert.match(sync, /VendorCatalogDiscoveryScope/);
assert.match(sync, /vendor_category_key/);
assert.match(sync, /family_key/);
assert.match(sync, /variant_code/);
assert.match(sync, /sync_mode/);
assert.match(sync, /loadVendorCatalogCheck/);
assert.match(sync, /changedOnly/);
assert.match(sync, /classificationBackfillNeeded/);
assert.match(sync, /entry\.changeState !== "UNCHANGED"/);
assert.match(sync, /entry\.classificationBackfillNeeded/);
assert.match(sync, /entry\.availabilityChanged/);
assert.doesNotMatch(sync, /\.enrich\(/);
assert.doesNotMatch(sync, /store.*publish/i);

assert.match(check, /vendor_catalog_checks/);
assert.match(check, /vendor_catalog_check_items/);
assert.match(check, /stableDiscoveryHash/);
assert.match(check, /willSync/);
assert.match(check, /expires_at/);
assert.match(checkRoute, /runVendorCatalogCheck/);
assert.match(checkRoute, /authorizeVendorCatalogAdmin/);

assert.match(auth, /timingSafeEqual/);
assert.match(auth, /VENDOR_CATALOG_SYNC_SECRET/);
assert.match(auth, /CRON_SECRET/);
assert.match(auth, /supabaseAdmin\.auth\.getUser/);
assert.match(auth, /super_admin/);

assert.match(route, /requestedVendors/);
assert.match(route, /request\.json/);
assert.match(route, /Object\.keys\(vendorCatalogRegistry\)/);
assert.match(route, /runVendorCatalogSync/);
assert.match(route, /checkId/);
assert.match(route, /changedOnly/);
assert.match(route, /categoryKey/);
assert.match(route, /autoPublished:\s*false/);
assert.match(vendorsRoute, /Object\.keys\(vendorCatalogRegistry\)/);
assert.match(vendorsRoute, /listCategories/);

assert.match(mappings, /CategoryMappingRequiredError/);
assert.match(mappings, /vendor_catalog_category_mappings/);
assert.match(mappings, /product_type_allowed_uoms/);
assert.match(mappings, /createCategoryName/);
assert.match(mappings, /product_categories/);
assert.match(mappingsRoute, /saveVendorCategoryMapping/);
assert.match(mappingsRoute, /getVendorCategoryMappingOptions/);
assert.match(mappingsRoute, /authorizeVendorCatalogAdmin/);

assert.match(approve, /sharp/);
assert.match(approve, /store-media/);
assert.match(approve, /webp/i);
assert.match(approve, /1400/);
assert.match(approve, /save_product_master_v2/);
assert.match(approve, /store_product_content/);
assert.match(approve, /store_product_media/);
assert.match(approve, /storage_bucket/);
assert.match(approve, /storage_path/);
assert.match(approve, /review_status:\s*"APPROVED"/);
assert.doesNotMatch(approve, /resolveSinkMasters/);
assert.match(approve, /loadVendorCategoryMapping/);
assert.match(approve, /family_key/);
assert.match(approve, /variant_code/);
assert.match(approve, /base_product_code:\s*familyKey/);
assert.match(approve, /color_code:\s*variantCode/);
assert.match(approve, /assertSafeCanonicalReuse/);
assert.match(approval, /approveVendorCatalogItem/);
assert.match(approval, /VendorUnavailableError/);
assert.match(approveRoute, /approveAvailableVendorCatalogItem/);
assert.match(approveRoute, /authorizeVendorCatalogAdmin/);
assert.match(approveRoute, /CATEGORY_MAPPING_REQUIRED/);
assert.match(approveRoute, /VendorUnavailableError/);
assert.match(approveRoute, /status:\s*409/);

assert.match(page, /Vendor Import Review/);
assert.match(page, /vendor_catalog_items/);
assert.match(page, /VENDOR_CATALOG_SELECT/);
assert.doesNotMatch(page, /\.join\(","\)/);
assert.match(page, /PAGE_SIZE_OPTIONS/);
assert.match(page, /count:\s*"exact"/);
assert.match(page, /\.range\(/);
assert.match(page, /requestIdRef/);
assert.match(page, /Check Updates/);
assert.match(page, /Sync Changes/);
assert.match(page, /Full Rescan/);
assert.match(page, /Synced \/ Unchanged/);
assert.match(page, /\.in\("change_state", changeStates\)/);
assert.match(page, /DEFAULT_CHANGE_STATES/);
assert.match(page, /tableVendor/);
assert.match(page, /syncVendor/);
assert.match(page, /tableCategory/);
assert.match(page, /linkedFilter/);
assert.match(page, /@\/components\/form\/Select/);
assert.match(page, /@\/components\/form\/input\/InputField/);
assert.match(page, /@\/components\/ui\/alert\/Alert/);
assert.match(page, /image_url/);
assert.match(page, /Approve Available Family/);
assert.match(page, /Complete Import/);
assert.match(page, /Edit Product/);
assert.match(page, /Edit Store Product/);
assert.match(page, /Linked \/ Unlinked|Linked status/);
assert.match(page, /family_key/);
assert.match(page, /vendor_category_key/);
assert.match(page, /Create \/ Save Mapping & Continue/);
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

assert.match(reviewV2, /discovery_hash/);
assert.match(reviewV2, /details_refreshed_at/);
assert.match(reviewV2, /storage_bucket/);
assert.match(reviewV2, /storage_path/);
assert.match(reviewV2, /storage_sha256/);
assert.match(reviewV2, /storage_bytes/);
assert.equal(
  reviewV2Migration.trim(),
  reviewV2.trim(),
  "Deployable vendor review v2 migration must mirror canonical SQL"
);

assert.match(reviewV3, /vendor_category_key/);
assert.match(reviewV3, /family_key/);
assert.match(reviewV3, /variant_code/);
assert.match(reviewV3, /vendor_catalog_category_mappings/);
assert.match(reviewV3, /vendor_catalog_checks/);
assert.match(reviewV3, /vendor_catalog_check_items/);
assert.match(reviewV3, /enable row level security/i);
assert.match(reviewV3, /unique \(vendor_code, vendor_category_key\)/i);
assert.match(reviewV3, /guard_vendor_catalog_approval/);
assert.match(reviewV3, /current_user\s*<>\s*'service_role'/i);
assert.doesNotMatch(reviewV3, /auth\.role\(\)/);
assert.match(reviewV3, /grant update \(review_status\) on public\.vendor_catalog_items to authenticated/i);
assert.doesNotMatch(reviewV3, /grant update \([^)]*canonical_product_id[^)]*\).*authenticated/i);
assert.equal(
  reviewV3Migration.trim(),
  reviewV3.trim(),
  "Deployable vendor review v3 migration must mirror canonical SQL"
);

assert.match(docs, /never auto-publishes/i);
assert.match(docs, /Modulex selling price/i);
assert.match(docs, /store-media/i);
assert.match(docs, /external image/i);
assert.match(docs, /Check Updates/i);
assert.match(docs, /category mapping/i);
assert.match(docs, /family/i);
assert.match(docs, /How to add a vendor/i);

console.log("vendor catalog sync contract: ok");
