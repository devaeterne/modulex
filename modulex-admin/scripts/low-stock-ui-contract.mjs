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
  manager.includes("focus-visible:ring-2"),
  "Low Stock interactive controls need visible keyboard focus states"
);
expect(
  manager.includes("min-w-[1120px]"),
  "Low Stock table needs an explicit responsive minimum width"
);
expect(
  manager.includes("const PAGE_SIZE = 25") &&
    manager.includes('rpc("search_low_stock_page"') &&
    manager.includes("p_offset: nextOffset") &&
    manager.includes("p_limit: PAGE_SIZE") &&
    manager.includes("total_count"),
  "Low Stock must use deterministic server-side pagination"
);
expect(
  !manager.includes("const paginatedRows = useMemo") && !manager.includes('id="low-stock-page-size"'),
  "Low Stock must not retain the previous client-side page slicing/page-size control"
);
expect(
  manager.includes('aria-label="Low stock pagination"') &&
    manager.includes('<span aria-live="polite">Page {currentPage} of {totalPages}</span>'),
  "Low Stock server pagination needs an accessible current-page announcement"
);
expect(
  manager.includes("Showing {firstVisible}–{lastVisible} of {totalCount}"),
  "Low Stock needs a server-filtered result summary"
);
expect(
  manager.includes('aria-live="polite"'),
  "Low Stock must announce dynamic results/status feedback"
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
  manager.includes("0 means unset") && manager.includes("Out of Stock is independent of thresholds"),
  "Low Stock UI must explain A2.4 threshold and out-of-stock semantics"
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
