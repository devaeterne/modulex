import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

async function importTranspiled(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const encoded = Buffer.from(compiled).toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`);
}

let identitySource;
try {
  identitySource = read("src/lib/vendor-catalog/stone-identity.ts");
} catch {
  assert.fail("Stone approval must expose a pure stone-identity helper for family/variant collision handling.");
}

const identity = await importTranspiled(identitySource);
const approvalSource = read("src/lib/vendor-catalog/stone-approve.ts");

assert.match(approvalSource, /buildStoneIdentityCandidates/);
assert.match(approvalSource, /categoryFamilyCode/);
assert.match(approvalSource, /disambiguatedVariantCode/);
assert.match(approvalSource, /category_id/);
assert.match(approvalSource, /color_code/);

const perlaQuartz = identity.buildStoneIdentityCandidates({
  familyKey: "VENEZIA:perla-taj",
  fallbackFamilyCode: "STONE-VENEZIA-PERLA-TAJ-QUARTZ",
  categoryName: "Quartz",
  externalId: "perla-taj-quartz",
  title: "Perla Taj Quartz",
  variantCode: "3cm",
  finish: null,
});
assert.equal(perlaQuartz.baseFamilyCode, "VENEZIA-PERLA-TAJ");
assert.equal(perlaQuartz.categoryFamilyCode, "VENEZIA-PERLA-TAJ-QUARTZ");
assert.equal(perlaQuartz.baseVariantCode, "3CM");
assert.equal(perlaQuartz.disambiguatedVariantCode, "3CM-PERLA-TAJ-QUARTZ");

const perlaQuartzite = identity.buildStoneIdentityCandidates({
  familyKey: "VENEZIA:perla-taj",
  fallbackFamilyCode: "STONE-VENEZIA-PERLA-TAJ-QUARTZITE",
  categoryName: "Quartzite",
  externalId: "perla-taj-quartzite",
  title: "Perla Taj Quartzite",
  variantCode: "3cm",
  finish: null,
});
assert.notEqual(perlaQuartz.categoryFamilyCode, perlaQuartzite.categoryFamilyCode);

const whiteOnyxSjq = identity.buildStoneIdentityCandidates({
  familyKey: "VENEZIA:white-onyx",
  fallbackFamilyCode: "STONE-VENEZIA-WHITE-ONYX-SJQ-QUARTZ",
  categoryName: "Quartz",
  externalId: "white-onyx-sjq-quartz",
  title: "White Onyx Sjq Quartz",
  variantCode: "3cm",
  finish: null,
});
assert.equal(whiteOnyxSjq.baseVariantCode, "3CM-SJQ");

const calacattaPsjq = identity.buildStoneIdentityCandidates({
  familyKey: "VENEZIA:calacatta-viola",
  fallbackFamilyCode: "STONE-VENEZIA-CALACATTA-VIOLA-PSJQ-QUARTZ",
  categoryName: "Quartz",
  externalId: "calacatta-viola-psjq-quartz",
  title: "Calacatta Viola Psjq Quartz",
  variantCode: "3cm",
  finish: null,
});
assert.equal(calacattaPsjq.baseVariantCode, "3CM-PSJQ");

const tajMahalJumbo = identity.buildStoneIdentityCandidates({
  familyKey: "VENEZIA:taj-mahal",
  fallbackFamilyCode: "STONE-VENEZIA-TAJ-MAHAL-JUMBO-QUARTZ",
  categoryName: "Quartz",
  externalId: "taj-mahal-jumbo-quartz",
  title: "Taj Mahal Jumbo Quartz",
  variantCode: "3cm-jumbo",
  finish: null,
});
assert.equal(tajMahalJumbo.baseVariantCode, "3CM-JUMBO");

const polished = identity.buildStoneIdentityCandidates({
  familyKey: "VENEZIA:test",
  fallbackFamilyCode: "STONE-VENEZIA-TEST",
  categoryName: "Quartz",
  externalId: "test-polished-quartz",
  title: "Test Quartz",
  variantCode: "3cm",
  finish: "Polished",
});
assert.equal(polished.baseVariantCode, "3CM-POLISHED");

console.log("stone product identity contract: ok");
