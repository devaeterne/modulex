import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(here, "..");
const repoRoot = path.resolve(adminRoot, "..");

async function exists(relativePath) {
  try {
    await access(path.join(adminRoot, relativePath), constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

assert.equal(
  await exists("src/app/(admin)/loading.tsx"),
  true,
  "PRF-A3 requires a shared Admin route loading boundary",
);
assert.equal(
  await exists("src/app/(admin)/error.tsx"),
  true,
  "PRF-A3 requires a shared Admin route error boundary",
);

const profileSource = await readFile(
  path.join(adminRoot, "src/lib/supabase/profile.ts"),
  "utf8",
);
assert.match(
  profileSource,
  /Promise\.all\(\[[\s\S]*?\.from\("profiles"\)[\s\S]*?\.from\("user_roles"\)[\s\S]*?\]\)/,
  "PRF-A3 requires independent profile and user-role reads to run concurrently",
);

const customersSource = await readFile(
  path.join(adminRoot, "src/components/customers/CustomersTable.tsx"),
  "utf8",
);
assert.match(
  customersSource,
  /Promise\.all\(\[[\s\S]*?get_customer_dashboard[\s\S]*?\]\)/,
  "PRF-A3 requires the initial Customer summary request to join the reference-data batch",
);

const migrationsDir = path.join(repoRoot, "modulex-store/supabase/migrations");
const migrationFiles = (await readdir(migrationsDir)).filter((name) =>
  name.endsWith("_prf_admin_supabase_performance_closeout.sql"),
);
assert.equal(
  migrationFiles.length,
  1,
  "PRF-A1/A2 require exactly one canonical performance closeout migration",
);

const migrationSource = (
  await readFile(path.join(migrationsDir, migrationFiles[0]), "utf8")
).toLowerCase();

for (const indexName of [
  "calendar_sync_audit_actor_profile_id_idx",
  "calendar_sync_outbox_project_id_idx",
  "vendor_catalog_items_last_seen_run_id_idx",
]) {
  assert.ok(
    migrationSource.includes(indexName),
    `PRF-A1 migration must create ${indexName}`,
  );
}

assert.doesNotMatch(
  migrationSource,
  /calendar_events_(created_by|updated_by).*idx/,
  "PRF-A1 must not add write-amplifying calendar actor indexes without workload evidence",
);
assert.ok(
  migrationSource.includes('alter policy "project_participants_bounded_read"'),
  "PRF-A2 must optimize project_participants_bounded_read in place",
);
assert.ok(
  migrationSource.includes("(select auth.uid())"),
  "PRF-A2 must use initPlan-compatible auth.uid() evaluation",
);
assert.ok(
  migrationSource.includes('drop policy if exists "store_pages_admin_all"'),
  "PRF-A2 must remove the overlapping store_pages ALL policy",
);
for (const command of ["for insert", "for update", "for delete"]) {
  assert.ok(
    migrationSource.includes(command),
    `PRF-A2 must restore Admin ${command.replace("for ", "")} authorization explicitly`,
  );
}
assert.doesNotMatch(
  migrationSource,
  /drop policy if exists "store_pages_internal_read"/,
  "PRF-A2 must preserve the existing bounded store_pages SELECT policy",
);

console.log("PRF performance closeout contract: ok");