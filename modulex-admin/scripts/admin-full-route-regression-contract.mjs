import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

function walkPages(dir, pages = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, pages);
    else if (entry.isFile() && entry.name === "page.tsx") pages.push(full);
  }
  return pages;
}

function routeFromPage(file) {
  const relative = path.relative(path.join(root, "src/app"), file).replaceAll(path.sep, "/");
  const segments = relative
    .replace(/\/page\.tsx$/, "")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  return segments.length ? `/${segments.join("/")}` : "/";
}

const pageFiles = walkPages(path.join(root, "src/app"));
const pageRoutes = new Map(pageFiles.map((file) => [routeFromPage(file), file]));
const sidebar = read("src/layout/AppSidebar.tsx");
const sidebarRoutes = [...sidebar.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
const uniqueSidebarRoutes = [...new Set(sidebarRoutes)];

expect(sidebarRoutes.length === uniqueSidebarRoutes.length, "Sidebar route paths must be unique");
expect(uniqueSidebarRoutes.length === 69, `UI-2D expects 69 current sidebar routes, found ${uniqueSidebarRoutes.length}`);
for (const route of uniqueSidebarRoutes) {
  expect(pageRoutes.has(route), `Sidebar route is missing a page.tsx: ${route}`);
}

for (const route of [
  "/products/types",
  "/products/uom",
  "/pricing/material-bands",
  "/store/cabinet-content",
  "/store/reviews",
]) {
  expect(uniqueSidebarRoutes.includes(route), `Post-audit sidebar route missing: ${route}`);
}

for (const route of ["/products/new", "/products/[id]/edit", "/signin"]) {
  expect(pageRoutes.has(route), `Nested/auth route missing from current app surface: ${route}`);
}

for (const [route, file] of pageRoutes) {
  const source = fs.readFileSync(file, "utf8");
  expect(!/TailAdmin|dasoft\.me|info@dasoft\.me/i.test(source), `Demo/template copy remains in route ${route}`);
  expect(!/href=["']#["']/.test(source), `Dead hash link remains in route ${route}`);
}

const productReferences = read("src/components/products/ProductMasterReferenceManager.tsx");
expect(productReferences.includes("TableStateRow"), "Product Types/UOM must use the shared table state row");
expect(productReferences.includes("minWidth="), "Product Types/UOM must use shared table width presets");
expect(!/<Table[\s\S]{0,180}min-w-\[\d+px\]/m.test(productReferences), "Product Types/UOM must not use route-local fixed table widths");

const materialBands = read("src/components/pricing/MaterialBandPricingTable.tsx");
expect(materialBands.includes("TableStateRow"), "Material Bands must use the shared table state row");
expect(materialBands.includes("minWidth="), "Material Bands must use a shared table width preset");
expect(!/<Table[\s\S]{0,180}min-w-\[\d+px\]/m.test(materialBands), "Material Bands must not use a route-local fixed table width");
expect(!materialBands.includes('new Intl.NumberFormat("en-US"'), "Material Bands must use runtime locale formatting");

for (const relativePath of [
  "src/components/store/StoreCabinetContentManager.tsx",
  "src/components/store/StoreReviewsManager.tsx",
]) {
  const source = read(relativePath);
  const label = path.basename(relativePath);
  for (const sharedPrimitive of ["ComponentCard", "Label", "Input", "TextArea", "Select", "Alert", "Badge", "Button"]) {
    expect(source.includes(sharedPrimitive), `${label} must compose shared ${sharedPrimitive}`);
  }
  expect(source.includes("hasPermission"), `${label} must use canonical permission checks`);
  expect(source.includes('"store.manage"'), `${label} must gate mutations through store.manage`);
  expect(!source.includes("profile?.role"), `${label} must not hardcode role-based edit access`);
  expect(!/<(?:button|input|textarea|select)\b/.test(source), `${label} must not render native form/action controls directly`);
  expect(source.includes("Retry"), `${label} must expose retry behavior for load failures`);
}

const nestedRoutes = [...pageRoutes.keys()]
  .filter((route) => !uniqueSidebarRoutes.includes(route))
  .filter((route) => /(?:\/new(?:\/|$)|\/edit(?:\/|$)|\/print(?:\/|$)|\[[^/]+\])/.test(route))
  .sort();
expect(nestedRoutes.length >= 2, "UI-2D must inventory nested new/edit/detail/print routes");

console.log(`PASS: admin full route regression contract (${uniqueSidebarRoutes.length} sidebar routes, ${nestedRoutes.length} nested routes)`);
