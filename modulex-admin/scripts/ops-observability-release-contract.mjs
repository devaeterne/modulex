import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(adminRoot, "..");

const read = (relative) => fs.readFileSync(path.join(adminRoot, relative), "utf8");
const standard = read("docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md");
const acceptance = read("docs/OPS_CLOSEOUT_ACCEPTANCE.md");
const roadmap = read("ADMIN_ROADMAP.md");
const adminReadme = read("README.md");
const productionSurface = read("docs/ADMIN_PRODUCTION_SURFACE.md");
const rbacMatrix = read("docs/ADMIN_RBAC_MATRIX.md");
const runtimeConfig = read("docs/ADMIN_RUNTIME_CONFIG.md");
const rootReadme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "admin-ui-foundation.yml"), "utf8");

function requireAll(text, values, label) {
  for (const value of values) {
    assert.ok(text.includes(value), `${label} must retain: ${value}`);
  }
}

// OPS-A1 — every named operational surface and the safe logging boundary stays explicit.
requireAll(
  standard,
  [
    "Client",
    "Server",
    "API",
    "Background jobs",
    "Vendor sync",
    "Calendar sync",
    "Email queue",
    "Secret and PII logging policy",
    "Authorization",
    "access/refresh tokens",
    "Raw request/response bodies",
    "Full customer/employee/vendor PII",
    "deny unknown payloads",
  ],
  "OPS-A1 standard",
);

requireAll(
  standard,
  [
    "vendor_catalog_runs",
    "vendor_catalog_checks",
    "calendar_sync_jobs",
    "calendar_sync_outbox",
    "calendar_provider_event_links",
    "calendar_sync_audit",
    "email_notifications",
    "support_request_email_deliveries",
  ],
  "OPS-A1 existing-source map",
);

// OPS-A2 — the audit minimum is semantic and reuses existing ledgers/events.
requireAll(
  standard,
  [
    "**actor**",
    "**timestamp**",
    "**entity**",
    "**action**",
    "**before/after or semantic delta**",
    "**reason**",
    "**request/idempotency identity**",
    "Do **not** create a new domain ledger solely to satisfy OPS-A2",
    "audit_logs",
    "finance_transaction_audit",
    "finance_idempotency_requests",
    "vendor_audit_log",
    "vendor_invoice_audit",
    "vendor_invoice_idempotency_requests",
    "hr_employee_history",
    "user_role_change_audit",
    "calendar_sync_audit",
  ],
  "OPS-A2 audit contract",
);

// OPS-A3 — canonical ownership, compatibility and failure policy must not drift.
requireAll(
  standard,
  [
    "modulex-store/supabase/migrations",
    "secondary compatibility mirror only",
    "expand/contract",
    "Failed migration handling",
    "append-only forward-fix",
    "Forward-fix is the default after production DDL",
    "Security Advisor",
    "Performance Advisor",
  ],
  "OPS-A3 migration runbook",
);

const canonicalDir = path.join(repoRoot, "modulex-store", "supabase", "migrations");
const adminMirrorDir = path.join(adminRoot, "supabase", "migrations");
assert.ok(fs.existsSync(canonicalDir), "Canonical migration directory must exist");

const migrationKey = (name) => name.replace(/^\d+_/, "");
const canonicalKeys = new Set(
  fs
    .readdirSync(canonicalDir)
    .filter((name) => name.endsWith(".sql"))
    .map(migrationKey),
);

if (fs.existsSync(adminMirrorDir)) {
  for (const mirrorName of fs.readdirSync(adminMirrorDir).filter((name) => name.endsWith(".sql"))) {
    const key = migrationKey(mirrorName);
    assert.ok(
      canonicalKeys.has(key),
      `Admin migration mirror must not own orphan migration ${mirrorName}; add/retain its canonical counterpart under modulex-store/supabase/migrations`,
    );
  }
}

// OPS-A4 — release gates are mandatory, not a chat-only checklist.
requireAll(
  standard,
  [
    "latest main",
    "open PRs",
    "npm run typecheck",
    "npm run lint",
    "npm run build",
    "Production migration result",
    "Security Advisor",
    "Performance Advisor",
    "Vercel deployment",
    "Signed-in smoke",
    "Zero test residue",
    "Roadmap / acceptance",
  ],
  "OPS-A4 release checklist",
);

requireAll(
  acceptance,
  [
    "Fresh production Advisor snapshot",
    "Existing audit/event sources verified",
    "Migration ownership decision",
    "Executable enforcement",
    "zero database/storage test residue",
  ],
  "OPS closeout acceptance",
);

