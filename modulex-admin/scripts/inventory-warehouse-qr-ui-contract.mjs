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
  expect(source.includes("overflow-x-auto") || source.includes("TableViewport") || /\b(sm|md|lg|xl):/.test(source), `${surface.route} needs responsive behavior`);
  expect(/aria-|htmlFor=|role=|<label\b/.test(source), `${surface.route} needs accessible labels/state`);
  expect(/isLoading|loading|Loading/.test(source) && /error|Error/.test(source), `${surface.route} needs loading and error handling`);
  expect(!source.includes('href="#"') && !source.includes("javascript:void") && !source.includes("TailAdmin"), `${surface.route} must not ship dead/template controls`);
}

const inventoryTable = read("src/components/inventory/InventoryTable.tsx");
const sharedSelect = read("src/components/form/Select.tsx");
for (const primitive of [
  "ComponentCard",
  "Input",
  "Label",
  "Select",
  "Alert",
  "Badge",
  "Button",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(inventoryTable.includes(primitive), `Inventory UI must compose shared ${primitive} primitives`);
}
expect(!/<(?:input|select|table|thead|tbody|tr|th|td|button)\b/.test(inventoryTable), "Inventory UI must not reimplement shared form, button, or table primitives");
expect(inventoryTable.includes('<Table variant="admin"'), "Inventory must use the shared admin table variant");
expect(inventoryTable.includes("<TableViewport"), "Inventory must use the shared responsive table viewport");
expect(inventoryTable.includes('className="w-full min-w-[1040px]"'), "Inventory table must fill the available card width while retaining its mobile minimum width");
expect(inventoryTable.includes('supabase.rpc("search_stock_page"'), "Inventory must preserve the server-side stock search RPC");
expect(inventoryTable.includes('mode = "overview"') && inventoryTable.includes('mode === "shelf"'), "Inventory must preserve overview and shelf modes");
expect(inventoryTable.includes('href="/scan"'), "Shelf inventory must preserve Scan QR / Barcode navigation");
expect(sharedSelect.includes("disabled?: boolean"), "Shared Select must support disabled inventory filter states");
expect(sharedSelect.includes("disabled={disabled}"), "Shared Select must forward disabled state to the native select");

const stockMovements = read("src/components/stock-movements/StockMovementsTable.tsx");
for (const primitive of [
  "ComponentCard",
  "Alert",
  "Badge",
  "Button",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(stockMovements.includes(primitive), `Stock Movements UI must compose shared ${primitive} primitives`);
}
expect(!/<(?:table|thead|tbody|tr|th|td|button)\b/.test(stockMovements), "Stock Movements UI must not reimplement shared button or table primitives");
expect(stockMovements.includes('<Table variant="admin"'), "Stock Movements must use the shared admin table variant");
expect(stockMovements.includes("<TableViewport"), "Stock Movements must use the shared responsive table viewport");
expect(stockMovements.includes('className="w-full min-w-[1120px]"'), "Stock Movements table must fill the available card width while retaining its responsive minimum width");
expect(stockMovements.includes('.from("v_inventory_movement_history")'), "Stock Movements must preserve the movement history view");
expect(stockMovements.includes('.order("created_at", { ascending: false })'), "Stock Movements must preserve newest-first ordering");
expect(stockMovements.includes(".limit(100)"), "Stock Movements must preserve the 100-row history limit");
expect(stockMovements.includes("Refresh stock movement history"), "Stock Movements must preserve an accessible refresh label");

const stockOperations = read("src/components/stock-operations/StockOperationForm.tsx");
for (const primitive of ["ComponentCard", "Label", "Select", "Input", "TextArea", "Alert", "Button"]) {
  expect(stockOperations.includes(primitive), `Stock Operations UI must compose shared ${primitive} primitives`);
}
expect(!/<(?:input|select|textarea|button)\b/.test(stockOperations), "Stock Operations UI must not reimplement shared form or button primitives");
expect(sharedSelect.includes("required?: boolean"), "Shared Select must support native required validation used by Stock Operations");
expect(sharedSelect.includes("required={required}"), "Shared Select must forward required state to the native select");
for (const rpcName of ["stock_in_idempotent", "stock_out_idempotent", "stock_transfer_idempotent", "reserve_stock_idempotent", "release_stock_idempotent"]) {
  expect(stockOperations.includes(rpcName), `Stock Operations must preserve ${rpcName}`);
}
expect(stockOperations.includes("getIdempotencyKey"), "Stock Operations must preserve idempotency key generation");
expect(stockOperations.includes('supabase.rpc("search_stock"'), "Stock Operations must preserve product stock location lookup");

const warehouseTable = read("src/components/warehouses/WarehousesTable.tsx");
const warehouseForm = read("src/components/warehouses/WarehouseForm.tsx");
const sharedTable = read("src/components/ui/table/index.tsx");
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
expect(warehouseTable.includes("onDoubleClick={canManage ?"), "Warehouse directory must preserve permission-gated double-click editing");
expect(sharedTable.includes("onDoubleClick?: React.MouseEventHandler<HTMLTableRowElement>"), "Shared TableRow must support native double-click behavior used by warehouse rows");
expect(sharedTable.includes("title?: string"), "Shared TableRow must support native row title text");
expect(warehouseForm.includes('htmlFor="warehouse-code"') && warehouseForm.includes('id="warehouse-code"'), "Warehouse code label must remain associated with its input");
expect(warehouseForm.includes('htmlFor="warehouse-type"') && warehouseForm.includes('id="warehouse-type"'), "Warehouse type label must remain associated with its select");

const zonesTable = read("src/components/zones/ZonesTable.tsx");
const zoneForm = read("src/components/zones/ZoneForm.tsx");
const zonesUi = `${zonesTable}\n${zoneForm}`;
for (const primitive of [
  "ComponentCard",
  "Input",
  "Label",
  "Select",
  "TextArea",
  "Alert",
  "Badge",
  "Button",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(zonesUi.includes(primitive), `Zones UI must compose shared ${primitive} primitives`);
}
expect(!zoneForm.includes("function WarehouseSelect"), "Zone form must not ship a route-local warehouse select implementation");
expect(!/<(?:input|select|textarea|table|thead|tbody|tr|th|td|button)\b/.test(zonesUi), "Zones UI must not reimplement shared form, button, or table primitives");
expect(zonesTable.includes('<Table variant="admin"'), "Zones directory must use the shared admin table variant");
expect(zonesTable.includes("<TableViewport>"), "Zones directory must use the shared responsive table viewport");
expect(zonesTable.includes("onDoubleClick={canManage ?"), "Zones directory must preserve permission-gated double-click editing");
expect(zonesTable.includes('supabase.rpc("delete_zone_if_empty"'), "Zones must preserve stock-safe delete RPC behavior");
expect(zonesTable.includes('zonesQuery = zonesQuery.eq("warehouse_id", warehouseId)'), "Zones must preserve warehouse filtering");
expect(zoneForm.includes('htmlFor="zone-warehouse"') && zoneForm.includes('id="zone-warehouse"'), "Zone warehouse label must remain associated with its select");
expect(zoneForm.includes('htmlFor="zone-code"') && zoneForm.includes('id="zone-code"'), "Zone code label must remain associated with its input");

const locationsTable = read("src/components/locations/LocationsTable.tsx");
const locationForm = read("src/components/locations/LocationForm.tsx");
const locationsUi = `${locationsTable}\n${locationForm}`;
for (const primitive of [
  "ComponentCard",
  "Input",
  "Label",
  "Select",
  "Alert",
  "Badge",
  "Button",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(locationsUi.includes(primitive), `Locations UI must compose shared ${primitive} primitives`);
}
expect(!/<(?:input|select|textarea|table|thead|tbody|tr|th|td|button)\b/.test(locationsUi), "Locations UI must not reimplement shared form, button, or table primitives");
expect(locationsTable.includes('<Table variant="admin"'), "Locations directory must use the shared admin table variant");
expect(locationsTable.includes("<TableViewport>"), "Locations directory must use the shared responsive table viewport");
expect(locationsTable.includes("onDoubleClick={canManage ?"), "Locations directory must preserve permission-gated double-click editing");
expect(locationsTable.includes('supabase.rpc("delete_location_if_empty"'), "Locations must preserve stock-safe delete RPC behavior");
expect(locationsTable.includes('locationsQuery = locationsQuery.eq("zone_id", zoneId)'), "Locations must preserve zone filtering");
expect(locationsTable.includes('locationsQuery = locationsQuery.eq("warehouse_id", warehouseId)'), "Locations must preserve warehouse filtering");
expect(locationForm.includes("This location contains stock. Transfer all stock out before moving the location to another warehouse."), "Location form must preserve the stock-safe warehouse move guard");
expect(locationForm.includes('htmlFor="location-warehouse"') && locationForm.includes('id="location-warehouse"'), "Location warehouse label must remain associated with its select");
expect(locationForm.includes('htmlFor="location-zone"') && locationForm.includes('id="location-zone"'), "Location zone label must remain associated with its select");

console.log("inventory + stock movements + stock operations + warehouse + zones + locations + QR UI contract: ok");
