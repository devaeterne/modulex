import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const [dashboard, header, sidebar] = await Promise.all([
  readFile(path.join(root, "src/components/dashboard/ModulexDashboard.tsx"), "utf8"),
  readFile(path.join(root, "src/layout/AppHeader.tsx"), "utf8"),
  readFile(path.join(root, "src/layout/AppSidebar.tsx"), "utf8"),
]);

assert.match(
  dashboard,
  /overflow-x-auto[\s\S]{0,300}<table className="min-w-\[720px\]/,
  "Dashboard recent movements table must scroll horizontally on narrow screens and keep a readable minimum width",
);

assert.match(
  dashboard,
  /new Intl\.NumberFormat\(undefined,/,
  "Dashboard numbers must use the runtime locale instead of hardcoded en-US formatting",
);
assert.match(
  dashboard,
  /new Intl\.DateTimeFormat\(undefined,/,
  "Dashboard dates must use the runtime locale instead of hardcoded en-US formatting",
);

assert.match(
  dashboard,
  /function formatMovementType\(/,
  "Dashboard must convert movement enum values into readable labels",
);
assert.match(
  dashboard,
  /formatMovementType\(movement\.movement_type\)/,
  "Recent movement rows must render the readable movement label",
);

assert.match(
  dashboard,
  />Try again</,
  "Dashboard error state must provide an explicit retry action",
);
assert.doesNotMatch(
  dashboard,
  /<p className="text-sm">\{errorMessage\}<\/p>/,
  "Dashboard must not expose raw backend error messages directly to users",
);

assert.doesNotMatch(
  header,
  /Search products, SKU, barcode or location|inputRef|⌘|event\.preventDefault\(\)/,
  "Header must not expose a fake global search control or dead keyboard shortcut UI",
);

assert.match(
  sidebar,
  /h-\[calc\(100dvh-4rem\)\]/,
  "Mobile sidebar must account for the fixed 4rem header height",
);
assert.match(
  sidebar,
  /lg:h-screen/,
  "Desktop sidebar must retain full viewport height",
);

assert.match(
  dashboard,
  /dark:border-gray-800[\s\S]*dark:bg-white\/\[0\.03\]/,
  "Dashboard cards must retain explicit dark-mode surface styling",
);

console.log("dashboard shell UI contract: ok");
