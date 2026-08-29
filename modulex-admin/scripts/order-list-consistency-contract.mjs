import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const list = fs.readFileSync(path.join(root, "src/components/customers/CustomerOrdersList.tsx"), "utf8");
const globalRoute = fs.readFileSync(path.join(root, "src/app/(admin)/customers/orders/page.tsx"), "utf8");
const scopedRoute = fs.readFileSync(path.join(root, "src/app/(admin)/customers/[id]/orders/page.tsx"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(globalRoute.includes("<CustomerOrdersList />"), "global orders route must use the shared order list");
assert(scopedRoute.includes("<CustomerOrdersList customerId={id} />"), "customer-scoped orders route must use the same shared order list with customerId");
assert(list.includes('count: "exact"'), "order list must request an exact filtered row count from Supabase");
assert(list.includes(".range("), "order list pagination must happen in the Supabase query");
assert(!list.includes("filtered.slice("), "order list must not paginate by slicing a full in-memory order list");
assert(!/from\(["']customer_orders["']\)\s*\.select\(["']\*["']\)\s*\.order/.test(list), "order list must not load the entire order table before filtering");
assert(!/from\(["']customers["']\)\s*\.select\(["']\*["']\)\s*\.order/.test(list), "global order list must not load the entire customer table");
assert(list.includes("searchCustomerIds"), "order search must preserve customer name/code matching without loading every customer");
assert(list.includes(".or("), "order search must be applied at the Supabase query layer");
assert(list.includes("new URLSearchParams(window.location.search)") && list.includes("window.history.replaceState"), "order search/filter/page state must round-trip through the URL");
assert(list.includes('supabase.rpc("get_customer_order_list_summary"'), "order summary cards must use a database aggregate instead of the paged rows");
assert(list.includes("setFilteredCount(count ?? 0)"), "filtered count must drive pagination metadata");
assert(pkg.scripts?.["smoke:order-list"] === "node scripts/order-list-consistency-contract.mjs", "package.json must expose smoke:order-list");
assert(pkg.scripts?.smoke?.includes("smoke:order-list"), "main Admin smoke chain must include smoke:order-list");

console.log("PASS: order list consistency contract");
