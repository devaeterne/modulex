import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tableSource = read("src/components/ui/table/index.tsx");
const representativeTables = [
  {
    path: "src/components/inventory/InventoryTable.tsx",
    label: "Inventory",
    minWidth: "wide",
    columnCount: 8,
  },
  {
    path: "src/components/inventory/LowStockManager.tsx",
    label: "Low Stock",
    minWidth: "wide",
    columnCount: 9,
  },
  {
    path: "src/components/warehouses/WarehousesTable.tsx",
    label: "Warehouses",
    minWidth: "wide",
    columnCount: 7,
  },
  {
    path: "src/components/zones/ZonesTable.tsx",
    label: "Zones",
    minWidth: "extraWide",
    columnCount: 8,
  },
];

for (const token of ["min-w-0", "max-w-full", "overflow-x-auto", "overscroll-x-contain"]) {
  assert(
    tableSource.includes(token),
    `TableViewport must contain horizontal overflow safely: missing ${token}`,
  );
}

assert(
  /type\s+TableMinWidth\s*=/.test(tableSource) &&
    tableSource.includes('"wide"') &&
    tableSource.includes('"extraWide"'),
  "Shared Table must expose bounded min-width presets",
);
assert(
  tableSource.includes("minWidth?: TableMinWidth"),
  "Shared Table must accept the minWidth preset prop",
);
assert(
  tableSource.includes("TABLE_MIN_WIDTHS"),
  "Shared Table must own the readable minimum-width mapping",
);
assert(
  tableSource.includes("TableStateRow"),
  "Shared table system must expose TableStateRow for loading/empty/error rows",
);
assert(
  /export\s*\{[^}]*TableStateRow/s.test(tableSource),
  "TableStateRow must be exported from the shared table module",
);

for (const table of representativeTables) {
  const source = read(table.path);
  const constantPattern = new RegExp(`const\\s+TABLE_COLUMN_COUNT\\s*=\\s*${table.columnCount}\\s*;`);
  const widthPattern = new RegExp(`<Table[^>]*minWidth=["']${table.minWidth}["']`);

  assert(
    source.includes("TableViewport"),
    `${table.label} must keep TableViewport as the overflow owner`,
  );
  assert(
    widthPattern.test(source),
    `${table.label} must use the shared ${table.minWidth} table width preset`,
  );
  assert(
    !/<Table[^>]*className=["'][^"']*min-w-\[\d+px\]/.test(source),
    `${table.label} must not carry a route-local fixed table minimum width`,
  );
  assert(
    constantPattern.test(source),
    `${table.label} must define TABLE_COLUMN_COUNT=${table.columnCount}`,
  );
  assert(
    source.includes("TableStateRow"),
    `${table.label} must use the shared TableStateRow`,
  );
  assert(
    source.includes("<TableStateRow colSpan={TABLE_COLUMN_COUNT}"),
    `${table.label} state rows must use TABLE_COLUMN_COUNT for colSpan`,
  );
  assert(
    !/colSpan=\{\d+\}/.test(source),
    `${table.label} must not hardcode state-row colSpan values`,
  );
}

console.log("PASS: admin data table system contract");
