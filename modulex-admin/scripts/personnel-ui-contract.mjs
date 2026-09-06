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

const compensation = read("src/components/hr/CompensationManager.tsx");
const layout = read("src/app/layout.tsx");
const contrastFixPath = path.join(root, "src/app/theme-contrast-fixes.css");
const contrastFixes = fs.existsSync(contrastFixPath) ? fs.readFileSync(contrastFixPath, "utf8") : "";

for (const primitive of [
  "ComponentCard",
  "StatTile",
  "Label",
  "Select",
  "Input",
  "TextArea",
  "Alert",
  "Badge",
  "Button",
  "TableViewport",
  "Table",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
  "TableStateRow",
  "ADMIN_TEXT_STYLES",
]) {
  expect(compensation.includes(primitive), `Compensation must use shared admin primitive/theme token: ${primitive}`);
}

expect(!compensation.includes("const inputClass"), "Compensation must not carry a local input style system");
expect(!compensation.includes("const cardClass"), "Compensation must not carry a local card style system");
expect(!/<select\b/.test(compensation), "Compensation selects must use the shared Select primitive");
expect(!/<button\b/.test(compensation), "Compensation actions must use the shared Button primitive");
expect(!/<table\b|<thead\b|<tbody\b|<tr\b|<th\b|<td\b/.test(compensation), "Compensation data lists must use shared table primitives");

for (const label of [
  "Rate type",
  "Amount",
  "Pay frequency",
  "Hours / week",
  "Overtime eligible",
  "Overtime multiplier",
  "Effective date",
  "Reason",
  "Type",
  "Description (optional)",
  "Advance amount",
  "Payroll installment (optional)",
  "Deduction name",
  "Amount type",
  "Tax treatment",
  "Recurrence",
]) {
  expect(compensation.includes(label), `Compensation field needs a visible label: ${label}`);
}

expect(compensation.includes("item.effective_from <= today"), "Current compensation must not select a future-dated rate");
expect(compensation.includes("Loading compensation"), "Employee changes need an explicit compensation loading state");
expect(compensation.includes("No compensation history yet"), "Compensation history needs a clear empty state");
expect(compensation.includes("No variable pay entries yet"), "Variable pay needs a clear empty state");
expect(compensation.includes("No advances yet"), "Advances need a clear empty state");
expect(compensation.includes("No deductions yet"), "Deductions need a clear empty state");
expect(compensation.includes("formatDisplayDate"), "Compensation dates must use a deterministic display formatter");
expect(compensation.includes("getStatusPresentation"), "Compensation statuses must use semantic badges");
expect(!compensation.includes("setMessage(error.message)"), "Compensation must not expose raw Supabase mutation errors");
expect(!compensation.includes("setMessage(e instanceof Error ? e.message"), "Compensation must not expose raw Supabase load errors");

expect(layout.includes("./theme-contrast-fixes.css"), "Root layout must load scoped third-party theme contrast fixes");
expect(contrastFixes.includes(".custom-calendar .fc-h-event"), "FullCalendar event text needs an explicit theme-aware override");
expect(contrastFixes.includes("var(--color-gray-700)"), "FullCalendar light-mode event text needs a readable token");
expect(contrastFixes.includes(".dark .custom-calendar .fc-h-event"), "FullCalendar event text needs a dark-mode override");
expect(contrastFixes.includes("var(--color-gray-300)"), "FullCalendar dark-mode event text needs a readable token");

console.log("personnel UI contract: ok");
