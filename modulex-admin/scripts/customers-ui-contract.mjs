import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/customers/dashboard/page.tsx", "/customers/dashboard"],
  ["src/app/(admin)/customers/page.tsx", "/customers"],
  ["src/app/(admin)/customers/orders/page.tsx", "/customers/orders"],
  ["src/app/(admin)/customers/shipments/page.tsx", "/customers/shipments"],
  ["src/app/(admin)/customers/installations/page.tsx", "/customers/installations"],
];
for (const [file] of routes) expect(fs.existsSync(path.join(root, file)), `Missing Customers route: ${file}`);
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [, route] of routes) expect(sidebar.includes(`path: "${route}"`), `Sidebar missing ${route}`);
function collect(dir) {
  const full = path.join(root, dir);
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const sources = [...collect("src/components/customers"), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "Customers surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "Customers surfaces must include responsive behavior");
expect(/aria-|htmlFor=|role=/.test(sources), "Customers surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "Customers surfaces need loading and error states");
expect(!sources.includes('href="#"') && !sources.includes("TailAdmin") && !/lorem ipsum/i.test(sources), "Customers surfaces must not ship placeholder/template UI");
expect(/orders\.view|customers\.view|shipments\.view|installations\.view/.test(sidebar), "Customers sidebar entries must remain permission-gated");

const directory = read("src/components/customers/CustomersTable.tsx");
expect(directory.includes('<TableHeader variant="admin">'), "Customer directory header must use the canonical admin table theme");
expect(directory.includes('<TableBody variant="admin">'), "Customer directory body must use the canonical admin table theme");
const tableStart = directory.indexOf("<TableHeader");
const tableEnd = directory.indexOf("</Table>", tableStart);
const tableMarkup = directory.slice(tableStart, tableEnd);
const tableCellTags = [...tableMarkup.matchAll(/<TableCell\b[^>]*>/g)].map((match) => match[0]);
expect(tableCellTags.length > 0 && tableCellTags.every((tag) => tag.includes('variant="admin"')), "Every customer directory table cell must use the admin variant so dark-mode text remains readable");
expect(directory.includes('grid grid-cols-2 gap-3 md:grid-cols-4'), "Customer summary metrics must collapse into one row from tablet widths upward");
expect(!directory.includes('<div className="p-5 sm:p-6">'), "Customer directory must not add a second padded shell inside ComponentCard");
expect(directory.includes('className="w-full sm:w-36"'), "Customer pagination page-size control must stay compact on desktop");

const customerPage = read("src/app/(admin)/customers/page.tsx");
expect(customerPage.includes('ADMIN_TEXT_STYLES'), "Customer directory route must use shared admin text tokens for light/dark contrast");
expect(customerPage.includes('className={ADMIN_TEXT_STYLES.body}'), "Customer directory content must inherit the shared body text token so standalone summary and pagination text stays readable in dark mode");

console.log("customers UI contract: ok");