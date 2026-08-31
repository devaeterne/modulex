import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};
const productUiSmoke = scripts["smoke:product-ui"] ?? "";
const expectedContracts = [
  "product-list-ui-contract.mjs",
  "product-form-ui-contract.mjs",
  "product-reference-ui-contract.mjs",
  "taxonomy-ui-contract.mjs",
];

for (const contract of expectedContracts) {
  if (!productUiSmoke.includes(contract)) {
    throw new Error(`smoke:product-ui must run ${contract}`);
  }
}

if (!(scripts.smoke ?? "").includes("npm run smoke:product-ui")) {
  throw new Error("The normal Admin smoke chain must run smoke:product-ui");
}

console.log("product UI smoke wiring contract: ok");
