import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const table = read("src/components/products/ProductsTable.tsx");
const select = read("src/components/form/Select.tsx");
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
  !/<(?:input|select|table)\b/.test(table),
  "Product List must not reimplement shared TailAdmin form or table primitives"
);
expect(
  /id\?:\s*string/.test(select) && /allowEmpty\?:\s*boolean/.test(select),
  "Shared Select must support accessible ids and selectable empty filter options"
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
  table.includes("focus-visible:ring-2"),
  "Product List interactive controls need visible keyboard focus states"
);
const productTableClass = table.match(/<Table variant="admin" className="([^"]+)"/)?.[1] ?? "";
const productTableMinWidth = Number(productTableClass.match(/min-w-\[(\d+)px\]/)?.[1] ?? 0);
expect(
  table.includes("<TableViewport>") && productTableMinWidth >= 1080,
  "Product table needs full-width layout with an explicit responsive minimum width"
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
  tracker.includes("### [x] 01 — Dashboard + shared shell") &&
    tracker.includes("### [x] 02 — Request Center") &&
    tracker.includes("### [x] 03 — Product List (`/products`)") &&
    tracker.includes("PR: #151 — `fix(admin): harden Product List UI`"),
  "AdminUICheck.md must preserve completed Product List audit history"
);

console.log("product list UI contract: ok");
