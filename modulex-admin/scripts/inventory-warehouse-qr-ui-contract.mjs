import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };

function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? collect(path.join(dir, entry.name))
      : entry.name.endsWith(".tsx")
        ? [read(path.join(dir, entry.name))]
        : []
  );
}

const surfaces = [
  { file: "src/app/(admin)/inventory/page.tsx", route: "/inventory", permission: "inventory.view", dirs: ["src/components/inventory"] },
  { file: "src/app/(admin)/stock-movements/page.tsx", route: "/stock-movements", permission: "inventory.view", dirs: ["src/components/stock-movements"] },
  { file: "src/app/(admin)/stock-operations/page.tsx", route: "/stock-operations", permission: "inventory.manage", dirs: ["src/components/stock-operations"] },
  { file: "src/app/(admin)/warehouses/page.tsx", route: "/warehouses", permission: "warehouse.view", dirs: ["src/components/warehouses"] },
  { file: "src/app/(admin)/zones/page.tsx", route: "/zones", permission: "warehouse.view", dirs: ["src/components/zones"] },
  { file: "src/app/(admin)/locations/page.tsx", route: "/locations", permission: "warehouse.view", dirs: ["src/components/locations"] },
  { file: "src/app/(admin)/qr-labels/page.tsx", route: "/qr-labels", permission: "qr.view", dirs: ["src/components/qr-labels", "src/components/qr"] },
  { file: "src/app/(admin)/scan/page.tsx", route: "/scan", permission: "qr.manage", dirs: ["src/components/scan"] },
  { file: "src/app/(admin)/shelf-inventory/page.tsx", route: "/shelf-inventory", permission: "qr.manage", dirs: ["src/components/inventory"] },
];

const sidebar = read("src/layout/AppSidebar.tsx");

for (const surface of surfaces) {
  expect(fs.existsSync(path.join(root, surface.file)), `Missing operations route: ${surface.file}`);
  expect(sidebar.includes(`path: "${surface.route}", permission: "${surface.permission}"`), `${surface.route} must remain gated by ${surface.permission}`);

  const source = [read(surface.file), ...surface.dirs.flatMap(collect)].join("\n");
  expect(source.includes("dark:"), `${surface.route} must support dark mode`);
  expect(source.includes("overflow-x-auto") || /\b(sm|md|lg|xl):/.test(source), `${surface.route} needs responsive behavior`);
  expect(/aria-|htmlFor=|role=|<label\b/.test(source), `${surface.route} needs accessible labels/state`);
  expect(/isLoading|loading|Loading/.test(source) && /error|Error/.test(source), `${surface.route} needs loading and error handling`);
  expect(!source.includes('href="#"') && !source.includes("javascript:void") && !source.includes("TailAdmin"), `${surface.route} must not ship dead/template controls`);
}

const warehouseTable = read("src/components/warehouses/WarehousesTable.tsx");
const warehouseForm = read("src/components/warehouses/WarehouseForm.tsx");
const warehouseUi = `${warehouseTable}\n${warehouseForm}`;

for (const primitive of [
  "ComponentCard",
  "Input",
  "Label",
  "Select",
  "TextArea",
  "Checkbox",
  "Alert",
  "Badge",
  "Button",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(warehouseUi.includes(primitive), `Warehouse UI must compose shared ${primitive} primitives`);
}

expect(!warehouseUi.includes("function CustomSelect"), "Warehouse form must not ship a route-local select implementation");
expect(!/<(?:input|textarea|table|thead|tbody|tr|th|td|button)\b/.test(warehouseUi), "Warehouse domain UI must not reimplement shared form, button, or table primitives");
expect(warehouseTable.includes('<Table variant="admin"'), "Warehouse directory must use the shared admin table variant");
expect(warehouseTable.includes("<TableViewport>"), "Warehouse directory must use the shared responsive table viewport");
expect(warehouseForm.includes('htmlFor="warehouse-code"') && warehouseForm.includes('id="warehouse-code"'), "Warehouse code label must remain associated with its input");
expect(warehouseForm.includes('htmlFor="warehouse-type"') && warehouseForm.includes('id="warehouse-type"'), "Warehouse type label must remain associated with its select");

console.log("inventory + warehouse + QR UI contract: ok");
