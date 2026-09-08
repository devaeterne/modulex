import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const legacy = readFileSync(
  resolve(root, "scripts/vendor-catalog-sync-base-contract.mjs"),
  "utf8"
).replace(
  'const adapters = read("src/lib/vendor-catalog/adapters.ts");',
  'const adapters = read("src/lib/vendor-catalog/base-adapters.ts");'
);

await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(legacy)}#${Date.now()}`);

const registry = readFileSync(
  resolve(root, "src/lib/vendor-catalog/adapters.ts"),
  "utf8"
);
assert.match(registry, /DynamicStoneAdapter/);
assert.match(registry, /dynamicstone:\s*"Dynamic Stone Tools"/);
assert.match(registry, /dynamicstone:\s*\(\)\s*=>\s*new DynamicStoneAdapter\(\)/);
assert.match(registry, /dynamicstonetools\.net/);
assert.match(registry, /vendorCatalogRegistry/);

console.log("vendor catalog registry facade contract: ok");
