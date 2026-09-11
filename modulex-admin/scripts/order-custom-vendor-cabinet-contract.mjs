import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const modalPath = path.join(root, "src/components/customers/CustomVendorCabinetLineModal.tsx");
const domainPath = path.join(root, "src/lib/customers/custom-vendor-cabinet.ts");
const newOrderPath = path.join(root, "src/components/customers/NewCustomerOrder.tsx");
const migrationPath = path.join(root, "../modulex-store/supabase/migrations/20260911194500_custom_vendor_cabinet_order_lines.sql");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(fs.existsSync(modalPath), "Custom vendor Cabinet entry must provide a dedicated modal");
assert(fs.existsSync(domainPath), "Custom vendor Cabinet entry must use a shared domain helper");
assert(fs.existsSync(migrationPath), "Custom vendor Cabinet lines must ship with the canonical Supabase migration");

const modal = fs.readFileSync(modalPath, "utf8");
const domain = fs.readFileSync(domainPath, "utf8");
const newOrder = fs.readFileSync(newOrderPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

for (const label of ["Line Name", "Total Cost", "Markup %", "Vendor PDF"]) {
  assert(modal.includes(label), `vendor Cabinet modal must expose ${label}`);
}
assert(modal.includes('accept="application/pdf,.pdf"'), "vendor Cabinet evidence upload must be PDF-only");
assert(domain.includes("calculateCustomVendorCabinetSellPrice"), "custom Cabinet pricing must use the shared markup calculator");
assert(domain.includes("createCustomVendorCabinetOrderLine"), "custom Cabinet domain must call the guarded order-line RPC");
assert(domain.includes("uploadCustomVendorCabinetDocument"), "custom Cabinet domain must register the private Order PDF");
assert(newOrder.includes("CustomVendorCabinetLineModal"), "New Order must expose the vendor Cabinet entry flow");
assert(newOrder.includes("Stock Cabinet"), "Cabinet source selection must preserve the Stock Cabinet route");
assert(newOrder.includes("Vendor Cabinet"), "Cabinet source selection must expose the Vendor Cabinet route");
assert(migration.includes("create_custom_vendor_cabinet_order_line"), "migration must define the guarded custom Cabinet line RPC");
assert(migration.includes("product_id is null"), "custom Cabinet lines must remain productless");
assert(migration.includes("manual_vendor_cabinet"), "custom Cabinet lines must carry a distinct pricing/cost source marker");
assert(!migration.includes("insert into public.products"), "custom Cabinet entry must never create Product rows");

console.log("PASS: custom vendor Cabinet order-line contract");