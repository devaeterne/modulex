import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowDir = path.join(repoRoot, ".github", "workflows");

const APPROVED = new Set([
  "admin-ui-foundation.yml",
  "admin-a1-core-operations.yml",
  "admin-inventory-warehouse-qr-ui.yml",
  "admin-a3-product-master.yml",
  "admin-a6-finance-core.yml",
  "admin-project-base.yml",
  "admin-vendor-catalog-sync.yml",
  "gc5-branch-contract.yml",
  "gc8a-store-chrome-seo.yml",
  "gc8b-accessibility-performance.yml",
]);

const ADMIN_UI_OWNER = "admin-ui-foundation.yml";
const STORE_CORE_OWNER = "gc8a-store-chrome-seo.yml";
const GC5_WRITE_WORKFLOW = "gc5-branch-contract.yml";
const GC8B_LIGHTHOUSE_WORKFLOW = "gc8b-accessibility-performance.yml";

const ADMIN_DOMAIN_WORKFLOWS = new Set([
  "admin-a1-core-operations.yml",
  "admin-inventory-warehouse-qr-ui.yml",
  "admin-a3-product-master.yml",
  "admin-a6-finance-core.yml",
  "admin-project-base.yml",
  "admin-vendor-catalog-sync.yml",
]);

const GLOBAL_ADMIN_COMMANDS = [
  "smoke:production-surface",
  "smoke:rbac",
  "npm run typecheck",
  "npm run lint",
  "npm run build",
];

const errors = [];
const workflowFiles = fs
  .readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

function fail(workflow, rule) {
  errors.push(`${workflow}: ${rule}`);
}

function readWorkflow(name) {
  return fs.readFileSync(path.join(workflowDir, name), "utf8");
}

const actual = new Set(workflowFiles);
for (const name of workflowFiles) {
  if (!APPROVED.has(name)) {
    fail(name, "workflow is outside the approved CI inventory; reuse an existing workflow or obtain explicit approval before adding a new one");
  }
}
for (const name of APPROVED) {
  if (!actual.has(name)) {
    fail(name, "approved workflow is missing");
  }
}

for (const name of workflowFiles) {
  const text = readWorkflow(name);

  if (
    name !== ADMIN_UI_OWNER &&
    (text.includes("modulex-admin/AdminUICheck.md") || text.includes("modulex-admin/docs/ADMIN_UI_GUIDE.md"))
  ) {
    fail(name, "AdminUICheck.md / ADMIN_UI_GUIDE.md may only be owned by admin-ui-foundation.yml");
  }

  if (name !== ADMIN_UI_OWNER && text.includes('"modulex-admin/**"')) {
    fail(name, "broad modulex-admin/** trigger is reserved for Admin UI Foundation");
  }

  if (name !== STORE_CORE_OWNER && text.includes('"modulex-store/**"')) {
    fail(name, "broad modulex-store/** normal-PR trigger is reserved for Store Core CI");
  }

  if (ADMIN_DOMAIN_WORKFLOWS.has(name)) {
    for (const command of GLOBAL_ADMIN_COMMANDS) {
      if (text.includes(command)) {
        fail(name, `duplicates global Admin quality command: ${command}`);
      }
    }
  }

  if (APPROVED.has(name) && name !== GC5_WRITE_WORKFLOW) {
    if (!/^concurrency:/m.test(text) || !/cancel-in-progress:\s*true/.test(text)) {
      fail(name, "retained read-only workflow must use interruptible concurrency with cancel-in-progress: true");
    }
  }
}

if (actual.has(ADMIN_UI_OWNER)) {
  const text = readWorkflow(ADMIN_UI_OWNER);
  for (const required of [
    "modulex-admin/AdminUICheck.md",
    "modulex-admin/docs/ADMIN_UI_GUIDE.md",
    "smoke:admin-ui-strict:self-test",
    "smoke:admin-ui-strict",
    "smoke:admin-ui",
    "smoke:production-surface",
    "smoke:rbac",
    "npm run typecheck",
    "npm run lint",
    "npm run build",
  ]) {
    if (!text.includes(required)) {
      fail(ADMIN_UI_OWNER, `missing required global Admin owner entry: ${required}`);
    }
  }
}

if (actual.has(STORE_CORE_OWNER)) {
  const text = readWorkflow(STORE_CORE_OWNER);
  if (!/^name:\s*Store Core CI\s*$/m.test(text)) {
    fail(STORE_CORE_OWNER, "display name must be Store Core CI");
  }
  if (!text.includes('"modulex-store/**"')) {
    fail(STORE_CORE_OWNER, "must own the broad modulex-store/** normal-PR trigger");
  }
}

if (actual.has(GC5_WRITE_WORKFLOW)) {
  const text = readWorkflow(GC5_WRITE_WORKFLOW);
  if (!/permissions:\s*\n\s*contents:\s*write/m.test(text)) {
    fail(GC5_WRITE_WORKFLOW, "must remain the write-capable contents: write migration workflow");
  }
  if (!/branches:\s*\n\s*-\s*feat\/gc5-gallery-projects-media-library/m.test(text)) {
    fail(GC5_WRITE_WORKFLOW, "must remain branch-scoped to feat/gc5-gallery-projects-media-library");
  }
  if (/cancel-in-progress:\s*true/.test(text)) {
    fail(GC5_WRITE_WORKFLOW, "write-capable migration workflow must not be interruptible");
  }
}

if (actual.has(GC8B_LIGHTHOUSE_WORKFLOW)) {
  const text = readWorkflow(GC8B_LIGHTHOUSE_WORKFLOW);
  if (!/workflow_dispatch:/.test(text)) {
    fail(GC8B_LIGHTHOUSE_WORKFLOW, "must remain manually invokable for Lighthouse baseline capture");
  }
  if (/\bnpm run (?:lint|build)\b/.test(text)) {
    fail(GC8B_LIGHTHOUSE_WORKFLOW, "must not duplicate ordinary Store lint/build owned by Store Core CI");
  }
}

if (errors.length > 0) {
  console.error("CI workflow architecture contract: FAIL");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`CI workflow architecture contract: PASS (${workflowFiles.length} approved workflows)`);