assert.match(roadmap, /Status: `\[x\]` OPS-A1→OPS-A4 closed/, "Roadmap must mark the OPS workstream closed");
for (const id of ["OPS-A1", "OPS-A2", "OPS-A3", "OPS-A4"]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] \\*\\*${id}`), `Roadmap must keep ${id} checked`);
}

// DOC-A1 → DOC-A4 — canonical handoff sources and lifecycle semantics must stay explicit.
requireAll(
  rootReadme,
  [
    "modulex-admin/ADMIN_ROADMAP.md",
    "modulex-admin/docs/ADMIN_PRODUCTION_SURFACE.md",
    "modulex-admin/docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md",
    "modulex-store/supabase/migrations",
    "Acceptance files and archived plans are point-in-time evidence",
  ],
  "Root handoff index",
);

requireAll(
  adminReadme,
  [
    "Documentation source-of-truth map",
    "docs/ADMIN_PRODUCTION_SURFACE.md",
    "docs/ADMIN_RBAC_MATRIX.md",
    "docs/ADMIN_RUNTIME_CONFIG.md",
    "docs/ADMIN_UI_GUIDE.md",
    "docs/ADMIN_VALIDATION_GUIDE.md",
    "docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md",
    "docs/FINANCE_DOMAIN_PLAN.md",
    "docs/FINANCE_F0_BASELINE.md",
    "Historical baseline only",
    "Historical execution evidence",
    "modulex-store/supabase/migrations",
  ],
  "Admin documentation map",
);

requireAll(
  productionSurface,
  [
    "Ownership model",
    "modulex-store/supabase/migrations",
    "Current Admin production route families",
    "`/calendar`",
    "Standalone `/training` is not product scope",
    "Public vs internal data boundary",
    "Admin → Supabase DB/Storage → published/public projection → Store",
  ],
  "Admin production/domain map",
);
assert.doesNotMatch(
  productionSurface,
  /pending later scope decisions|Phase A6 classification still required/,
  "Production surface must not retain obsolete A6 scope-decision language",
);

requireAll(
  rbacMatrix,
  [
    "Standalone `/training` was removed from product scope",
    "npm run smoke:rbac",
    "npm run smoke:admin-users",
    "RBS-A4",
  ],
  "Admin RBAC handoff",
);
assert.doesNotMatch(rbacMatrix, /`training\.view` remains/, "RBAC docs must not resurrect removed training.view");
assert.doesNotMatch(rbacMatrix, /npm run test:admin-users/, "RBAC docs must use the real admin-users script name");

requireAll(
  runtimeConfig,
  [
    "OPS_OBSERVABILITY_RELEASE_STANDARD.md",
    "A Vercel `READY` result is release evidence for a specific SHA only",
    "npm run smoke:runtime-config",
  ],
  "Runtime handoff",
);

assert.match(roadmap, /Status: `\[x\]` DOC-A1→DOC-A4 reconciled/, "Roadmap must mark DOC closeout reconciled");
for (const id of ["DOC-A1", "DOC-A2", "DOC-A3", "DOC-A4"]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] \\*\\*${id}`), `Roadmap must keep ${id} checked`);
}
requireAll(
  roadmap,
  [
    "`[!]` deferred / not product scope",
    "Workstream lifecycle contract",
    "Evidence required for `[x]`",
    "Use `[!]` only when",
    "Same-PR maintenance rule",
    "must update `ADMIN_ROADMAP.md` in that same PR",
  ],
  "Roadmap maintenance contract",
);

assert.ok(
  workflow.includes("node scripts/ops-observability-release-contract.mjs"),
  "Approved Admin global CI workflow must execute the OPS/DOC closeout contract",
);
const rootReadmePathMatches = workflow.match(/^\s*-\s+"README\.md"\s*$/gm) ?? [];
assert.equal(
  rootReadmePathMatches.length,
  2,
  "Admin UI Foundation must trigger on root README.md for both pull_request and push so DOC handoff drift cannot bypass CI",
);

// Narrow fail-closed guard: never pipe known secret environment values directly into source console logging.
const sensitiveEnvNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "SMTP_PASSWORD",
  "ACCESS_TOKEN",
  "REFRESH_TOKEN",
  "PASSWORD",
  "WEBHOOK_SECRET",
  "SIGNING_KEY",
];
const sensitiveConsole = new RegExp(
  `console\\.(?:log|info|warn|error|debug)\\([^;\\n]*process\\.env\\.(?:${sensitiveEnvNames.join("|")})`,
  "i",
);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

for (const file of walk(path.join(adminRoot, "src"))) {
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    sensitiveConsole,
    `Secret environment value must not be logged directly: ${path.relative(adminRoot, file)}`,
  );
}

console.log("OPS observability/release + DOC handoff contract: PASS");