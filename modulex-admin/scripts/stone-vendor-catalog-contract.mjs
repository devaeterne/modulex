import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const source = readFileSync(
  resolve(root, "scripts/stone-vendor-catalog-base-contract.mjs"),
  "utf8"
).replace(
  'const sinkAdapters = read("src/lib/vendor-catalog/adapters.ts");',
  'const sinkAdapters = read("src/lib/vendor-catalog/base-adapters.ts");'
);
const runtimePath = resolve(root, `scripts/.stone-vendor-catalog-contract-${process.pid}.mjs`);
writeFileSync(runtimePath, source, "utf8");
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  unlinkSync(runtimePath);
}
