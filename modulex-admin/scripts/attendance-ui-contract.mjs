import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const [attendance, packageJsonText] = await Promise.all([
  readFile(path.join(root, "src/components/hr/AttendanceManager.tsx"), "utf8"),
  readFile(path.join(root, "package.json"), "utf8"),
]);

const packageJson = JSON.parse(packageJsonText);

for (const primitive of [
  "Button",
  "Badge",
  "TableViewport",
  "Table",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
  "TableStateRow",
]) {
  assert.match(
    attendance,
    new RegExp(`\\b${primitive}\\b`),
    `Attendance must compose the shared ${primitive} primitive`,
  );
}

assert.doesNotMatch(
  attendance,
  /<(?:button|table|thead|tbody|tr|th|td)\b/,
  "Attendance must not reimplement shared button or table primitives",
);

assert.match(
  packageJson.scripts?.["smoke:attendance-ui"] ?? "",
  /attendance-ui-contract\.mjs/,
  "Attendance UI contract must be available through the package smoke convention",
);
assert.match(
  packageJson.scripts?.smoke ?? "",
  /npm run smoke:attendance-ui/,
  "Attendance UI contract must run in the normal Admin smoke chain",
);

assert.match(
  attendance,
  /function formatWorkDate\([\s\S]*split\("-"\)[\s\S]*`\$\{day\}\.\$\{month\}\.\$\{year\}`/,
  "Attendance dates must render as DD.MM.YYYY without timezone conversion",
);
assert.match(attendance, /function getStatusPresentation\(/, "Attendance must define semantic status presentation");
assert.match(attendance, /<Badge[\s\S]{0,220}presentation\.label/, "Attendance statuses must render with shared badges");

for (const label of ["Regular hours", "Overtime hours", "Break (min)", "Clock in", "Clock out", "Actions"]) {
  assert.match(attendance, new RegExp(label.replace(/[()]/g, "\\$&")), `Attendance must expose the ${label} label`);
}

assert.match(attendance, />\s*Clear filters\s*</, "Attendance filters must provide a clear action");
assert.match(attendance, /records\.length\}\s*record/, "Attendance toolbar must show the result count");
assert.match(attendance, /<TableViewport>[\s\S]*minWidth="medium"/, "Attendance table must remain readable and horizontally scroll on narrow screens");
assert.match(attendance, /text-right tabular-nums/, "Attendance numeric columns must be right-aligned and tabular");

assert.match(attendance, /isLoading[\s\S]*Loading attendance records/, "Attendance must expose a loading table state");
assert.match(attendance, /loadError[\s\S]*Try again/, "Attendance must expose a recoverable load error state");
assert.match(attendance, /No attendance records in this range\./, "Attendance must expose an empty table state");
assert.match(attendance, /aria-live="polite"/, "Attendance feedback must be announced to assistive technology");

assert.match(attendance, /existingRecord[\s\S]*Update existing day/, "Attendance form must surface update mode for an existing employee/date");
assert.doesNotMatch(attendance, /window\.confirm\(/, "Attendance delete must not depend on a browser confirm dialog");
assert.match(attendance, /deleteCandidateId[\s\S]*Confirm delete/, "Attendance delete must use an explicit two-step confirmation state");

assert.match(attendance, /grid gap-4 sm:grid-cols-2 xl:grid-cols-4/, "Attendance KPI cards must scale 1 → 2 → 4 columns");
assert.match(attendance, /xl:grid-cols-\[380px_minmax\(0,1fr\)\]/, "Attendance form/table layout must preserve a 380px desktop form rail");

console.log("attendance UI contract: ok");
