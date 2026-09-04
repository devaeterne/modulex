import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const table = read("src/components/products/ProductsTable.tsx");
const select = read("src/components/form/Select.tsx");
const dropdown = read("src/components/ui/dropdown/Dropdown.tsx");
const tracker = read("AdminUICheck.md");

for (const sharedComponent of [
  "ComponentCard",
  "InputField",
  "Label",
  "Select",
  "Button",
  "Badge",
  "Alert",
  "Modal",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(
    table.includes(sharedComponent),
    `Product List must compose the shared TailAdmin ${sharedComponent} component`
  );
}

expect(
  !/<(?:button|input|select|table)\b/.test(table),
  "Product List must not reimplement shared TailAdmin button, form, or table primitives"
);
expect(
  /id\?:\s*string/.test(select) && /allowEmpty\?:\s*boolean/.test(select),
  "Shared Select must support accessible ids and selectable empty filter options"
);
expect(
  select.includes('className="relative w-full"') &&
    select.includes('aria-hidden="true"') &&
    select.includes('pointer-events-none absolute right-3 top-1/2'),
  "Shared Select must restore a full-width non-interactive dropdown chevron when appearance-none is used"
);
expect(
  select.includes('"text-gray-400 dark:text-white/30"') &&
    select.includes('className="bg-white text-gray-800 dark:bg-gray-900 dark:text-white/90"'),
  "Shared Select placeholder and option text must follow the Admin light/dark field contrast contract"
);
expect(
  !select.includes("data-placeholder"),
  "Shared Select placeholder color must be driven deterministically by its effective value"
);

expect(
  table.includes('hasPermission(profile?.roles, "products.manage")'),
  "Product List must gate management actions with products.manage"
);
expect(
  table.includes("getCurrentProfile"),
  "Product List must resolve the current profile before exposing management affordances"
);
expect(
  !table.includes("setErrorMessage(error.message)"),
  "Product List must not expose raw Supabase errors"
);
expect(
  table.includes("console.error("),
  "Product List technical failures must remain logged"
);
expect(
  table.includes("new Intl.NumberFormat(undefined"),
  "Product List numbers must use the runtime locale"
);
expect(
  !table.includes("handleClearSearch"),
  "Unused Product List search-clear handler must be removed"
);
expect(
  !table.includes("onDoubleClick"),
  "Product List must not depend on mouse-only double-click editing"
);
expect(
  table.includes('id="product-search"') && table.includes('htmlFor="product-search"'),
  "Product search needs an explicit accessible label"
);
for (const filterId of [
  "product-status-filter",
  "product-brand-filter",
  "product-category-filter",
  "product-type-filter",
  "product-uom-filter",
  "product-qr-filter",
]) {
  expect(table.includes(`id: "${filterId}"`), `${filterId} must remain in the filter contract`);
}
expect(
  table.includes("<Label htmlFor={field.id}") && table.includes("<Select id={field.id}"),
  "Product filters need explicit accessible labels"
);
expect(
  table.includes('id="product-sort-by"') && table.includes('htmlFor="product-sort-by"'),
  "Product sort control needs an explicit accessible label"
);
expect(
  table.includes('id="product-sort-direction"') &&
    table.includes('htmlFor="product-sort-direction"'),
  "Product sort direction needs an explicit accessible label"
);
expect(
  table.includes('id="product-page-size"') && table.includes('htmlFor="product-page-size"'),
  "Product page-size control needs an explicit accessible label"
);
expect(
  !table.includes("ADMIN_FOCUS_RING") && !table.includes("focus-visible:ring-"),
  "Product List feature UI must delegate focus-ring appearance to shared primitives"
);
expect(
  table.includes("<TableViewport>") &&
    /<Table variant="admin" minWidth="(?:wide|extraWide)">/.test(table),
  "Product table must use a shared responsive minimum-width preset"
);
expect(
  table.includes('className="flex flex-col gap-2 sm:flex-row"'),
  "Product search must stack safely on small screens"
);
expect(
  !table.includes("window.confirm"),
  "Product archive confirmation must use the themed in-app dialog"
);
expect(
  table.includes('role="dialog"') && table.includes("archiveTarget"),
  "Product archive confirmation dialog is missing"
);
expect(
  table.includes("archiveCancelRef") &&
    table.includes('.querySelector("button")?.focus()'),
  "Product archive confirmation must initially focus Cancel"
);
expect(
  table.includes('aria-current={currentPage === page ? "page" : undefined}'),
  "Product pagination must expose the current page"
);
expect(
  table.includes('aria-live="polite"'),
  "Product List must announce dynamic status/results feedback"
);

expect(
  table.includes('.from("store_product_content")') &&
    table.includes('.in("base_product_code"') &&
    table.includes('.from("store_product_media")') &&
    table.includes('.in("product_content_id"') &&
    table.includes('.eq("media_type", "image")'),
  "Product List thumbnails must batch-load canonical Store product media without per-row queries"
);
expect(
  table.includes("productImages") &&
    table.includes("previewImage") &&
    table.includes('aria-label={`View ${product.product_name} image`}') &&
    table.includes('ariaLabel="Product image preview"'),
  "Product List must render a clickable product thumbnail and an accessible lightbox preview"
);
expect(
  table.includes('onClick={() => router.push("/products/new")}'),
  "Add Product must use the shared Button primitive rather than route-owned link appearance"
);
expect(
  table.includes("ProductRowActions") &&
    table.includes('aria-label={`Actions for ${product.product_name}`}') &&
    table.includes("Edit") &&
    table.includes("Duplicate") &&
    table.includes("Archive"),
  "Product List row actions must be grouped behind a single accessible actions menu"
);
expect(
  dropdown.includes("createPortal") &&
    dropdown.includes("portal") &&
    dropdown.includes("anchorRef") &&
    dropdown.includes('position: "fixed"'),
  "Shared Dropdown must support a fixed portal mode so Product List actions are not clipped by the table viewport"
);

expect(
  tracker.includes("### [x] 01 — Dashboard + shared shell") &&
    tracker.includes("### [x] 02 — Request Center") &&
    tracker.includes("### [x] 03 — Product List (`/products`)") &&
    tracker.includes("PR: #151 — `fix(admin): harden Product List UI`"),
  "AdminUICheck.md must preserve completed Product List audit history"
);

console.log("product list UI contract: ok");