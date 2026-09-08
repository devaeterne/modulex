import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const pagePath = "src/app/(admin)/projects/import/page.tsx";
const managerPath = "src/components/projects/ProjectHistoricalImportManager.tsx";
const apiPath = "src/app/api/admin/projects/import/route.ts";
const serverPath = "src/lib/projects/historical-import-server.ts";
const workbookPath = "src/lib/projects/historical-import-workbook.ts";

for (const file of [pagePath, managerPath, apiPath, serverPath, workbookPath]) {
  assert.equal(exists(file), true, `PB-9 Admin import surface is missing ${file}`);
}

const page = read(pagePath);
const manager = read(managerPath);
const api = read(apiPath);
const server = read(serverPath);
const workbook = read(workbookPath);
const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");

assert.match(permissions, /"projects\.import"/, "Historical imports need a dedicated projects.import permission");
assert.match(sidebar, /Historical Import[\s\S]*\/projects\/import[\s\S]*projects\.import/, "Projects navigation must expose Historical Import only to projects.import actors");
assert.match(page, /ProjectHistoricalImportManager/, "Historical Import page must render the PB-9 manager");
assert.match(manager, /accept=["']\.xlsx|accept:\s*\{[^}]*xlsx/s, "Upload UI must accept XLSX workbooks");
assert.match(manager, /Dry Run/i, "UI must expose an explicit dry-run step");
assert.match(manager, /Commit Import/i, "UI must expose an explicit commit step");
assert.match(manager, /fingerprint/i, "Commit UI must present/use the exact dry-run fingerprint");
assert.match(manager, /mapping/i, "UI must support resolving row mappings");
assert.match(api, /requirePermission\(request,\s*["']projects\.import["']\)/, "Import API must require projects.import");
assert.match(api, /multipart\/form-data|request\.formData\(\)/, "Import API must accept workbook uploads server-side");
assert.doesNotMatch(api + server, /service[_-]?role|SUPABASE_SECRET_KEY|supabaseAdmin/i, "PB-9 import execution must not use elevated service credentials");
assert.match(server, /stage_customer_project_import/, "Server adapter must use canonical PB-9 stage RPC");
assert.match(server, /get_customer_project_import_batch/, "Server adapter must use canonical PB-9 review RPC");
assert.match(server, /set_customer_project_import_row_mapping/, "Server adapter must use canonical PB-9 mapping RPC");
assert.match(server, /dry_run_customer_project_import/, "Server adapter must use canonical PB-9 dry-run RPC");
assert.match(server, /commit_customer_project_import/, "Server adapter must use canonical PB-9 commit RPC");
assert.match(workbook, /node:zlib/, "Vercel-safe XLSX parsing must stay in Node runtime without Python subprocesses");
assert.doesNotMatch(workbook + api + server, /child_process|spawnSync|python3/, "Admin XLSX flow must not depend on Python at runtime");
assert.match(workbook, /Initial Contract Price/);
assert.match(workbook, /Price After Change Orders/);
assert.match(workbook, /Profit Margin/);

console.log("PB-9 Historical Excel Import Admin UI contract: OK");
