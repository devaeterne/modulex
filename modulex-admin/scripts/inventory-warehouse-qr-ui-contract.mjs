import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/inventory/page.tsx", "/inventory"],
  ["src/app/(admin)/stock-movements/page.tsx", "/stock-movements"],
  ["src/app/(admin)/stock-operations/page.tsx", "/stock-operations"],
  ["src/app/(admin)/warehouses/page.tsx", "/warehouses"],
  ["src/app/(admin)/zones/page.tsx", "/zones"],
  ["src/app/(admin)/locations/page.tsx", "/locations"],
  ["src/app/(admin)/qr-labels/page.tsx", "/qr-labels"],
  ["src/app/(admin)/scan/page.tsx", "/scan"],
  ["src/app/(admin)/shelf-inventory/page.tsx", "/shelf-inventory"],
];
for (const [file] of routes) expect(fs.existsSync(path.join(root, file)), `Missing operations route: ${file}`);
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [, route] of routes) expect(sidebar.includes(`path: "${route}"`), `Sidebar missing ${route}`);
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const dirs = ["src/components/inventory", "src/components/stock-movements", "src/components/stock-operations", "src/components/warehouses", "src/components/zones", "src/components/locations", "src/components/qr-labels", "src/components/qr", "src/components/scan"];
const sources = [...dirs.flatMap(collect), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "Inventory/Warehouse/QR surfaces must support dark mode");
expect(sources.includes("overflow-x-auto") || /\b(sm|md|lg|xl):/.test(sources), "Operations surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=/.test(sources), "Operations surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "Operations surfaces need loading and error handling");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin"), "Operations surfaces must not ship dead/template controls");
expect(/inventory\.(view|manage)|warehouse|qr/.test(sidebar.toLowerCase()), "Operations navigation must remain permission-gated");
console.log("inventory + warehouse + QR UI contract: ok");
