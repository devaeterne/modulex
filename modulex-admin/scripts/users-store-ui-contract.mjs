import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/users/page.tsx", "/users"],
  ["src/app/(admin)/roles/page.tsx", "/roles"],
  ["src/app/(admin)/store/content/page.tsx", "/store/content"],
  ["src/app/(admin)/store/company/page.tsx", "/store/company"],
  ["src/app/(admin)/store/pages/page.tsx", "/store/pages"],
  ["src/app/(admin)/store/projects/page.tsx", "/store/projects"],
  ["src/app/(admin)/store/media/page.tsx", "/store/media"],
  ["src/app/(admin)/store/marketing/page.tsx", "/store/marketing"],
  ["src/app/(admin)/store/products/page.tsx", "/store/products"],
  ["src/app/(admin)/store/colors/page.tsx", "/store/colors"],
  ["src/app/(admin)/store/leads/page.tsx", "/store/leads"],
];
for (const [file] of routes) expect(fs.existsSync(path.join(root, file)), `Missing Users/Store route: ${file}`);
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [, route] of routes) expect(sidebar.includes(`path: "${route}"`), `Sidebar missing ${route}`);
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const sources = [...collect("src/components/users"), ...collect("src/components/store"), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "Users/Store surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "Users/Store surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=/.test(sources), "Users/Store surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "Users/Store surfaces need loading and error states");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin"), "Users/Store surfaces must not ship dead/template UI");
expect(sidebar.includes('permission: "store.manage"'), "Store routes must remain store.manage-gated");
expect(/users\.(view|manage)|roles\.(view|manage)/.test(sidebar), "Users/Roles routes must remain permission-gated");
console.log("users + store UI contract: ok");
