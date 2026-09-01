import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manager = read("src/components/inventory/LowStockManager.tsx");
const tracker = read("AdminUICheck.md");

for (const primitive of [
  "ComponentCard",
  "Input",
  "Label",
  "Select",
  "Alert",
  "Badge",
  "Button",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(manager.includes(primitive), `Low Stock UI must compose shared ${primitive} primitives`);
}
expect(
  !/<(?:input|select|table|thead|tbody|tr|th|td|button)\b/.test(manager),
  "Low Stock UI must not reimplement shared form, button, or table primitives",
);
expect(manager.includes('<Table variant="admin"'), "Low Stock must use the shared admin table variant");
expect(manager.includes("<TableViewport"), "Low Stock must use the shared responsive table viewport");
expect(
  manager.includes('className="w-full min-w-[1120px]"'),
  "Low Stock table must fill the available card width while retaining its responsive minimum width",
);

expect(
  manager.includes('hasPermission(profile?.roles, "products.manage")'),
  "Low Stock threshold editing must use products.manage permission"
);
expect(
  !manager.includes('includes(profile?.role ?? "")'),
  "Low Stock must not hardcode admin role names for threshold editing"
);
expect(
  !manager.includes("setErrorMessage(error.message)"),
  "Low Stock must not expose raw Supabase errors"
);
expect(
  manager.includes("console.error("),
  "Low Stock technical failures must remain logged"
);
expect(
  manager.includes("new Intl.NumberFormat(undefined"),
  "Low Stock numbers must use the runtime locale"
);
for (const rpc of ["search_low_stock_page_v2", "get_low_stock_summary_v2", "search_low_stock_page"]) {
  expect(manager.includes(rpc), `Low Stock must preserve ${rpc}`);
}
expect(
  manager.includes('.update({ min_stock_level: nextValue })'),
  "Low Stock must preserve minimum threshold updates",
);
expect(
  manager.includes('id="low-stock-search"') && manager.includes('htmlFor="low-stock-search"'),
  "Low Stock search needs an explicit accessible label"
);
expect(
  manager.includes('id="low-stock-view"') && manager.includes('htmlFor="low-stock-view"'),
  "Low Stock view filter needs an explicit accessible label"
);
expect(
  manager.includes('id="low-stock-product-type"') && manager.includes('htmlFor="low-stock-product-type"'),
  "Low Stock product-type filter needs an explicit accessible label"
);
expect(
  manager.includes('id="low-stock-uom"') && manager.includes('htmlFor="low-stock-uom"'),
  "Low Stock UOM filter needs an explicit accessible label"
);
expect(
  manager.includes('id="low-stock-page-size"') && manager.includes('htmlFor="low-stock-page-size"'),
  "Low Stock page-size control needs an explicit accessible label"
);
expect(
  manager.includes("focus-visible:ring-2"),
  "Low Stock semantic navigation links need visible keyboard focus states"
);
expect(
  manager.includes("min-w-[1120px]"),
  "Low Stock table needs an explicit responsive minimum width"
);
expect(
  manager.includes("const [currentPage, setCurrentPage] = useState(1)"),
  "Low Stock needs explicit pagination state"
);
expect(
  manager.includes("const paginatedRows = useMemo"),
  "Low Stock must paginate filtered rows"
);
expect(
  manager.includes("if (currentPage > totalPages)"),
  "Low Stock pagination must clamp an out-of-range page after filtering"
);
expect(
  manager.includes('aria-current={currentPage === page ? "page" : undefined}'),
  "Low Stock pagination must expose the current page"
);
expect(
  manager.includes('aria-label="Low stock pagination"'),
  "Low Stock pagination needs an accessible navigation label"
);
expect(
  manager.includes('aria-live="polite"'),
  "Low Stock must announce dynamic results/status feedback"
);
expect(
  manager.includes("Showing {startRow}–{endRow} of {filteredRows.length}"),
  "Low Stock needs a filtered result summary"
);
expect(
  !manager.includes('type="checkbox"'),
  "Low Stock must not expose bulk selection until a supported batch mutation exists"
);
expect(
  manager.includes('type RetryAction =') &&
    manager.includes('setRetryAction({ type: "threshold", row })') &&
    manager.includes("void saveThreshold(retryAction.row)") &&
    manager.includes('retryAction.type === "load" ? "Retry" : "Retry update"'),
  "Low Stock must preserve the failed threshold draft and retry the mutation instead of refreshing it"
);
expect(
  manager.includes("do {") && manager.includes("while (true)"),
  "Low Stock complete export must preserve bounded paging",
);
expect(
  manager.includes('href={`/products/${row.product_id}`}'),
  "Low Stock must preserve product navigation",
);
expect(
  tracker.includes("### [x] 03 — Product List (`/products`)") &&
    tracker.includes("### [x] 04 — Low Stock (`/low-stock`)") &&
    tracker.includes("PR: #151") &&
    tracker.includes("PR: #153") &&
    tracker.includes("Follow-up PR: #154"),
  "AdminUICheck.md must retain Product List and Low Stock as completed audit history"
);

console.log("low stock UI contract: ok");
