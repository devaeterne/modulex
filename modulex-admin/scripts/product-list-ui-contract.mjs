import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const table = read("src/components/products/ProductsTable.tsx");
const tracker = read("AdminUICheck.md");

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
expect(
  table.includes('id="product-status-filter"') &&
    table.includes('htmlFor="product-status-filter"'),
  "Product status filter needs an explicit accessible label"
);
expect(
  table.includes('id="product-brand-filter"') &&
    table.includes('htmlFor="product-brand-filter"'),
  "Product brand filter needs an explicit accessible label"
);
expect(
  table.includes('id="product-category-filter"') &&
    table.includes('htmlFor="product-category-filter"'),
  "Product category filter needs an explicit accessible label"
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
expect(
  table.includes("min-w-[1080px]"),
  "Product table needs an explicit responsive minimum width"
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
    tracker.includes("### [ ] 03 — Product List"),
  "AdminUICheck.md must preserve completed 01/02 history and current 03 tracking"
);

console.log("product list UI contract: ok");
