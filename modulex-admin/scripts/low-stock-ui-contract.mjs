import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manager = read("src/components/inventory/LowStockManager.tsx");
const tracker = read("AdminUICheck.md");

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
expect(
  manager.includes('id="low-stock-search"') && manager.includes('htmlFor="low-stock-search"'),
  "Low Stock search needs an explicit accessible label"
);
expect(
  manager.includes('id="low-stock-view"') && manager.includes('htmlFor="low-stock-view"'),
  "Low Stock view filter needs an explicit accessible label"
);
expect(
  manager.includes('id="low-stock-page-size"') && manager.includes('htmlFor="low-stock-page-size"'),
  "Low Stock page-size control needs an explicit accessible label"
);
expect(
  manager.includes("focus-visible:ring-2"),
  "Low Stock interactive controls need visible keyboard focus states"
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
  tracker.includes("### [x] 03 — Product List (`/products`)") &&
    tracker.includes("### [x] 04 — Low Stock (`/low-stock`)") &&
    tracker.includes("PR: #151") &&
    tracker.includes("PR: #153") &&
    tracker.includes("Follow-up PR: #154"),
  "AdminUICheck.md must retain Product List and Low Stock as completed audit history"
);

console.log("low stock UI contract: ok");
