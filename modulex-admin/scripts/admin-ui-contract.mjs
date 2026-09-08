import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const packageRoot = process.cwd();
const repoRoot = path.resolve(packageRoot, "..");
const guidePath = path.join(packageRoot, "docs/ADMIN_UI_GUIDE.md");
assert.ok(fs.existsSync(guidePath), "Admin UI guide is required");
const guide = fs.readFileSync(guidePath, "utf8").toLowerCase();
for (const token of ["shared", "responsive", "dark", "loading", "error", "table", "modal"]) {
  assert.ok(guide.includes(token), `Admin UI guide must define ${token}`);
}

let diff;
try {
  diff = execFileSync("git", ["-C", repoRoot, "diff", "--unified=0", "origin/main...HEAD", "--", "modulex-admin/src"], { encoding: "utf8" });
} catch {
  diff = execFileSync("git", ["-C", repoRoot, "diff", "--unified=0", "HEAD^", "HEAD", "--", "modulex-admin/src"], { encoding: "utf8" });
}

const tableShellPatterns = [
  /<table\b[^>]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)/gi,
  /<div\b[^>\n]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)[^>\n]*>[\s\S]{0,800}<table\b/gi,
];

const sharedAppearancePrefixes = [
  "modulex-admin/src/components/ui/",
  "modulex-admin/src/components/form/",
  "modulex-admin/src/components/common/",
];

function isSharedAppearanceOwner(file) {
  return sharedAppearancePrefixes.some((prefix) => file?.startsWith(prefix));
}

function baselineAwareAddedText() {
  const chunks = diff.split(/^diff --git /m).slice(1);
  return chunks.map((chunk) => {
    const file = chunk.match(/ b\/(modulex-admin\/src\/[^\n]+)/)?.[1];
    const addedChunk = chunk.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++" )).join("\n");
    if (!file) return addedChunk;
    if (isSharedAppearanceOwner(file)) return "";

    let baseline = "";
    let current = "";
    try {
      baseline = execFileSync("git", ["-C", repoRoot, "show", `origin/main:${file}`], { encoding: "utf8" });
      current = fs.readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      return tableShellPatterns.reduce((text, pattern) => text.replace(pattern, ""), addedChunk);
    }
    if (tableShellPatterns.every((pattern) => {
      pattern.lastIndex = 0;
      const currentCount = current.match(pattern)?.length ?? 0;
      pattern.lastIndex = 0;
      const baselineCount = baseline.match(pattern)?.length ?? 0;
      return currentCount <= baselineCount;
    })) {
      return tableShellPatterns.reduce((text, pattern) => text.replace(pattern, ""), addedChunk);
    }
    return addedChunk;
  }).join("\n");
}

const addedText = baselineAwareAddedText();

function assertGuardrails(text) {
  assert.doesNotMatch(text, /<button\b(?:(?!>).)*className\s*=(?:(?!>).)*(?:bg-|rounded-|shadow-|border-|px-|py-|h-)/s, "New route-specific styled buttons are not allowed");
  assert.doesNotMatch(text, /<Button\b(?:(?!>).)*className\s*=(?:(?!>).)*(?:bg-|text-(?:white|gray|brand|error|success|warning)-|border-|rounded-|shadow-)/is, "Shared Button appearance overrides are not allowed");
  assert.doesNotMatch(text, /TailAdmin|dasoft\.me|info@dasoft\.me/i, "Known TailAdmin/demo patterns must not be reintroduced");
  assert.doesNotMatch(text, /<table\b[^>]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)/i, "New route-specific table shells are not allowed");
  assert.doesNotMatch(text, /<div\b[^>\n]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)[^>\n]*>[\s\S]{0,800}<table\b/i, "New ad-hoc table overflow shells are not allowed");
}

assertGuardrails(addedText);

const fixtures = {
  nativeButton: '<button className={cn("px-3", active && "bg-brand-500")}>Save</button>',
  sharedButton: '<Button className={clsx("rounded-lg", disabled && "bg-gray-300")} />',
  templateExpression: '<button className={`h-10 ${danger ? "bg-error-500" : "bg-brand-500"}`}>Delete</button>',
  tableShell: '<div className={cn("overflow-x-auto", "rounded-xl")}><table><tbody /></table></div>',
  layoutOnly: '<Button className={cn("w-full", "mt-2", "h-12", "px-2")} />',
};
for (const [name, fixture] of Object.entries(fixtures)) {
  if (name === "layoutOnly") {
    assert.doesNotThrow(() => assertGuardrails(fixture), `${name} fixture should pass`);
  } else {
    assert.throws(() => assertGuardrails(fixture), `${name} fixture should fail`);
  }
}

