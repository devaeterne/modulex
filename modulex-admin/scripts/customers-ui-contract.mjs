import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/customers/dashboard/page.tsx", "/customers/dashboard"],
  ["src/app/(admin)/customers/page.tsx", "/customers"],
  ["src/app/(admin)/customers/orders/page.tsx", "/customers/orders"],
  ["src/app/(admin)/customers/shipments/page.tsx", "/customers/shipments"],
  ["src/app/(admin)/customers/installations/page.tsx", "/customers/installations"],
];
for (const [file] of routes) expect(exists(file), `Missing Customers route: ${file}`);
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

const orders = read("src/components/customers/CustomerOrdersList.tsx");
expect(orders.includes('ADMIN_TEXT_STYLES'), "Customer Orders must use shared admin text tokens for light/dark contrast");
expect(orders.includes('ADMIN_TEXT_STYLES.body'), "Customer Orders content must inherit readable body text in dark mode");
expect(orders.includes('ADMIN_TEXT_STYLES.strong'), "Customer Orders summary values must use the shared strong text token");
expect(orders.includes('grid grid-cols-2 gap-3 md:grid-cols-4'), "Customer Orders summary metrics must collapse into one row from tablet widths upward");
expect(!orders.includes('title={selectedCustomer ? `${selectedCustomer.name} Orders` : "Customer Orders"}'), "Global Customer Orders summary must not be wrapped in a redundant outer card");
expect(orders.includes('<TableHeader variant="admin">') && orders.includes('<TableBody variant="admin">'), "Customer Orders table must retain the canonical admin table theme");
const ordersTableStart = orders.indexOf("<TableHeader");
const ordersTableEnd = orders.indexOf("</Table>", ordersTableStart);
const ordersTableMarkup = orders.slice(ordersTableStart, ordersTableEnd);
const orderTableCellTags = [...ordersTableMarkup.matchAll(/<TableCell\b[^>]*>/g)].map((match) => match[0]);
expect(orderTableCellTags.length > 0 && orderTableCellTags.every((tag) => tag.includes('variant="admin"')), "Every Customer Orders table cell must retain the admin variant");

// Customer → Project should be a first-class customer-scoped operation rather than a global detour.
const customerProjectsRoute = "src/app/(admin)/customers/[id]/projects/page.tsx";
expect(exists(customerProjectsRoute), "Customer detail must expose a real customer-scoped Projects route");
const operations = read("src/components/customers/CustomerOrderActions.tsx");
expect(operations.includes('/customers/${customerId}/projects'), "Customer operations must link directly to customer-scoped Projects");
const customerProjects = read("src/components/customers/CustomerProjectsList.tsx");
expect(customerProjects.includes("listCustomerProjects") && customerProjects.includes("customerId"), "Customer Projects must reuse the canonical Project list domain with customer scope");
expect(customerProjects.includes("createCustomerProject"), "Customer Projects must support Project creation without leaving customer context");
expect(customerProjects.includes('<TableHeader variant="admin">') && customerProjects.includes('<TableBody variant="admin">'), "Customer Projects must use the canonical admin table system");

