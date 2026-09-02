import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const route = readFileSync(
  resolve(root, "src/app/api/vendor-catalog/items/[itemId]/approve/route.ts"),
  "utf8"
);

assert.match(route, /loadCompletedApproval/);
assert.match(route, /waitForCompletedApproval/);
assert.match(route, /alreadyApproved:\s*true/);
assert.match(route, /console\.error\(/);

console.log("vendor approval idempotency contract: ok");
