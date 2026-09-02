import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
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
  assert.match(
    success.headers.get("server-timing") ?? "",
    /^modulex_api;dur=\d+(?:\.\d+)?$/
  );
  assert.equal(events[0].event, "modulex_api_timing");
  assert.equal(events[0].route, "/api/test");
  assert.equal(events[0].method, "GET");
  assert.equal(events[0].status, 201);
  assert.equal(typeof events[0].duration_ms, "number");
  assert.deepEqual(Object.keys(events[0]).sort(), [
    "duration_ms",
    "event",
    "method",
    "route",
    "status",
  ]);

  const notFound = await withApiTiming(
    { route: "/api/missing", method: "GET" },
    () => new Response(null, { status: 404 })
  );
  assert.equal(notFound.status, 404);
  assert.equal(events[1].status, 404);

  const boom = new Error("boom");
  await assert.rejects(
    () =>
      withApiTiming(
        { route: "/api/fail", method: "POST" },
        () => {
          throw boom;
        }
      ),
    (error) => error === boom
  );
  assert.equal(events[2].status, 500);
  assert.equal(events[2].route, "/api/fail");
  assert.equal(events[2].method, "POST");

  console.log("api-timing contract passed");
} finally {
  console.info = originalInfo;
}
