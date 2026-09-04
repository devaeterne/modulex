import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const leaveManager = await readFile(
  path.join(root, "src/components/hr/LeaveManager.tsx"),
  "utf8",
);

assert.match(
  leaveManager,
  /const \[balanceYear, setBalanceYear\] = useState\(currentYear\)/,
  "Leave balances must expose a selectable balance year instead of being fixed to the runtime year",
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
  /Leave settings/,
  "Leave type administration must be moved behind a lower-priority settings action",
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
  /Showing \{pageStart \+ 1\}-\{Math\.min\(pageStart \+ BALANCE_PAGE_SIZE, filteredBalanceRows\.length\)\}/,
  "Pagination must communicate the visible employee range",
);

console.log("leave UI contract: ok");
