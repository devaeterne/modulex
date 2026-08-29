import fs from "node:fs";

const source = fs.readFileSync("src/components/customers/CustomerOrdersList.tsx", "utf8");

if (!source.includes('.from("customer_order_directory")')) {
  console.error("FAIL: main must query customer_order_directory for paged order lists");
  process.exit(1);
}

console.log("PASS: main queries customer_order_directory");
