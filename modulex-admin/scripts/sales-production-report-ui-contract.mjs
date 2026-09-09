import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/reports/SalesProductionReport.tsx"),
  "utf8",
);

assert.match(source, /type ReportTab = "overview" \| "collections" \| "jobs";/);
assert.match(source, /useState<ReportTab>\("overview"\)/);
assert.match(source, /role="tablist"/);
for (const label of ["Overview", "Collections", "Jobs"]) {
  assert.ok(source.includes(`>${label}</Button>`), `Report tabs must include ${label}`);
}

assert.match(source, /dynamic\(\(\) => import\("react-apexcharts"\)/);
assert.match(source, /function SalesTrendChart/);
assert.match(source, /type="area"/);
assert.match(source, /function RankedBars/);

assert.match(
  source,
  /activeTab === "overview"[\s\S]*Sales Trend[\s\S]*Salesperson Performance[\s\S]*Material Mix[\s\S]*Territory \/ Location/,
  "Overview must contain the management summary and analysis blocks",
);
assert.match(
  source,
  /activeTab === "collections"[\s\S]*Payment Status[\s\S]*Needs Attention/,
  "Collections must isolate receivable and attention workflows",
);
assert.match(
  source,
  /activeTab === "jobs"[\s\S]*Job Detail/,
  "Jobs must isolate the order-level detail table",
);

assert.match(source, /No jobs currently need attention/);
assert.match(source, /grid gap-3 md:grid-cols-2 xl:grid-cols-6/);
assert.match(source, /grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6/);

console.log("Sales & Production dashboard UI contract: PASS");
