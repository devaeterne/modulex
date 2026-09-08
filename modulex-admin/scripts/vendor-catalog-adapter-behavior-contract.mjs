import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const legacy = readFileSync(
  resolve(root, "scripts/vendor-catalog-adapter-behavior-base-contract.mjs"),
  "utf8"
).replace(
  'return read("src/lib/vendor-catalog/adapters.ts").replace(',
  'return read("src/lib/vendor-catalog/base-adapters.ts").replace('
);

await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(legacy)}#${Date.now()}`);
