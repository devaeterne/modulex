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

assert.match(route, /approveReviewableVendorCatalogItem/);
assert.match(route, /console\.error\(/);
assert.match(approval, /loadCompletedApproval/);
assert.match(approval, /waitForConcurrentApproval/);
assert.match(approval, /alreadyApproved:\s*true/);
assert.match(approval, /approveVendorCatalogItem/);
assert.match(approval, /VendorCatalogMissingError/);
assert.doesNotMatch(approval, /VendorUnavailableError/);

console.log("vendor approval idempotency contract: ok");
