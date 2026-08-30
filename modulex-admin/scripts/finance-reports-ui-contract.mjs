import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/customers/invoices/page.tsx", "/customers/invoices"],
  ["src/app/(admin)/finance/payroll/page.tsx", "/finance/payroll"],
  ["src/app/(admin)/finance/compensation/page.tsx", "/finance/compensation"],
  ["src/app/(admin)/approvals/page.tsx", "/approvals"],
  ["src/app/(admin)/pricing/cost-margin/page.tsx", "/pricing/cost-margin"],
  ["src/app/(admin)/settings/general/tax-rules/page.tsx", "/settings/general/tax-rules"],
  ["src/app/(admin)/settings/payment-methods/page.tsx", "/settings/payment-methods"],
  ["src/app/(admin)/reports/inventory/page.tsx", "/reports/inventory"],
  ["src/app/(admin)/reports/movements/page.tsx", "/reports/movements"],
];
for (const [file] of routes) expect(fs.existsSync(path.join(root, file)), `Missing Finance/Reports route: ${file}`);
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [, route] of routes) expect(sidebar.includes(`path: "${route}"`), `Sidebar missing ${route}`);
const routeSources = routes.map(([file]) => read(file)).join("\n");
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const supporting = ["src/components/approvals", "src/components/reports"].flatMap(collect).join("\n");
const sources = `${routeSources}\n${supporting}`;
expect(sources.includes("dark:"), "Finance/Reports surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "Finance/Reports surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=/.test(sources), "Finance/Reports surfaces need accessible labels/state");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin"), "Finance/Reports routes must not ship dead/template UI");
expect(/finance|pricing|invoice|approval|reports/.test(sidebar.toLowerCase()), "Finance/Reports navigation must stay permission-scoped");
console.log("finance + reports UI contract: ok");
