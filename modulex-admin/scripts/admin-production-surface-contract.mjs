import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath), constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const forbiddenDemoPages = [
  "src/app/(admin)/(ui-elements)/alerts/page.tsx",
  "src/app/(admin)/(ui-elements)/avatars/page.tsx",
  "src/app/(admin)/(ui-elements)/badge/page.tsx",
  "src/app/(admin)/(ui-elements)/buttons/page.tsx",
  "src/app/(admin)/(ui-elements)/images/page.tsx",
  "src/app/(admin)/(ui-elements)/modals/page.tsx",
  "src/app/(admin)/(ui-elements)/videos/page.tsx",
  "src/app/(admin)/(others-pages)/(chart)/bar-chart/page.tsx",
  "src/app/(admin)/(others-pages)/(chart)/line-chart/page.tsx",
  "src/app/(admin)/(others-pages)/(forms)/form-elements/page.tsx",
  "src/app/(admin)/(others-pages)/(tables)/basic-tables/page.tsx",
  "src/app/(admin)/(others-pages)/blank/page.tsx",
  "src/app/(admin)/(others-pages)/calendar/page.tsx",
  "src/app/(admin)/api-test/page.tsx",
];

for (const relativePath of forbiddenDemoPages) {
  assert.equal(
    await exists(relativePath),
    false,
    `Production Admin must not expose TailAdmin/demo route file: ${relativePath}`,
  );
}

const sidebar = await readFile(path.join(root, "src/layout/AppSidebar.tsx"), "utf8");
assert.doesNotMatch(sidebar, /name:\s*"API Test"|path:\s*"\/api-test"/, "Production navigation must not expose API Test");

const dashboard = await readFile(
  path.join(root, "src/components/dashboard/ModulexDashboard.tsx"),
  "utf8",
);
assert.match(
  dashboard,
  /supabase\.rpc\("get_dashboard_kpis"\)/,
  "Dashboard KPIs must come from the production dashboard RPC instead of sample values",
);
assert.match(
  dashboard,
  /supabase\.rpc\("get_recent_inventory_movements"/,
  "Recent dashboard movements must come from the production inventory RPC",
);
assert.match(
  dashboard,
  /getCurrentProfile/,
  "Dashboard Quick Actions must resolve the active Admin profile before exposing role-sensitive links",
);
assert.match(
  dashboard,
  /canAccessPath/,
  "Dashboard Quick Actions must reuse direct-route authorization truth",
);
assert.match(
  dashboard,
  /quickActions\.filter\([^)]*canAccessPath/s,
  "Dashboard Quick Actions must be filtered by direct-route authorization",
);

const profilePage = await readFile(
  path.join(root, "src/app/(admin)/(others-pages)/profile/page.tsx"),
  "utf8",
);
assert.match(profilePage, /CorporateProfile/, "The intentional Modulex profile surface must remain available");

console.log("admin production surface contract: ok");
