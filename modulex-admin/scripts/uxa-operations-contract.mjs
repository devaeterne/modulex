import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const searchable = read("src/components/form/SearchableSelect.tsx");
const dropdown = read("src/components/ui/dropdown/Dropdown.tsx");
const modal = read("src/components/ui/modal/index.tsx");
const button = read("src/components/ui/button/Button.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");
const guide = read("docs/ADMIN_UI_GUIDE.md");
const resolution = read("scripts/admin-resolution-matrix-contract.mjs");

// UXA-A1 — shared keyboard/focus/accessibility contracts.
assert.match(searchable, /aria-activedescendant=/, "SearchableSelect must expose the active option to assistive technology");
assert.match(searchable, /event\.key === "ArrowDown"/, "SearchableSelect must support ArrowDown traversal");
assert.match(searchable, /event\.key === "ArrowUp"/, "SearchableSelect must support ArrowUp traversal");
assert.match(searchable, /triggerRef\.current\?\.focus\(\)/, "SearchableSelect must restore focus to its trigger when dismissed");
assert.match(searchable, /id=\{optionId\(index\)\}/, "SearchableSelect options must expose stable ids for active-descendant navigation");

assert.match(dropdown, /event\.key === "ArrowDown"/, "Dropdown must support ArrowDown traversal");
assert.match(dropdown, /event\.key === "ArrowUp"/, "Dropdown must support ArrowUp traversal");
assert.match(dropdown, /event\.key === "Home"/, "Dropdown must support Home traversal");
assert.match(dropdown, /event\.key === "End"/, "Dropdown must support End traversal");
assert.match(dropdown, /anchorRef\?\.current\?\.focus\(\)/, "Dropdown must restore focus to its anchor on keyboard dismissal");

assert.match(modal, /role="dialog"/, "Modal must expose dialog semantics");
assert.match(modal, /aria-modal="true"/, "Modal must be announced as modal");
assert.match(modal, /FOCUSABLE_SELECTOR/, "Modal must trap focus");
assert.match(modal, /previousActiveElement\?\.focus\(\)/, "Modal must restore opener focus");

assert.match(sidebar, /aria-expanded=/, "Sidebar disclosure buttons must expose expanded state");
assert.match(sidebar, /aria-controls=/, "Sidebar disclosure buttons must identify controlled submenus");
assert.match(sidebar, /aria-label="Primary navigation"/, "Sidebar navigation needs an accessible name");

// UXA-A2 — supported viewport matrix and critical operational surfaces stay in the regression envelope.
for (const width of [360, 390, 768, 1024, 1280, 1366, 1440, 1536, 1920, 2560]) {
  assert.ok(guide.includes(String(width)), `ADMIN_UI_GUIDE must retain supported ${width}px viewport`);
  assert.ok(resolution.includes(String(width)), `Resolution contract must retain supported ${width}px viewport`);
}

const criticalRoutes = [
  "src/app/(admin)/scan/page.tsx",
  "src/app/(admin)/customers/page.tsx",
  "src/app/(admin)/customers/orders/page.tsx",
  "src/app/(admin)/pricing/countertop/page.tsx",
  "src/app/(admin)/finance/page.tsx",
  "src/app/(admin)/personnel/page.tsx",
  "src/app/(admin)/reports/sales-production/page.tsx",
];
for (const route of criticalRoutes) {
  assert.ok(fs.existsSync(path.join(root, route)), `Critical UXA route must remain present: ${route}`);
}
assert.match(guide, /TableViewport/, "Responsive operations must keep table overflow inside the shared viewport");
assert.match(guide, /page-level horizontal overflow/, "Responsive contract must forbid page-level horizontal overflow");

// UXA-A3 — pending actions are a shared primitive concern, not route-specific styling/state glue.
assert.match(button, /pending\?: boolean/, "Shared Button must expose a pending contract");
assert.match(button, /aria-busy=/, "Pending Button must announce busy state");
assert.match(button, /disabled=\{disabled \|\| pending\}/, "Pending Button must prevent duplicate submit");
assert.match(button, /pendingLabel\?: ReactNode/, "Shared Button must support explicit pending copy");

console.log("UXA accessibility/responsive operations contract: PASS");
