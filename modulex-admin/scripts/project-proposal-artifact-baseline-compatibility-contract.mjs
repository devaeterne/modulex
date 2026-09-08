import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");
const read = (file, base = root) => {
  try {
    return fs.readFileSync(path.join(base, file), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};
const exists = (file, base = root) => fs.existsSync(path.join(base, file));

const migrationName = "20260908184500_project_proposal_artifact_accepted_baseline_fix.sql";
const adminMigration = `supabase/migrations/${migrationName}`;
const storeMigration = `modulex-store/supabase/migrations/${migrationName}`;

assert.equal(exists(adminMigration), true, `P5 baseline fix Admin mirror must exist: ${adminMigration}`);
assert.equal(exists(storeMigration, repoRoot), true, `P5 baseline fix canonical Store migration must exist: ${storeMigration}`);

const adminSql = read(adminMigration);
const storeSql = read(storeMigration, repoRoot);
assert.equal(adminSql, storeSql, "P5 baseline fix Store/Admin migration mirrors must be byte-identical");

assert.match(storeSql, /create\s+or\s+replace\s+function\s+public\.register_project_proposal_accepted_artifact/i, "P5 baseline fix must replace the accepted-artifact registration RPC");
assert.doesNotMatch(storeSql, /accepted_revision_id/i, "P5 accepted-artifact registration must not reference a non-existent accepted_revision_id column");
assert.match(storeSql, /v_revision_state[^;]*accepted|revision_state[^;]*accepted/i, "P5 baseline fix must require accepted Revision state");
assert.match(storeSql, /v_proposal_status[^;]*accepted|proposal_status[^;]*accepted/i, "P5 baseline fix must require accepted Proposal status");
assert.match(storeSql, /customer_project_proposal_acceptances[\s\S]{0,500}revision_id/i, "P5 baseline fix must bind Acceptance to the exact Revision");
assert.match(storeSql, /customer_project_proposal_artifacts[\s\S]*proposal_revision_id/i, "P5 baseline fix must preserve immutable artifact idempotency by Proposal Revision");
assert.match(storeSql, /pg_advisory_xact_lock/i, "P5 baseline fix must preserve accepted-artifact concurrency serialization");
assert.match(storeSql, /register_customer_document/i, "P5 baseline fix must preserve canonical customer document registration");
assert.match(storeSql, /modulex\.project_proposal_artifact_lifecycle/i, "P5 baseline fix must preserve the lifecycle guard boundary");
assert.doesNotMatch(storeSql, /create\s+table|alter\s+table/i, "P5 compatibility fix must remain a focused RPC replacement without schema expansion");
assert.doesNotMatch(storeSql, /insert\s+into\s+public\.customer_orders|update\s+public\.customer_projects/i, "P5 baseline fix must not create Orders or mutate Project lifecycle");

console.log("Project Proposal P5 accepted-artifact baseline compatibility contract PASS");
