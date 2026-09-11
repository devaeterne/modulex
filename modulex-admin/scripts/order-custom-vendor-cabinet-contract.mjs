import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const modalPath = path.join(root, "src/components/customers/CustomVendorCabinetLineModal.tsx");
const domainPath = path.join(root, "src/lib/customers/custom-vendor-cabinet.ts");
const newOrderPath = path.join(root, "src/components/customers/NewCustomerOrder.tsx");
const editOrderPath = path.join(root, "src/components/customers/EditCustomerOrder.tsx");
const sidebarPath = path.join(root, "src/layout/AppSidebar.tsx");
const vendorPagePath = path.join(root, "src/app/(admin)/finance/vendors/page.tsx");
const migrationPath = path.join(root, "../modulex-store/supabase/migrations/20260911194500_custom_vendor_cabinet_order_lines.sql");
const editMigrationPath = path.join(root, "../modulex-store/supabase/migrations/20260911214500_vendor_cabinet_edit_order_support.sql");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(fs.existsSync(modalPath), "Custom vendor Cabinet entry must provide a dedicated modal");
assert(fs.existsSync(domainPath), "Custom vendor Cabinet entry must use a shared domain helper");
assert(fs.existsSync(migrationPath), "Custom vendor Cabinet lines must ship with the canonical Supabase migration");
assert(fs.existsSync(editMigrationPath), "Edit Order Vendor Cabinet support must ship with a canonical Supabase migration");
assert(fs.existsSync(vendorPagePath), "Canonical Vendor Management route must exist");

const modal = fs.readFileSync(modalPath, "utf8");
const domain = fs.readFileSync(domainPath, "utf8");
const newOrder = fs.readFileSync(newOrderPath, "utf8");
const editOrder = fs.readFileSync(editOrderPath, "utf8");
const sidebar = fs.readFileSync(sidebarPath, "utf8");
const vendorPage = fs.readFileSync(vendorPagePath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");
const editMigration = fs.readFileSync(editMigrationPath, "utf8");

for (const label of ["Line Name", "Total Cost", "Markup %", "Vendor PDF"]) {
  assert(modal.includes(label), `vendor Cabinet modal must expose ${label}`);
}
assert(modal.includes('accept="application/pdf,.pdf"'), "vendor Cabinet evidence upload must be PDF-only");
assert(modal.includes("Manage Vendors"), "vendor Cabinet modal must link operators to canonical Vendor Management");
assert(domain.includes("calculateCustomVendorCabinetSellPrice"), "custom Cabinet pricing must use the shared markup calculator");
assert(domain.includes("createCustomVendorCabinetOrderLine"), "custom Cabinet domain must call the guarded order-line RPC");
assert(domain.includes("uploadCustomVendorCabinetDocument"), "custom Cabinet domain must register the private Order PDF");
assert(domain.includes("get_active_order_vendors"), "Order vendor lookup must use a narrow Order-authorized RPC instead of Finance vendor detail access");

assert(newOrder.includes("CustomVendorCabinetLineModal"), "New Order must expose the vendor Cabinet entry flow");
assert(newOrder.includes("isCabinetSourceModalOpen"), "New Order Cabinet entry must keep an explicit source-choice state");
assert(newOrder.includes("Choose Cabinet Source"), "New Order Cabinet entry must show a source chooser before opening either flow");
assert(newOrder.includes('onClick={() => setIsCabinetSourceModalOpen(true)}>Cabinet</Button>'), "New Order Products action must expose one Cabinet entry point");
assert(newOrder.includes("setIsCabinetSourceModalOpen(false); setIsProductPickerOpen(true);"), "New Order Stock choice must close the source chooser before opening the product picker");
assert(newOrder.includes("setIsCabinetSourceModalOpen(false); setIsVendorCabinetModalOpen(true);"), "New Order Vendor choice must close the source chooser before opening the vendor flow");

assert(editOrder.includes("CustomVendorCabinetLineModal"), "Edit Order must expose the vendor Cabinet entry flow");
assert(editOrder.includes('type OrderLinePricingModel = OrderPricingModel | "manual_vendor_cabinet"'), "Edit Order must model saved productless Vendor Cabinet lines without widening unrelated product pricing types");
assert(editOrder.includes("isCabinetSourceModalOpen"), "Edit Order Cabinet entry must keep an explicit source-choice state");
assert(editOrder.includes("Choose Cabinet Source"), "Edit Order Cabinet entry must show a source chooser before opening either flow");
assert(editOrder.includes('onClick={() => setIsCabinetSourceModalOpen(true)}>Cabinet</Button>'), "Edit Order Products action must route Cabinet through the source chooser");
assert(!editOrder.includes('onClick={() => setIsProductPickerOpen(true)}>Cabinet</Button>'), "Edit Order Cabinet must never bypass the source chooser into stock products");
assert(editOrder.includes("uploadCustomVendorCabinetDocument"), "Edit Order Vendor Cabinet must upload its private source PDF");
assert(editOrder.includes("createCustomVendorCabinetOrderLine"), "Edit Order Vendor Cabinet must create the guarded productless order line");
assert(editOrder.includes('model === "manual_vendor_cabinet"'), "Edit Order must preserve/render productless Vendor Cabinet lines");
assert(editOrder.includes("Saved package · dedicated Vendor Cabinet workflow"), "Edit Order must present existing Vendor Cabinet packages as read-only generic revision lines");

assert(sidebar.includes('name: "Vendor Management", path: "/finance/vendors"'), "Vendor Management must be directly discoverable in the sidebar");
assert(vendorPage.includes("FinanceVendorsManager"), "Vendor Management must use the canonical vendor master, not a duplicate vendor list");

assert(migration.includes("create_custom_vendor_cabinet_order_line"), "migration must define the guarded custom Cabinet line RPC");
assert(migration.includes("product_id is null"), "custom Cabinet lines must remain productless");
assert(migration.includes("manual_vendor_cabinet"), "custom Cabinet lines must carry a distinct pricing/cost source marker");
assert(!migration.includes("insert into public.products"), "custom Cabinet entry must never create Product rows");
assert(editMigration.includes("get_active_order_vendors"), "Edit support migration must expose the narrow active-vendor lookup");
assert(editMigration.includes("manual_vendor_cabinet"), "Edit support migration must preserve manual Vendor Cabinet lines during generic revisions");
assert(editMigration.includes("dedicated Vendor Cabinet workflow"), "Generic Order revision must reject mutation/removal of existing Vendor Cabinet lines");
assert(editMigration.includes("customer_order_items_preserve_manual_vendor_cabinet"), "Edit support migration must install the Vendor Cabinet preservation guard");
assert(editMigration.includes("customer_order_items_shift_manual_vendor_cabinet_collision"), "Edit support migration must protect line-number collisions during generic revisions");

console.log("PASS: custom vendor Cabinet order-line contract");
