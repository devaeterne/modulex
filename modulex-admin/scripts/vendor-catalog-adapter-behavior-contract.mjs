import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const source = readFileSync(
  resolve(root, "scripts/vendor-catalog-adapter-behavior-base-contract.mjs"),
  "utf8"
).replace(
  'return read("src/lib/vendor-catalog/adapters.ts").replace(',
  'return read("src/lib/vendor-catalog/base-adapters.ts").replace('
);
const runtimePath = resolve(root, `scripts/.vendor-catalog-adapter-behavior-${process.pid}.mjs`);
writeFileSync(runtimePath, source, "utf8");
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  unlinkSync(runtimePath);
}
