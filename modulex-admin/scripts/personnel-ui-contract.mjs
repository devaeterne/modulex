import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const slugs = ["", "employees", "attendance", "leave", "compensation", "payroll", "benefits", "documents", "compliance", "lifecycle", "performance", "reports", "departments", "positions"];
const routes = slugs.map((slug) => [`src/app/(admin)/personnel${slug ? `/${slug}` : ""}/page.tsx`, `/personnel${slug ? `/${slug}` : ""}`]);
for (const [file] of routes) expect(fs.existsSync(path.join(root, file)), `Missing Personnel route: ${file}`);
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [, route] of routes) expect(sidebar.includes(`path: "${route}"`), `Sidebar missing ${route}`);
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const sources = [...collect("src/components/hr"), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "Personnel surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "Personnel surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=/.test(sources), "Personnel surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "Personnel surfaces need loading and error states");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin") && !/lorem ipsum/i.test(sources), "Personnel surfaces must not ship dead/template UI");
expect(/personnel\.(view|manage)|hr\.(view|manage)/i.test(sidebar), "Personnel navigation must remain permission-gated");
console.log("personnel UI contract: ok");
