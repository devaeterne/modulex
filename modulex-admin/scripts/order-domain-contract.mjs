import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import "./order-list-consistency-contract.mjs";
import "./order-administrative-fee-contract.mjs";
import "./order-custom-vendor-cabinet-contract.mjs";

const root = process.cwd();
const domainPath = path.join(root, "src/lib/customers/order-domain.ts");
const readDedupPath = path.join(root, "src/lib/customers/read-dedup.ts");
const dateTimeInputPath = path.join(root, "src/components/form/DateTimeInput.tsx");
const installation = fs.readFileSync(path.join(root, "src/components/customers/CreateInstallationFromOrder.tsx"), "utf8");
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
assert(fs.existsSync(readDedupPath), "Order detail must define the shared customer read dedup adapter");
assert(fs.existsSync(dateTimeInputPath), "Order installation scheduling must define shared form/DateTimeInput.tsx");

const domain = fs.readFileSync(domainPath, "utf8");
const readDedup = fs.readFileSync(readDedupPath, "utf8");
const dateTimeInput = fs.readFileSync(dateTimeInputPath, "utf8");

for (const exportedName of [
  "loadCreateOrderContext",
  "loadEditOrderContext",
  "loadOrderDetail",
  "loadCustomerOrderRecord",
  "loadOrderPrices",
  "createCustomerOrder",
  "updateCustomerOrder",
  "removeCountertopOrderItem",
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
  assert(source.includes('from "@/lib/customers/order-domain"'), `${name} must consume the shared order domain adapter`);
}

assert(!newOrder.includes('.rpc("create_customer_order"'), "create UI must not call create_customer_order directly");
assert(!editOrder.includes('.rpc("update_customer_order"'), "edit UI must not call update_customer_order directly");
assert(!editOrder.includes('.rpc("remove_countertop_order_item"'), "Edit Order must not call configured Countertop removal RPC directly");
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
assert(readDedup.includes("loadCustomerOrderRecord"), "shared read adapter must expose an in-flight customer order read");
assert(domain.includes("loadCustomerOrderRecord(customerId, orderId)"), "order detail and revision policy must consume the shared order record read");
assert(installation.includes('from "@/lib/customers/order-domain"'), "installation scheduling surface must consume the shared order domain adapter");
assert(installation.includes("loadCustomerOrderRecord(params.id, params.orderId)"), "installation scheduling must reuse the shared order record read");
assert(!installation.includes('.from("customer_orders")'), "installation scheduling must not issue a second customer_orders read during page mount");
assert(installation.includes('DateTimeInput from "@/components/form/DateTimeInput"'), "installation scheduling must use the shared DateTimeInput");
assert(!installation.includes('type="datetime-local"'), "installation scheduling must not expose locale-dependent native datetime-local inputs");
assert(dateTimeInput.includes("formatDateTimeInput"), "shared DateTimeInput must format canonical local timestamps as MM.DD.YYYY HH:MM");
assert(dateTimeInput.includes("parseDateTimeInput"), "shared DateTimeInput must parse MM.DD.YYYY HH:MM back to canonical local timestamps");
assert(dateTimeInput.includes('placeholder = "MM.DD.YYYY HH:MM"'), "shared DateTimeInput must advertise the US date-time format");
assert(domain.includes('.rpc("create_customer_order"'), "order domain adapter must retain create_customer_order as the create boundary");
assert(domain.includes('.rpc("update_customer_order"'), "order domain adapter must retain update_customer_order as the edit boundary");
assert(domain.includes('.rpc("remove_countertop_order_item"'), "order domain adapter must own configured Countertop removal");
assert(domain.includes('.rpc("set_customer_order_status"'), "order domain adapter must retain set_customer_order_status as the status boundary");
assert(domain.includes("getCurrentProfile"), "order domain adapter must enforce profile-aware access");
assert(domain.includes("hasPermission"), "order domain adapter must preserve permission-based order detail access");
assert(pkg.scripts?.["smoke:order-domain"] === "node scripts/order-domain-contract.mjs", "package.json must expose smoke:order-domain");
assert(pkg.scripts?.smoke?.includes("smoke:order-domain"), "main Admin smoke chain must include smoke:order-domain");

console.log("PASS: order domain contract");