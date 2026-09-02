import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const route = readFileSync(
  resolve(root, "src/app/api/vendor-catalog/items/[itemId]/approve/route.ts"),
  "utf8"
);
const approval = readFileSync(
  resolve(root, "src/lib/vendor-catalog/approval.ts"),
  "utf8"
);
const listPriceTriggerSql = readFileSync(
  resolve(root, "sql/vendor-catalog-sync-list-price-trigger.sql"),
  "utf8"
);
const listPriceTriggerMigration = readFileSync(
  resolve(root, "../modulex-store/supabase/migrations/20260902142000_vendor_catalog_sync_list_price_trigger.sql"),
  "utf8"
);

assert.match(route, /approveReviewableVendorCatalogItem/);
assert.match(route, /console\.error\(/);
assert.match(approval, /loadCompletedApproval/);
assert.match(approval, /waitForConcurrentApproval/);
assert.match(approval, /alreadyApproved:\s*true/);
assert.match(approval, /approveVendorCatalogItem/);
assert.match(approval, /VendorCatalogMissingError/);
assert.doesNotMatch(approval, /VendorUnavailableError/);

assert.equal(listPriceTriggerMigration.trim(), listPriceTriggerSql.trim());
assert.match(listPriceTriggerSql, /create or replace function private\.apply_vendor_list_price_on_approval\(\)/i);
assert.match(listPriceTriggerSql, /security definer/i);
assert.match(listPriceTriggerSql, /new\.vendor_price_reference is null/i);
assert.match(listPriceTriggerSql, /is_base_price\s*=\s*true/i);
assert.match(listPriceTriggerSql, /pricing_model\s*<>\s*'price_group'/i);
assert.match(listPriceTriggerSql, /pg_advisory_xact_lock/i);
assert.match(listPriceTriggerSql, /set is_active\s*=\s*false[\s\S]*valid_to\s*=\s*v_now/i);
assert.match(listPriceTriggerSql, /insert into public\.product_prices/i);
assert.match(listPriceTriggerSql, /after update of review_status, canonical_product_id/i);
assert.doesNotMatch(listPriceTriggerSql, /after update of[^\n]*vendor_price_reference/i);
assert.match(listPriceTriggerSql, /new\.review_status\s*=\s*'APPROVED'/i);
assert.match(listPriceTriggerSql, /old\.review_status is distinct from new\.review_status/i);
assert.match(listPriceTriggerSql, /old\.canonical_product_id is distinct from new\.canonical_product_id/i);
assert.doesNotMatch(listPriceTriggerSql, /silver|gold|platinum|pickup|fob/i);
assert.doesNotMatch(approval, /product_prices|is_base_price|vendor_price_reference/);

console.log("vendor approval idempotency contract: ok");
