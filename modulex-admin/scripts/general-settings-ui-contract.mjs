import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/settings/general/page.tsx", "/settings/general"],
  ["src/app/(admin)/settings/general/company/page.tsx", "/settings/general/company"],
  ["src/app/(admin)/settings/general/localization/page.tsx", "/settings/general/localization"],
  ["src/app/(admin)/settings/general/documents/page.tsx", "/settings/general/documents"],
  ["src/app/(admin)/settings/general/email/page.tsx", "/settings/general/email"],
  ["src/app/(admin)/settings/general/notifications/page.tsx", "/settings/general/notifications"],
  ["src/app/(admin)/settings/general/email-notifications/page.tsx", "/settings/general/email-notifications"],
];
for (const [file] of routes) expect(fs.existsSync(path.join(root, file)), `Missing General Settings route: ${file}`);
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [, route] of routes) expect(sidebar.includes(`path: "${route}"`), `Sidebar missing ${route}`);
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const sources = [...collect("src/components/settings"), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "General Settings surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "General Settings surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=/.test(sources), "General Settings surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "General Settings surfaces need loading and error states");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin"), "General Settings must not ship dead/template UI");
expect(/settings\.(view|manage)|system\.(view|manage)/i.test(sidebar), "Settings navigation must remain permission-gated");
console.log("general settings UI contract: ok");
