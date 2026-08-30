import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const guide = read("docs/ADMIN_VALIDATION_GUIDE.md");
const agents = read("../AGENTS.md");
const roadmap = read("ADMIN_ROADMAP.md");
const sharedValidation = read("src/lib/validation.ts");

for (const section of [
  "## Database contract first",
  "## Normalize before mutation",
  "## Numbers, money, and dates",
  "## Enums, foreign keys, and stale options",
  "## Errors and mutation safety",
  "## Authorization and data-fetching UX",
  "## Cross-surface and production discipline",
  "## Legacy remediation audit",
  "## Contract method"
]) {
  assert(guide.includes(section), `Validation guide section missing: ${section}`);
}

for (const rule of [
  "Never cast a non-UUID identifier to UUID",
  "Prevent duplicate submits",
  "do not bypass an existing RPC",
  "hiding a button or checking `authenticated` alone is not authorization",
  "Shared schema/RPC changes require Admin, Store, Customer Portal, and Dealer Portal regression checks"
]) {
  assert(agents.includes(rule), `Root validation guardrail missing: ${rule}`);
}

for (const track of [
  "VAL-1 — Validation & Data Contract Foundation",
  "VAL-2 — Products & Pricing",
  "VAL-3 — Customers / Orders / Invoices",
  "VAL-4 — Inventory / Warehouses / Stock Operations",
  "VAL-5 — Store CMS / Users / Settings / remaining Admin forms",
  "VAL-6 — Full validation regression & production acceptance"
]) {
  assert(roadmap.includes(track), `Roadmap validation track missing: ${track}`);
}
assert(/Primary near-term Admin work is \*\*VAL-2 — Products & Pricing\*\*[\s\S]*Phase A3 functional delivery is CLOSED/.test(roadmap), "VAL-2 must remain the current validation next action after A3 closeout");

for (const helper of [
  "normalizeOptional",
  "normalizeEmail",
  "normalizeCountryCode",
  "normalizeCurrencyCode",
  "isValidHttpUrl"
]) {
  assert(new RegExp(`export function ${helper}\\b`).test(sharedValidation), `Shared validation helper missing: ${helper}`);
}
assert(/const trimmed = value\?\.trim\(\) \?\? "";[\s\S]*return trimmed \|\| null/.test(sharedValidation), "Optional values must normalize blank strings to null");

console.log("Validation & data contract foundation: PASS");