const sidebarPath = path.join(packageRoot, "src/layout/AppSidebar.tsx");
const permissionsPath = path.join(packageRoot, "src/lib/auth/permissions.ts");
const sidebar = fs.readFileSync(sidebarPath, "utf8");
const permissions = fs.readFileSync(permissionsPath, "utf8");

const requiredSidebarEntries = [
  ["Project List", "/projects", "projects.view"],
  ["Project Imports", "/projects/import", "projects.import"],
  ["Countertop Configuration", "/pricing/countertop", "pricing.manage"],
  ["Additional Services", "/pricing/countertop/services", "pricing.manage"],
  ["Lead Form Options", "/store/leads/form-options", "leads.manage"],
  ["Product Updates", "/settings/general/product-updates", "settings.manage"],
  ["What's New", "/updates", "updates.view"],
];

for (const [name, route, permission] of requiredSidebarEntries) {
  assert.ok(sidebar.includes(`name: "${name}"`), `Sidebar must include ${name}`);
  assert.ok(sidebar.includes(`path: "${route}"`), `Sidebar must link ${name} to ${route}`);
  assert.ok(sidebar.includes(`permission: "${permission}"`), `Sidebar must protect ${name} with ${permission}`);
}

assert.match(permissions, /\| "updates\.view";/, "Permission union must define updates.view");
assert.match(permissions, /"updates\.view": "View product updates"/, "Permission labels must define updates.view");
assert.match(permissions, /path === "\/updates"[\s\S]{0,120}permission: "updates\.view"/, "Route access must explicitly protect /updates with updates.view");
assert.match(permissions, /path === "\/settings\/general\/product-updates"[\s\S]{0,180}permission: "settings\.manage"/, "Product Updates must require settings.manage before the generic settings rule");

for (const role of ["sales", "finance", "hr", "warehouse", "shipping"]) {
  const roleBlock = permissions.match(new RegExp(`${role}: \\[([\\s\\S]*?)\\n  \\],`))?.[1] ?? "";
  assert.ok(roleBlock.includes('"updates.view"'), `${role} must be able to view product updates`);
}

function assertOrdered(source, labels, context) {
  let previous = -1;
  for (const label of labels) {
    const current = source.indexOf(`name: "${label}"`, previous + 1);
    assert.ok(current >= 0, `${context} must include ${label}`);
    assert.ok(current > previous, `${context} must keep ${label} in the intended position`);
    previous = current;
  }
}

const operationsBlock = sidebar.split("const managementItems")[0];
const managementBlock = sidebar.split("const managementItems")[1]?.split("function filterItems")[0] ?? "";

assertOrdered(
  operationsBlock,
  ["Dashboard", "Customers", "Projects", "Calendar", "Products", "Pricing", "Inventory", "Warehouse", "QR Operations", "Request Center", "What's New"],
  "Operations navigation",
);
assertOrdered(
  managementBlock,
  ["Finance", "Personnel", "Reports", "Store", "Users", "General Settings"],
  "Management navigation",
);

const semanticIcons = [
  ["Dashboard", "GridIcon"],
  ["Customers", "GroupIcon"],
  ["Projects", "FolderIcon"],
  ["Calendar", "CalenderIcon"],
  ["Products", "BoxCubeIcon"],
  ["Pricing", "DollarLineIcon"],
  ["Inventory", "BoxIconLine"],
  ["Warehouse", "BoxIcon"],
  ["QR Operations", "BoltIcon"],
  ["Request Center", "TaskIcon"],
  ["What's New", "ShootingStarIcon"],
  ["Finance", "DollarLineIcon"],
  ["Personnel", "UserCircleIcon"],
  ["Reports", "PieChartIcon"],
  ["Store", "PageIcon"],
  ["Users", "UserIcon"],
  ["General Settings", "GridIcon"],
];

for (const [name, icon] of semanticIcons) {
  assert.match(
    sidebar,
    new RegExp(`icon: <${icon} \\/>[\\s\\S]{0,120}name: "${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"`),
    `${name} must use ${icon}`,
  );
}

assertOrdered(
  operationsBlock,
  ["Pricing Dashboard", "Product Prices", "Price Groups", "Material Bands", "Countertop Configuration", "Countertop Catalog", "Additional Services", "Countertop Setup"],
  "Pricing navigation",
);
assertOrdered(
  managementBlock,
  ["Site Content", "Company", "Pages", "Cabinet Content", "Product Content", "Color Options", "Projects", "Media Library", "Reviews", "Leads & Dealer Apps", "Lead Form Options", "Marketing & Analytics"],
  "Store navigation",
);

console.log("Admin UI consistency contract: PASS");