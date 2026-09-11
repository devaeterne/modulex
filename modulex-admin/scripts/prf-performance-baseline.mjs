import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const surfaces = [
  ["Dashboard", "/", "src/components/dashboard/ModulexDashboard.tsx"],
  ["Customers", "/customers", "src/components/customers/CustomersTable.tsx"],
  ["Orders", "/customers/orders", "src/components/customers/CustomerOrdersList.tsx"],
  ["Products", "/products", "src/components/products/ProductsTable.tsx"],
  ["Inventory", "/inventory", "src/components/inventory/InventoryTable.tsx"],
  ["Finance", "/finance", "src/components/finance/FinanceOverview.tsx"],
  ["Sales & Production Report", "/reports/sales-production", "src/components/reports/SalesProductionReport.tsx"],
];

function count(source, expression) {
  return source.match(expression)?.length ?? 0;
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath), constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const rows = [];
for (const [name, route, relativePath] of surfaces) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  rows.push({
    name,
    route,
    component: relativePath,
    bytes: Buffer.byteLength(source, "utf8"),
    lines: source.split("\n").length,
    client_component: /^\s*["']use client["'];/m.test(source),
    await_sites: count(source, /\bawait\b/g),
    promise_all_sites: count(source, /Promise\.all\s*\(/g),
    direct_supabase_sites: count(source, /\bsupabase\.(?:rpc|from|auth|storage)\b/g),
    dynamic_import_sites: count(source, /\bdynamic\s*\(\s*\(\)\s*=>\s*import\(/g),
    heavy_library_mentions: count(
      source,
      /(?:react-apexcharts|apexcharts|@react-jvectormap|@fullcalendar)/g,
    ),
    has_loading_state: /(?:isLoading|loading)/.test(source),
    has_error_state: /(?:errorMessage|\berror\b)/.test(source),
  });
}

const output = {
  generated_at: new Date().toISOString(),
  measurement_type: "static-load-path-baseline",
  note: "Counts source structure only; they are not browser latency measurements.",
  shared_route_boundaries: {
    loading: await exists("src/app/(admin)/loading.tsx"),
    error: await exists("src/app/(admin)/error.tsx"),
  },
  surfaces: rows,
};

console.log(JSON.stringify(output, null, 2));
