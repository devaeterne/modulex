import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const [leaveManager, leavePage] = await Promise.all([
  readFile(path.join(root, "src/components/hr/LeaveManager.tsx"), "utf8"),
  readFile(path.join(root, "src/app/(admin)/personnel/leave/page.tsx"), "utf8"),
]);

assert.match(
  leavePage,
  /PageBreadCrumb/,
  "Leave route must use the shared Admin page-heading convention",
);
assert.match(
  leaveManager,
  /ComponentCard/,
  "Leave workspace surfaces must use the shared ComponentCard primitive",
);
assert.match(
  leaveManager,
  /StatTile/,
  "Leave KPI summaries must use the shared compact StatTile primitive",
);
assert.match(
  leaveManager,
  /Button/,
  "Leave actions must use the shared Button primitive",
);
assert.match(
  leaveManager,
  /Input/,
  "Leave inputs must use the shared Input primitive",
);
assert.match(
  leaveManager,
  /Select/,
  "Leave selects must use the shared Select primitive",
);
assert.match(
  leaveManager,
  /TextArea/,
  "Leave notes must use the shared TextArea primitive",
);
assert.match(
  leaveManager,
  /Label/,
  "Leave form fields must use the shared Label primitive",
);
assert.match(
  leaveManager,
  /TableViewport[\s\S]*TableHeader[\s\S]*TableBody[\s\S]*TableRow[\s\S]*TableCell/,
  "Leave data grids must compose the shared table primitives",
);
assert.match(
  leaveManager,
  /Alert/,
  "Leave feedback must use the shared Alert primitive",
);
assert.doesNotMatch(
  leaveManager,
  /<(?:button|input|select|textarea|label|table|thead|tbody|tr|th|td)\b/,
  "Leave feature UI must not recreate native controls or table primitives",
);

assert.match(
  leaveManager,
  /const \[requestOpen, setRequestOpen\] = useState\(false\)/,
  "New leave request must be opened on demand instead of occupying permanent page space",
);
assert.match(
  leaveManager,
  /New Leave Request/,
  "Leave workspace must expose a clear primary request action",
);
assert.match(
  leaveManager,
  /<Modal[\s\S]*New Leave Request/,
  "New leave request form must render in the shared Modal surface",
);
assert.match(
  leaveManager,
  /setRequestOpen\(false\)/,
  "Successful leave requests must close the request modal",
);
assert.doesNotMatch(
  leaveManager,
  /xl:grid-cols-\[380px_minmax\(0,1fr\)\]/,
  "Leave workspace must not retain the old permanent two-column request form layout",
);

assert.match(
  leaveManager,
  /const \[balanceYear, setBalanceYear\] = useState\(currentYear\)/,
  "Leave balances must expose a selectable balance year",
);
assert.match(
  leaveManager,
  /const \[balanceSearch, setBalanceSearch\] = useState\(""\)/,
  "Leave balances must expose employee search",
);
assert.match(
  leaveManager,
  /const BALANCE_PAGE_SIZE = \d+;/,
  "Leave balances must paginate compact employee rows",
);
assert.match(
  leaveManager,
  /const balanceRows = useMemo\(/,
  "Flat leave balance records must be grouped into employee rows before rendering",
);
assert.match(
  leaveManager,
  /PRIMARY_LEAVE_CODES/,
  "The compact table must promote primary PTO, sick and unpaid leave columns",
);
assert.match(
  leaveManager,
  /expandedEmployeeId/,
  "Employee rows must support expandable balance details",
);
assert.match(
  leaveManager,
  /usedHours > 0/,
  "Zero used-hours labels must be suppressed to reduce repetitive balance noise",
);
assert.match(
  leaveManager,
  /Leave settings/,
  "Leave type administration must remain behind a lower-priority settings action",
);
assert.match(
  leaveManager,
  /<Modal[\s\S]*Leave types/,
  "Leave type administration must render in the shared modal surface",
);
assert.match(
  leaveManager,
  /initializeBalances\(balanceYear\)/,
  "Balance initialization must target the selected year",
);
assert.doesNotMatch(
  leaveManager,
  /\{balances\.map\(b=>/,
  "The balances table must not render one visible row per raw balance record",
);
assert.match(
  leaveManager,
  /Showing \{pageStart \+ 1\}-\s*\{Math\.min\(pageStart \+ BALANCE_PAGE_SIZE, filteredBalanceRows\.length\)\}/,
  "Pagination must communicate the visible employee range",
);

console.log("leave UI contract: ok");
