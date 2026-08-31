import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const routes = [
  ["src/app/(admin)/users/page.tsx", "/users", "users.view"],
  ["src/app/(admin)/roles/page.tsx", "/roles", "roles.manage"],
  ["src/app/(admin)/store/content/page.tsx", "/store/content", "store.manage"],
  ["src/app/(admin)/store/company/page.tsx", "/store/company", "store.manage"],
  ["src/app/(admin)/store/pages/page.tsx", "/store/pages", "store.manage"],
  ["src/app/(admin)/store/projects/page.tsx", "/store/projects", "store.manage"],
  ["src/app/(admin)/store/media/page.tsx", "/store/media", "store.manage"],
  ["src/app/(admin)/store/marketing/page.tsx", "/store/marketing", "store.manage"],
  ["src/app/(admin)/store/products/page.tsx", "/store/products", "store.view"],
  ["src/app/(admin)/store/colors/page.tsx", "/store/colors", "store.manage"],
  ["src/app/(admin)/store/leads/page.tsx", "/store/leads", "leads.view"],
];
const sidebar = read("src/layout/AppSidebar.tsx");
for (const [file, route, permission] of routes) {
  expect(fs.existsSync(path.join(root, file)), `Missing Users/Store route: ${file}`);
  expect(sidebar.includes(`path: "${route}", permission: "${permission}"`), `${route} must remain gated by ${permission}`);
}
function collect(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [read(path.join(dir, entry.name))] : []);
}
const sources = [...collect("src/components/users"), ...collect("src/components/store"), ...routes.map(([file]) => read(file))].join("\n");
expect(sources.includes("dark:"), "Users/Store surfaces must support dark mode");
expect(/\b(sm|md|lg|xl):/.test(sources) || sources.includes("overflow-x-auto"), "Users/Store surfaces need responsive behavior");
expect(/aria-|htmlFor=|role=|<label\b/.test(sources), "Users/Store surfaces need accessible labels/state");
expect(/isLoading|loading|Loading/.test(sources) && /error|Error/.test(sources), "Users/Store surfaces need loading and error states");
expect(!sources.includes('href="#"') && !sources.includes("javascript:void") && !sources.includes("TailAdmin"), "Users/Store surfaces must not ship dead/template UI");

const users = read("src/components/users/UsersTable.tsx");
for (const primitive of [
  "ComponentCard",
  "Label",
  "Input",
  "Select",
  "Checkbox",
  "Button",
  "Badge",
  "Alert",
  "Modal",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(users.includes(primitive), `Users must compose the shared ${primitive} primitive`);
}
expect(
  !/<(?:input|select|table|thead|tbody|tr|th|td)\b/.test(users),
  "Users must not reimplement shared form/table primitives",
);
for (const id of ["users-search", "users-role-filter", "users-status-filter", "user-full-name", "user-email", "user-phone"]) {
  expect(users.includes(`id="${id}"`), `${id} control id is missing`);
  expect(users.includes(`htmlFor="${id}"`), `${id} label association is missing`);
}
expect(users.includes('closeOnEscape={false}'), "Users modal must preserve the previous no-Escape-close behavior");
expect(users.includes('showCloseButton={false}'), "Users modal must use its local explicit close action so backdrop dismissal stays disabled");
expect(users.includes("ignoreModalDismiss"), "Users shared Modal backdrop dismissal must remain a no-op");
expect(users.includes("confirm(`Send password reset email"), "Password reset confirmation must remain intact");
expect(users.includes("confirm(`${next ? \"Activate\" : \"Deactivate\"}"), "Activation confirmation must remain intact");
expect(users.includes("confirm(`Permanently delete"), "Permanent-delete confirmation must remain intact");
expect(users.includes('action: "set_password"'), "Set-password API action must remain intact");
expect(users.includes('action: "send_reset"'), "Reset-email API action must remain intact");
expect(users.includes('action: "set_active"'), "Activation API action must remain intact");
expect(users.includes("protectedTarget") && users.includes("ownAccount"), "Protected-user and own-account guards must remain intact");

console.log("users + store UI contract: ok");
