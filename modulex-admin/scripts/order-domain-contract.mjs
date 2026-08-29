import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const domainPath = path.join(root, "src/lib/customers/order-domain.ts");
const newOrder = fs.readFileSync(path.join(root, "src/components/customers/NewCustomerOrder.tsx"), "utf8");
const editOrder = fs.readFileSync(path.join(root, "src/components/customers/EditCustomerOrder.tsx"), "utf8");
const detailOrder = fs.readFileSync(path.join(root, "src/components/customers/CustomerOrderDetail.tsx"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(fs.existsSync(domainPath), "A1.2B must define src/lib/customers/order-domain.ts");

const domain = fs.readFileSync(domainPath, "utf8");

for (const exportedName of [
  "loadCreateOrderContext",
  "loadEditOrderContext",
  "loadOrderDetail",
  "loadOrderPrices",
  "createCustomerOrder",
  "updateCustomerOrder",
  "setCustomerOrderStatus",
]) {
  assert(
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportedName}\\b`).test(domain),
    `order domain adapter must export ${exportedName}`
  );
}

for (const [name, source] of [
  ["NewCustomerOrder", newOrder],
  ["EditCustomerOrder", editOrder],
  ["CustomerOrderDetail", detailOrder],
]) {
  assert(
    source.includes('from "@/lib/customers/order-domain"'),
    `${name} must consume the shared order domain adapter`
  );
}

assert(!newOrder.includes('.rpc("create_customer_order"'), "create UI must not call create_customer_order directly");
assert(!editOrder.includes('.rpc("update_customer_order"'), "edit UI must not call update_customer_order directly");
assert(!detailOrder.includes('.rpc("set_customer_order_status"'), "detail UI must not call set_customer_order_status directly");

assert(!newOrder.includes('.from("customers")'), "create UI customer reads must be centralized in the order domain adapter");
assert(!newOrder.includes('.from("customer_addresses")'), "create UI address reads must be centralized in the order domain adapter");
assert(!newOrder.includes('.from("product_prices")'), "create UI price reads must be centralized in the order domain adapter");
assert(!editOrder.includes('.from("customer_orders")'), "edit UI order reads must be centralized in the order domain adapter");
assert(!editOrder.includes('.from("customer_order_items")'), "edit UI item reads must be centralized in the order domain adapter");
assert(!editOrder.includes('.from("product_prices")'), "edit UI price reads must be centralized in the order domain adapter");
assert(!detailOrder.includes('.from("customer_orders")'), "detail UI order reads must be centralized in the order domain adapter");
assert(!detailOrder.includes('.from("customer_order_items")'), "detail UI item reads must be centralized in the order domain adapter");
assert(!detailOrder.includes('.from("customer_order_status_history")'), "detail UI history reads must be centralized in the order domain adapter");

assert(domain.includes('.rpc("create_customer_order"'), "order domain adapter must retain create_customer_order as the create boundary");
assert(domain.includes('.rpc("update_customer_order"'), "order domain adapter must retain update_customer_order as the edit boundary");
assert(domain.includes('.rpc("set_customer_order_status"'), "order domain adapter must retain set_customer_order_status as the status boundary");
assert(domain.includes("getCurrentProfile"), "order domain adapter must enforce profile-aware access");
assert(domain.includes("hasPermission"), "order domain adapter must preserve permission-based order detail access");

assert(pkg.scripts?.["smoke:order-domain"] === "node scripts/order-domain-contract.mjs", "package.json must expose smoke:order-domain");
assert(pkg.scripts?.smoke?.includes("smoke:order-domain"), "main Admin smoke chain must include smoke:order-domain");

console.log("PASS: order domain contract");
