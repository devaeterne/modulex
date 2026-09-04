import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const sourcePath = new URL("../src/lib/observability/apiTiming.ts", import.meta.url);
let source = await readFile(sourcePath, "utf8");
source = source.replace(/^import\s+["']server-only["'];?\s*$/m, "");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { withApiTiming } = await import(moduleUrl);

const events = [];
const originalInfo = console.info;
console.info = (event) => events.push(event);

try {
  const success = await withApiTiming(
    { route: "/api/test", method: "GET" },
    () => new Response("ok", { status: 201, headers: { "x-existing": "keep" } })
  );

  assert.equal(success.status, 201);
  assert.equal(success.headers.get("x-existing"), "keep");
  assert.match(success.headers.get("server-timing") ?? "", /^modulex_api;dur=\d+(?:\.\d+)?$/);
  assert.equal(events[0].event, "modulex_api_timing");
  assert.equal(events[0].route, "/api/test");
  assert.equal(events[0].method, "GET");
  assert.equal(events[0].status, 201);
  assert.equal(typeof events[0].duration_ms, "number");
  assert.deepEqual(Object.keys(events[0]).sort(), ["duration_ms", "event", "method", "route", "status"]);

  const notFound = await withApiTiming(
    { route: "/api/missing", method: "GET" },
    () => new Response(null, { status: 404 })
  );
  assert.equal(notFound.status, 404);
  assert.equal(events[1].status, 404);

  const boom = new Error("boom");
  await assert.rejects(
    () => withApiTiming({ route: "/api/fail", method: "POST" }, () => { throw boom; }),
    (error) => error === boom
  );
  assert.equal(events[2].status, 500);
  assert.equal(events[2].route, "/api/fail");
  assert.equal(events[2].method, "POST");
} finally {
  console.info = originalInfo;
}

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const adminRoot = resolve(scriptDir, "..");
const apiRoot = join(adminRoot, "src", "app", "api");

async function findRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findRouteFiles(fullPath)));
    if (entry.isFile() && entry.name === "route.ts") files.push(fullPath);
  }
  return files;
}

const routeFiles = await findRouteFiles(apiRoot);
const routeInventory = routeFiles.map((file) => relative(adminRoot, file).replaceAll("\\", "/")).sort();

const expectedInventory = [
  "src/app/api/admin/dealer-portal/route.ts",
  "src/app/api/admin/email-notifications/process/route.ts",
  "src/app/api/admin/email-notifications/route.ts",
  "src/app/api/admin/google-calendar/connection/route.ts",
  "src/app/api/admin/google-calendar/installations/[installationId]/sync/route.ts",
  "src/app/api/admin/google-calendar/oauth/callback/route.ts",
  "src/app/api/admin/google-calendar/oauth/start/route.ts",
  "src/app/api/admin/google-calendar/projects/[projectId]/resync/route.ts",
  "src/app/api/admin/google-calendar/projects/[projectId]/route.ts",
  "src/app/api/admin/google-calendar/status/route.ts",
  "src/app/api/admin/products/qr/route.ts",
  "src/app/api/admin/store-media/import/route.ts",
  "src/app/api/admin/store-media/route.ts",
  "src/app/api/admin/users/route.ts",
  "src/app/api/requests/notify-created/route.ts",
  "src/app/api/vendor-catalog/bulk/approve/route.ts",
  "src/app/api/vendor-catalog/bulk/eligible/route.ts",
  "src/app/api/vendor-catalog/category-mappings/route.ts",
  "src/app/api/vendor-catalog/check/route.ts",
  "src/app/api/vendor-catalog/items/[itemId]/approve/route.ts",
  "src/app/api/vendor-catalog/stone/backfill-approved/route.ts",
  "src/app/api/vendor-catalog/stone/sync/route.ts",
  "src/app/api/vendor-catalog/stone/vendors/route.ts",
  "src/app/api/vendor-catalog/sync/route.ts",
  "src/app/api/vendor-catalog/vendors/route.ts",
].sort();

assert.equal(routeInventory.length, 25, `Expected 25 API route files, found ${routeInventory.length}`);
assert.deepEqual(routeInventory, expectedInventory, "API route inventory changed; review timing coverage");

const uninstrumented = [];
for (const file of routeFiles) {
  const routeSource = await readFile(file, "utf8");
  const hasImport = /from\s+["']@\/lib\/observability\/apiTiming["']/.test(routeSource);
  const hasCall = routeSource.includes("withApiTiming(");
  if (!hasImport || !hasCall) uninstrumented.push(relative(adminRoot, file).replaceAll("\\", "/"));
}

assert.deepEqual(uninstrumented, [], `Uninstrumented API routes:\n${uninstrumented.map((file) => `- ${file}`).join("\n")}`);

const dynamicApprovalSource = await readFile(join(apiRoot, "vendor-catalog", "items", "[itemId]", "approve", "route.ts"), "utf8");
assert.match(dynamicApprovalSource, /["']\/api\/vendor-catalog\/items\/\[itemId\]\/approve["']/,
  "Dynamic approval timing must use the route template, not a concrete item ID");

console.log("api-timing contract passed");
