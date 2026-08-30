import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/personnel/page.tsx", "/personnel", "personnel.view"],
  ["src/app/(admin)/personnel/employees/page.tsx", "/personnel/employees", "personnel.view"],
  ["src/app/(admin)/personnel/attendance/page.tsx", "/personnel/attendance", "personnel.view"],
  ["src/app/(admin)/personnel/leave/page.tsx", "/personnel/leave", "personnel.view"],
  ["src/app/(admin)/personnel/compensation/page.tsx", "/personnel/compensation", "personnel.view"],
  ["src/app/(admin)/personnel/payroll/page.tsx", "/personnel/payroll", "personnel.view"],
  ["src/app/(admin)/personnel/benefits/page.tsx", "/personnel/benefits", "personnel.view"],
  ["src/app/(admin)/personnel/documents/page.tsx", "/personnel/documents", "personnel.view"],
  ["src/app/(admin)/personnel/compliance/page.tsx", "/personnel/compliance", "personnel.view"],
  ["src/app/(admin)/personnel/lifecycle/page.tsx", "/personnel/lifecycle", "personnel.view"],
  ["src/app/(admin)/personnel/performance/page.tsx", "/personnel/performance", "personnel.view"],
  ["src/app/(admin)/personnel/reports/page.tsx", "/personnel/reports", "personnel.view"],
  ["src/app/(admin)/personnel/departments/page.tsx", "/personnel/departments", "personnel.manage"],
  ["src/app/(admin)/personnel/positions/page.tsx", "/personnel/positions", "personnel.manage"],
];
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [file, route, permission] of routes) {
  expect(fs.existsSync(path.join(root, file)), `Missing Personnel route: ${file}`);
  expect(sidebar.includes(`path: "${route}", permission: "${permission}"`), `${route} must remain gated by ${permission}`);
}
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const sources = [...collect("src/components/hr"), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "Personnel surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "Personnel surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=|<label\b/.test(sources), "Personnel surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "Personnel surfaces need loading and error states");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin") && !/lorem ipsum/i.test(sources), "Personnel surfaces must not ship dead/template UI");
console.log("personnel UI contract: ok");