// Private customer documents need one real lifecycle surface: explicit visibility, signed access, and soft deactivation.
const documents = read("src/components/customers/CustomerDocumentsPanel.tsx");
const documentSqlPath = "sql/customer-document-lifecycle.sql";
expect(exists(documentSqlPath), "Customer document lifecycle SQL contract must exist");
const documentSql = read(documentSqlPath);
expect(documents.includes("portal_visible: false"), "New customer documents must remain portal-hidden by default");
expect(documents.includes("createSignedUrl"), "Private customer documents must use short-lived signed access for preview/download");
expect(documents.includes('supabase.rpc("set_customer_document_portal_visibility"'), "Portal visibility must use the canonical document lifecycle RPC");
expect(documents.includes('supabase.rpc("deactivate_customer_document"'), "Document removal must be soft/deactivation through the canonical RPC");
expect(!documents.includes("storage_path}</"), "Customer document UI must not expose raw storage paths");
expect(/create or replace function public\.set_customer_document_portal_visibility\s*\(/i.test(documentSql), "Document lifecycle SQL must define portal visibility mutation");
expect(/create or replace function public\.deactivate_customer_document\s*\(/i.test(documentSql), "Document lifecycle SQL must define soft deactivation");
expect(/security\s+invoker/i.test(documentSql), "Customer document lifecycle RPCs must preserve caller RLS with SECURITY INVOKER");
expect(/insert into public\.customer_activity/i.test(documentSql), "Document lifecycle mutations must write Customer activity atomically");
expect(!/delete\s+from\s+public\.customer_documents/i.test(documentSql), "Customer document lifecycle must remain append-safe and avoid physical document deletion");

// Customer Contacts + Addresses use canonical transactional lifecycle RPCs rather than direct browser writes.
const customerCard = read("src/components/customers/CustomerCard.tsx");
const lifecycleSqlPath = "sql/customer-contact-address-lifecycle.sql";
expect(exists(lifecycleSqlPath), "Customer contact/address lifecycle SQL contract must exist");
const lifecycleSql = read(lifecycleSqlPath);
for (const rpc of ["create_customer_contact", "update_customer_contact", "set_customer_contact_primary", "deactivate_customer_contact", "update_customer_address", "deactivate_customer_address"]) {
  expect(new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, "i").test(lifecycleSql), `Missing canonical Customer lifecycle RPC: ${rpc}`);
}
expect(/current_user_has_any_role\s*\(\s*array\s*\[\s*['"]super_admin['"]\s*,\s*['"]admin['"]\s*,\s*['"]sales['"]/i.test(lifecycleSql), "Customer lifecycle RPCs must authorize super_admin/admin/sales at the database boundary");
expect(/from public\.customers[\s\S]{0,180}for update/i.test(lifecycleSql), "Customer contact/address lifecycle mutations must serialize on the customer row");
expect(/insert into public\.customer_activity/i.test(lifecycleSql), "Customer contact/address lifecycle mutations must append Customer activity");
expect(!/security\s+definer/i.test(lifecycleSql), "Customer contact/address lifecycle RPCs must remain SECURITY INVOKER");
expect(/revoke all on function public\.create_customer_contact[\s\S]{0,500}from public/i.test(lifecycleSql), "Customer lifecycle RPCs must revoke PUBLIC execute");
expect(/grant execute on function public\.create_customer_contact[\s\S]{0,500}to authenticated/i.test(lifecycleSql), "Customer lifecycle RPCs must grant authenticated execute explicitly");
expect(customerCard.includes('supabase.rpc("create_customer_contact"'), "CustomerCard contact create must use create_customer_contact RPC");
expect(customerCard.includes('supabase.rpc("update_customer_contact"'), "CustomerCard contact edit must use update_customer_contact RPC");
expect(customerCard.includes('supabase.rpc("set_customer_contact_primary"'), "CustomerCard primary contact action must use set_customer_contact_primary RPC");
expect(customerCard.includes('supabase.rpc("deactivate_customer_contact"'), "CustomerCard contact removal must soft-deactivate through RPC");
expect(customerCard.includes('supabase.rpc("update_customer_address"'), "CustomerCard address edit must use update_customer_address RPC");
expect(customerCard.includes('supabase.rpc("deactivate_customer_address"'), "CustomerCard address removal must soft-deactivate through RPC");
expect(!/from\("customer_contacts"\)\.(?:insert|update|delete)/.test(customerCard), "CustomerCard must not mutate contacts directly from the browser");
expect(!/from\("customer_addresses"\)\.delete/.test(customerCard), "CustomerCard must not hard-delete customer addresses from the browser");

console.log("customers UI contract: ok");