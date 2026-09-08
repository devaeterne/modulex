import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const list = fs.readFileSync(path.join(root, "src/components/customers/CustomerOrdersList.tsx"), "utf8");
const newOrder = fs.readFileSync(path.join(root, "src/components/customers/NewCustomerOrder.tsx"), "utf8");
const editOrder = fs.readFileSync(path.join(root, "src/components/customers/EditCustomerOrder.tsx"), "utf8");
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

function assertBoundField(source, fieldMarkup, controlId, message) {
  assert(source.includes(fieldMarkup), `${message} must bind the visible Field label with htmlFor`);
  assert(source.includes(`id="${controlId}"`), `${message} control must expose id=${controlId}`);
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

assert(newOrder.includes("<Label htmlFor={htmlFor}>{label}</Label>"), "New Order Field wrapper must associate visible labels with controls");
assert(editOrder.includes("<Label htmlFor={htmlFor}>{label}</Label>"), "Edit Order Field wrapper must associate visible labels with controls");

for (const [markup, id, message] of [
  ['<Field label="Price Group" htmlFor="new-order-price-group"', "new-order-price-group", "New Order Price Group"],
  ['<Field label="Fulfillment Type" htmlFor="new-order-fulfillment-type"', "new-order-fulfillment-type", "New Order Fulfillment Type"],
  ['<Field label="Payment Method" htmlFor="new-order-payment-method"', "new-order-payment-method", "New Order Payment Method"],
  ['<Field label="Administrative Fee (%)" htmlFor="new-order-administrative-fee"', "new-order-administrative-fee", "New Order Administrative Fee"],
  ['<Field label="Initial Status" htmlFor="new-order-initial-status"', "new-order-initial-status", "New Order Initial Status"],
  ['<Field label="Expected Delivery" htmlFor="new-order-expected-delivery"', "new-order-expected-delivery", "New Order Expected Delivery"],
  ['<Field label="Customer Reference" htmlFor="new-order-customer-reference"', "new-order-customer-reference", "New Order Customer Reference"],
  ['<Field label="Billing Address" htmlFor="new-order-billing-address"', "new-order-billing-address", "New Order Billing Address"],
  ['<Field label="Shipping Address" htmlFor="new-order-shipping-address"', "new-order-shipping-address", "New Order Shipping Address"],
  ['<Field label={`Order Discount (${currency})`} htmlFor="new-order-discount"', "new-order-discount", "New Order Discount"],
  ['<Field label="Tax Rate (%)" htmlFor="new-order-tax-rate"', "new-order-tax-rate", "New Order Tax Rate"],
  ['<Field label="Customer Notes" htmlFor="new-order-customer-notes"', "new-order-customer-notes", "New Order Customer Notes"],
  ['<Field label="Internal Notes" htmlFor="new-order-internal-notes"', "new-order-internal-notes", "New Order Internal Notes"],
]) assertBoundField(newOrder, markup, id, message);

for (const [markup, id, message] of [
  ['<Field label="Price Group" htmlFor="edit-order-price-group"', "edit-order-price-group", "Edit Order Price Group"],
  ['<Field label="Fulfillment Type" htmlFor="edit-order-fulfillment-type"', "edit-order-fulfillment-type", "Edit Order Fulfillment Type"],
  ['<Field label="Payment Method" htmlFor="edit-order-payment-method"', "edit-order-payment-method", "Edit Order Payment Method"],
  ['<Field label="Administrative Fee (%)" htmlFor="edit-order-administrative-fee"', "edit-order-administrative-fee", "Edit Order Administrative Fee"],
  ['<Field label="Expected Delivery" htmlFor="edit-order-expected-delivery"', "edit-order-expected-delivery", "Edit Order Expected Delivery"],
  ['<Field label="Customer Reference" htmlFor="edit-order-customer-reference"', "edit-order-customer-reference", "Edit Order Customer Reference"],
  ['<Field label="Billing Address" htmlFor="edit-order-billing-address"', "edit-order-billing-address", "Edit Order Billing Address"],
  ['<Field label="Shipping Address" htmlFor="edit-order-shipping-address"', "edit-order-shipping-address", "Edit Order Shipping Address"],
  ['<Field label={`Order Discount (${currency})`} htmlFor="edit-order-discount"', "edit-order-discount", "Edit Order Discount"],
  ['<Field label="Tax Rate (%)" htmlFor="edit-order-tax-rate"', "edit-order-tax-rate", "Edit Order Tax Rate"],
  ['<Field label="Customer Notes" htmlFor="edit-order-customer-notes"', "edit-order-customer-notes", "Edit Order Customer Notes"],
  ['<Field label="Internal Notes" htmlFor="edit-order-internal-notes"', "edit-order-internal-notes", "Edit Order Internal Notes"],
  ['<Field label="Reason" htmlFor="edit-order-revision-reason"', "edit-order-revision-reason", "Edit Order Revision Reason"],
  ['<Field label="Removal Reason" htmlFor="edit-order-countertop-remove-reason"', "edit-order-countertop-remove-reason", "Edit Order Countertop Removal Reason"],
]) assertBoundField(editOrder, markup, id, message);

assert(editOrder.includes('htmlFor={`edit-order-countertop-title-${index}`}'), "Configured Countertop line title must expose a unique visible-label association");
assert(editOrder.includes('id={`edit-order-countertop-title-${index}`}'), "Configured Countertop line title input must expose the matching unique id");

console.log("PASS: order list consistency contract");
