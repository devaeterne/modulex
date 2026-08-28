import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const cases = [
  {
    file: "src/lib/portal/orders.ts",
    factory: "createAuthorizedPortalClient",
    guard: "requireStorePortalContext",
    expectedFactoryCalls: 2,
  },
  {
    file: "src/lib/portal/fulfillment.ts",
    factory: "createAuthorizedPortalClient",
    guard: "requireStorePortalContext",
    expectedFactoryCalls: 5,
  },
  {
    file: "src/lib/portal/dealer.ts",
    factory: "createAuthorizedDealerClient",
    guard: "requireDealerPortalContext",
    expectedFactoryCalls: 7,
  },
];

for (const { file, factory, guard, expectedFactoryCalls } of cases) {
  const source = read(file);

  assert.match(source, new RegExp(`\\b${guard}\\b`), `${file} must import/use ${guard}`);
  assert.match(
    source,
    new RegExp(`async function ${factory}\\(\\)\\s*\\{[\\s\\S]*?await ${guard}\\(\\);[\\s\\S]*?return createServerSupabaseClient\\(\\);[\\s\\S]*?\\}`),
    `${file} must authorize before creating the protected Supabase client`,
  );

  const directClientCreations = source.match(/await createServerSupabaseClient\(\)/g) ?? [];
  assert.equal(
    directClientCreations.length,
    0,
    `${file} must not create a protected Supabase client directly from exported data helpers`,
  );

  const authorizedFactoryCalls = source.match(new RegExp(`await ${factory}\\(\\)`, "g")) ?? [];
  assert.equal(
    authorizedFactoryCalls.length,
    expectedFactoryCalls,
    `${file} must route every protected data helper through ${factory}`,
  );
}

console.log("Portal auth RPC guard contract PASS");
