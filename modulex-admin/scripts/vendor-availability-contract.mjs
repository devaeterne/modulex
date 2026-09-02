import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..");

function read(relativePath) {
  return fs.readFileSync(path.resolve(root, relativePath), "utf8");
}

function readRepo(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

const domain = read("src/lib/vendor-catalog/domain.ts");
const adapters = read("src/lib/vendor-catalog/adapters.ts");
const sync = read("src/lib/vendor-catalog/sync.ts");
const check = read("src/lib/vendor-catalog/check.ts");
const approval = read("src/lib/vendor-catalog/approval.ts");
const singleApproveRoute = read("src/app/api/vendor-catalog/items/[itemId]/approve/route.ts");
const page = read("src/app/(admin)/products/vendor-imports/page.tsx");
const workflow = readRepo(".github/workflows/admin-vendor-catalog-sync.yml");
const migrationPath = path.resolve(
  repoRoot,
  "modulex-store/supabase/migrations/20260902113500_vendor_catalog_availability_bulk_approval.sql"
);
const availabilityPath = path.resolve(root, "src/lib/vendor-catalog/availability.ts");
const eligibleRoutePath = path.resolve(
  root,
  "src/app/api/vendor-catalog/bulk/eligible/route.ts"
);
const bulkApproveRoutePath = path.resolve(
  root,
  "src/app/api/vendor-catalog/bulk/approve/route.ts"
);

assert.match(domain, /VendorAvailabilityStatus/);
for (const status of ["AVAILABLE", "OUT_OF_STOCK", "UNAVAILABLE", "UNKNOWN", "MISSING"]) {
  assert.match(domain, new RegExp(status));
}
assert.match(domain, /NormalizedVendorAvailability/);
assert.match(domain, /stableAvailabilityHash/);
assert.match(domain, /stableNormalizedAvailabilityHash/);
assert.match(domain, /isVendorApprovalEligible/);
assert.match(domain, /availability:\s*NormalizedVendorAvailability/);

assert.match(adapters, /available\?:\s*boolean/);
assert.match(adapters, /is_in_stock\?:\s*boolean/);
assert.match(adapters, /is_purchasable\?:\s*boolean/);
assert.match(adapters, /low_stock_remaining\?:\s*number\s*\|\s*null/);
assert.match(adapters, /normalizeKarranAvailability/);
assert.match(adapters, /normalizeRuvatiAvailability/);
assert.match(adapters, /OUT_OF_STOCK/);
assert.match(adapters, /UNAVAILABLE/);
assert.match(adapters, /UNKNOWN/);
assert.match(adapters, /source:\s*"product-sitemap\.xml"/);

assert.match(check, /availabilityChanged/);
assert.match(check, /availabilityHash/);
assert.match(check, /availability:\s*product\.availability/);
assert.match(check, /willSync:\s*counts\.created\s*\+\s*counts\.updated/);

assert.match(sync, /stableAvailabilityHash/);
assert.match(sync, /availabilityChanged/);
assert.match(sync, /availability_hash/);
assert.match(sync, /missing_success_count/);
assert.match(sync, /reconcileVendorAvailability/);
assert.match(sync, /nextMissingCount\s*>=\s*2/);
assert.match(sync, /categoryKey\s*!==\s*null/);
assert.match(sync, /externalId\.startsWith\("sitemap:"\)/);
assert.match(sync, /if \(counts\.failed === 0\) \{\s*await reconcileObservedAvailability\(prepared/s);
assert.match(sync, /if \(!entry\.existing\) continue/);
assert.doesNotMatch(sync, /!entry\.existing \|\| !entry\.availabilityChanged/);

assert.ok(fs.existsSync(availabilityPath), "availability reconciliation helper is required");
const availability = fs.readFileSync(availabilityPath, "utf8");
assert.match(availability, /canonical_inactivated_by_vendor_at/);
assert.match(availability, /canonical_status_version_at/);
assert.match(availability, /reactivation_requires_review/);
assert.match(availability, /status:\s*"inactive"/);
assert.match(availability, /status:\s*"active"/);
assert.match(availability, /archived/);

assert.match(approval, /availability_status/);
assert.match(approval, /VendorUnavailableError/);
assert.match(approval, /VendorReviewNotEligibleError/);
assert.match(approval, /isVendorApprovalEligible/);
assert.match(singleApproveRoute, /VendorUnavailableError/);
assert.match(singleApproveRoute, /status:\s*409/);

assert.ok(fs.existsSync(eligibleRoutePath), "bulk eligible resolver route is required");
const eligibleRoute = fs.readFileSync(eligibleRoutePath, "utf8");
assert.match(eligibleRoute, /\.eq\("availability_status",\s*"AVAILABLE"\)/);
assert.match(eligibleRoute, /loadVendorCategoryMapping/);
assert.match(eligibleRoute, /reviewStatus !== "PENDING"/);

assert.ok(fs.existsSync(bulkApproveRoutePath), "bulk approve route is required");
const bulkApproveRoute = fs.readFileSync(bulkApproveRoutePath, "utf8");
assert.match(bulkApproveRoute, /itemIds\.length\s*>\s*5/);
assert.match(bulkApproveRoute, /const concurrency\s*=\s*2/);
assert.match(bulkApproveRoute, /approveAvailableVendorCatalogItem/);
assert.match(bulkApproveRoute, /SKIPPED/);
assert.match(bulkApproveRoute, /CategoryMappingRequiredError/);

assert.match(page, /availability_status/);
assert.match(page, /Stock \/ Availability/);
assert.match(page, /Select all \{eligibleIds\.length\} eligible filtered products/);
assert.match(page, /Approve Selected/);
assert.match(page, /Approved \$\{bulkProgress\?\.completed/);
assert.match(page, /<Checkbox/);
assert.match(page, /\.eq\("availability_status",\s*"AVAILABLE"\)/);
assert.match(page, /chunk\(ids, 5\)/);
assert.match(page, /Vendor unavailable/);

assert.ok(fs.existsSync(migrationPath), "vendor availability migration is required");
const migration = fs.readFileSync(migrationPath, "utf8");
for (const column of [
  "availability_status",
  "vendor_available",
  "vendor_purchasable",
  "vendor_stock_quantity",
  "availability_hash",
  "availability_changed_at",
  "missing_success_count",
  "canonical_inactivated_by_vendor_at",
  "canonical_status_version_at",
  "reactivation_requires_review",
]) {
  assert.match(migration, new RegExp(column));
}
assert.match(migration, /default 'UNKNOWN'/i);
assert.match(migration, /availability_status, review_status/);
assert.match(migration, /vendor_code, availability_status/);
assert.match(migration, /missing_success_count >= 0/);
assert.match(migration, /vendor_stock_quantity is null or vendor_stock_quantity >= 0/);
assert.doesNotMatch(migration, /update\s+public\.products\s+set\s+status/i);

assert.match(workflow, /vendor-availability-contract\.mjs/);
assert.match(workflow, /\*vendor_catalog_availability\*\.sql/);

console.log("vendor availability contract: ok");
