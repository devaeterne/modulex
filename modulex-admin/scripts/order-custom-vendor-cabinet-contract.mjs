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
const replaceMigrationPath = path.join(root, "../modulex-store/supabase/migrations/20260911223000_vendor_cabinet_edit_replace.sql");
const payablesMigrationPath = path.join(root, "../modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql");

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
assert(fs.existsSync(replaceMigrationPath), "Saved Vendor Cabinet editing/PDF replacement must ship with a canonical Supabase migration");
assert(fs.existsSync(payablesMigrationPath), "Vendor Cabinet financial identity must be guarded by the Vendor Payables migration");
assert(fs.existsSync(vendorPagePath), "Canonical Vendor Management route must exist");

const modal = fs.readFileSync(modalPath, "utf8");
const domain = fs.readFileSync(domainPath, "utf8");
const newOrder = fs.readFileSync(newOrderPath, "utf8");
const editOrder = fs.readFileSync(editOrderPath, "utf8");
const sidebar = fs.readFileSync(sidebarPath, "utf8");
const vendorPage = fs.readFileSync(vendorPagePath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");
const editMigration = fs.readFileSync(editMigrationPath, "utf8");
const replaceMigration = fs.readFileSync(replaceMigrationPath, "utf8");
const payablesMigration = fs.readFileSync(payablesMigrationPath, "utf8");

for (const label of ["Line Name", "Total Cost", "Markup %", "Vendor PDF"]) {
  assert(modal.includes(label), `vendor Cabinet modal must expose ${label}`);
}
assert(modal.includes('accept="application/pdf,.pdf"'), "vendor Cabinet evidence upload must be PDF-only");
assert(modal.includes("Manage Vendors"), "vendor Cabinet modal must link operators to canonical Vendor Management");
assert(modal.includes("Replace PDF"), "Vendor Cabinet edit mode must expose optional PDF replacement");
assert(modal.includes("Current PDF"), "Vendor Cabinet edit mode must identify the currently attached PDF");
assert(domain.includes("calculateCustomVendorCabinetSellPrice"), "custom Cabinet pricing must use the shared markup calculator");
assert(domain.includes("createCustomVendorCabinetOrderLine"), "custom Cabinet domain must call the guarded order-line RPC");
assert(domain.includes("updateCustomVendorCabinetOrderLine"), "saved Vendor Cabinet edits must call a dedicated guarded update RPC");
assert(domain.includes("getCustomVendorCabinetDocument"), "saved Vendor Cabinet editing must resolve the active source document explicitly");
assert(domain.includes("getCustomVendorCabinetDocumentUrl"), "View PDF must use a private signed document URL");
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
assert(editOrder.includes("updateCustomVendorCabinetOrderLine"), "Edit Order must use the dedicated saved Vendor Cabinet update workflow");
assert(editOrder.includes("getCustomVendorCabinetDocumentUrl"), "Edit Order must allow operators to view the current private Vendor Cabinet PDF");
assert(editOrder.includes('model === "manual_vendor_cabinet"'), "Edit Order must preserve/render productless Vendor Cabinet lines");
assert(editOrder.includes("Edit Vendor Cabinet"), "Saved Vendor Cabinet rows must expose a dedicated Edit action");
assert(editOrder.includes("View PDF"), "Saved Vendor Cabinet rows must expose a private View PDF action");
assert(!/isVendorCabinet[\s\S]{0,900}setItems\(\(current\) => current\.filter/.test(editOrder), "Vendor Cabinet rows must not use the generic in-memory Remove action");

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
assert(replaceMigration.includes("update_custom_vendor_cabinet_order_line"), "Vendor Cabinet edit migration must expose a dedicated update RPC");
assert(replaceMigration.includes("source_document_id"), "Vendor Cabinet edit migration must atomically replace the source document reference");
assert(replaceMigration.includes("manual_vendor_cabinet"), "Vendor Cabinet edit migration must scope mutation to productless manual Vendor Cabinet lines");
assert(!replaceMigration.includes("insert into public.products"), "Vendor Cabinet editing must never create Product rows");
assert(payablesMigration.includes("vendor_invoice_order_allocations"), "Vendor Payables must persist Bill-to-Vendor-Cabinet attribution separately");
assert(payablesMigration.includes("Vendor Cabinet financial identity is locked after Vendor Bill attribution"), "Vendor Cabinet vendor/cost identity must become immutable after Finance attribution");
assert(payablesMigration.includes("Vendor Cabinet line has Finance attribution and cannot be deleted"), "Attributed Vendor Cabinet lines must not be deletable");

console.log("PASS: custom vendor Cabinet order-line contract");
