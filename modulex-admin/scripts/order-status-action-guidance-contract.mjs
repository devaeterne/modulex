import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};

const guidance = read("src/lib/customers/order-status-guidance.ts");
const detail = read("src/components/customers/CustomerOrderDetail.tsx");

assert.match(guidance, /extractOrderStatusError/i, "status errors must normalize Supabase/PostgREST error payloads");
assert.match(guidance, /shipping address/i, "shipping-address confirmation failures must have actionable guidance");
assert.match(guidance, /STANDALONE_STOCK_SHORTAGE|ORDER_STOCK_SHORTAGE/i, "stock shortages must have actionable guidance");
assert.match(guidance, /ORDER_HAS_RESERVED_STOCK/i, "reserved-stock lifecycle failures must have actionable guidance");
assert.match(guidance, /price group/i, "price-group failures must identify the pricing path");
assert.match(guidance, /payment method/i, "payment-method failures must be classified");
assert.match(guidance, /technicalDetail/i, "raw technical detail must remain available for escalation");

assert.match(detail, /Status Change Blocked/, "Order Detail must clearly state when a status change is blocked");
assert.match(detail, /Required action/, "blocked status UI must tell the user what to do next");
assert.match(detail, /Internal owner/, "blocked status UI must identify the responsible internal team");
assert.match(detail, /Customer contact/, "blocked status UI must identify who owns customer communication");
assert.match(detail, /customer_projects[\s\S]{0,260}sales_rep_id/i, "Project Sales Rep must take precedence when the Order is Project-linked");
assert.match(detail, /customer\.sales_rep_id/i, "Customer Sales Rep must remain the fallback owner");
assert.match(detail, /getOrderStatusGuidance/, "Order Detail must render structured status guidance instead of a raw RPC failure");

console.log("Order status action guidance contract PASS");
