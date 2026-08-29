import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const list = fs.readFileSync(path.join(root, "src/components/customers/CustomerOrdersList.tsx"), "utf8");
const globalRoute = fs.readFileSync(path.join(root, "src/app/(admin)/customers/orders/page.tsx"), "utf8");
const scopedRoute = fs.readFileSync(path.join(root, "src/app/(admin)/customers/[id]/orders/page.tsx"), "utf8");
const summarySql = fs.readFileSync(path.join(root, "sql/customer-order-list-summary.sql"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(globalRoute.includes("<CustomerOrdersList />"), "global orders route must use the shared order list");
assert(scopedRoute.includes("<CustomerOrdersList customerId={id} />"), "customer-scoped orders route must use the same shared order list with customerId");
assert(list.includes('.from("customer_order_directory")'), "order list must query the RLS-safe customer order directory view");
assert(list.includes('count: "exact"'), "order list must request an exact filtered row count from Supabase");
assert(list.includes(".range("), "order list pagination must happen in the Supabase query");
assert(!list.includes("filtered.slice("), "order list must not paginate by slicing a full in-memory order list");
assert(!list.includes("searchCustomerIds"), "customer-name search must not fan out matching customer IDs into the browser");
assert(/customer_code\.ilike/.test(list) && /customer_name\.ilike/.test(list), "order search must match customer code/name directly in the paged directory query");
assert(list.includes(".or("), "order search must be applied at the Supabase query layer");
assert(list.includes("new URLSearchParams(window.location.search)") && list.includes("window.history.replaceState"), "order search/filter/page state must round-trip through the URL");
assert(list.includes('supabase.rpc("get_customer_order_list_summary"'), "order summary cards must use a database aggregate instead of the paged rows");
assert(/setFilteredCount\(ordersResult\.count\s*\?\?\s*0\)/.test(list), "filtered count must drive pagination metadata");
assert(/create or replace view public\.customer_order_directory[\s\S]*security_invoker\s*=\s*true/i.test(summarySql), "A1.2A SQL must define a SECURITY INVOKER customer-order directory view");
assert(/from public\.customer_orders\s+o[\s\S]*join public\.customers\s+c/i.test(summarySql), "order directory view must join orders to customer display/search fields server-side");
assert(/revoke all on public\.customer_order_directory from public/i.test(summarySql), "order directory view must revoke PUBLIC privileges");
assert(/grant select on public\.customer_order_directory to authenticated/i.test(summarySql), "order directory view must grant authenticated SELECT");
assert(/create or replace function public\.get_customer_order_list_summary/i.test(summarySql), "A1.2A SQL must define the order-list summary RPC");
assert(/security\s+invoker/i.test(summarySql) && !/security\s+definer/i.test(summarySql), "order-list summary RPC must preserve caller RLS with SECURITY INVOKER");
assert(/revoke all on function public\.get_customer_order_list_summary\(uuid\) from public/i.test(summarySql), "order-list summary RPC must revoke PUBLIC execute");
assert(/grant execute on function public\.get_customer_order_list_summary\(uuid\) to authenticated/i.test(summarySql), "order-list summary RPC must grant authenticated execute");
assert(pkg.scripts?.["smoke:order-list"] === "node scripts/order-list-consistency-contract.mjs", "package.json must expose smoke:order-list");
assert(pkg.scripts?.smoke?.includes("smoke:order-list"), "main Admin smoke chain must include smoke:order-list");

console.log("PASS: order list consistency contract");
