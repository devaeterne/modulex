import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/settings/general/page.tsx", "/settings/general", "settings.view"],
  ["src/app/(admin)/settings/general/company/page.tsx", "/settings/general/company", "settings.view"],
  ["src/app/(admin)/settings/general/localization/page.tsx", "/settings/general/localization", "settings.view"],
  ["src/app/(admin)/settings/general/documents/page.tsx", "/settings/general/documents", "settings.view"],
  ["src/app/(admin)/settings/general/email/page.tsx", "/settings/general/email", "settings.view"],
  ["src/app/(admin)/settings/general/notifications/page.tsx", "/settings/general/notifications", "settings.view"],
  ["src/app/(admin)/settings/general/email-notifications/page.tsx", "/settings/general/email-notifications", "settings.view"],
];
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [file, route, permission] of routes) {
  expect(fs.existsSync(path.join(root, file)), `Missing General Settings route: ${file}`);
  expect(sidebar.includes(`path: "${route}", permission: "${permission}"`), `${route} must remain gated by ${permission}`);
}
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const overview = read("src/components/settings/GeneralSettingsOverview.tsx");
expect(overview.includes("ComponentCard"), "General Settings overview must use the shared ComponentCard for its page-intro surface");
expect(!overview.includes("<section"), "General Settings overview must not reimplement the shared page-intro card surface");
expect(overview.includes('<nav aria-label="General settings sections"'), "General Settings section links must remain an explicit navigation landmark");
const sources = [...collect("src/components/settings"), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "General Settings surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "General Settings surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=|<label\b/.test(sources), "General Settings surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "General Settings surfaces need loading and error states");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin"), "General Settings must not ship dead/template UI");
console.log("general settings UI contract: ok");
