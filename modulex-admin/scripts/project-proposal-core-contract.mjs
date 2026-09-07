import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const migrationPath = "../modulex-store/supabase/migrations/20260907203000_project_proposal_core.sql";
const sqlPath = "sql/project-proposal-core.sql";

for (const [file, message] of [
  [migrationPath, "Proposal Core canonical migration must exist"],
  [sqlPath, "Proposal Core Admin SQL mirror must exist"],
]) {
  assert.equal(exists(file), true, message);
}

const migration = read(migrationPath);
const sql = read(sqlPath);
assert.equal(migration, sql, "Proposal Core Admin SQL mirror and Supabase migration must stay byte-identical");

const dbSql = `${migration}\n${sql}`;

for (const table of [
  "proposal_area_types",
  "customer_project_proposals",
  "customer_project_proposal_revisions",
  "customer_project_proposal_pricing_groups",
  "customer_project_proposal_areas",
  "customer_project_proposal_acceptances",
]) {
  assert.match(dbSql, new RegExp(`create\\s+table[\\s\\S]*${table}`, "i"), `Proposal Core must create ${table}`);
}

for (const rpc of [
  "get_project_proposals",
  "get_project_proposal",
  "get_proposal_area_types",
  "create_project_proposal",
  "create_project_proposal_revision",
  "update_project_proposal_draft",
  "upsert_project_proposal_area",
  "delete_project_proposal_area",
  "upsert_project_proposal_pricing_group",
  "delete_project_proposal_pricing_group",
  "send_project_proposal_revision",
  "reject_project_proposal_revision",
  "accept_project_proposal_revision",
]) {
  assert.match(dbSql, new RegExp(rpc, "i"), `Proposal Core DB boundary must contain ${rpc}`);
}

assert.match(dbSql, /draft[\s\S]*sent[\s\S]*accepted[\s\S]*rejected[\s\S]*superseded/i, "Proposal commercial lifecycle must be explicit");
assert.match(dbSql, /not_ready[\s\S]*ready_to_measure[\s\S]*needs_remeasure[\s\S]*ready_to_cut/i, "Area readiness states must be explicit and separate");
assert.match(dbSql, /area_name\s+text\s+not\s+null/i, "Area Name must be required free text");
assert.match(dbSql, /area_type_id\s+uuid\s+null/i, "Area Type must remain optional");
assert.match(dbSql, /direct_sell_amount[\s\S]*pricing_group_id[\s\S]*(?:check|constraint)|pricing_group_id[\s\S]*direct_sell_amount[\s\S]*(?:check|constraint)/i, "Area direct pricing and Pricing Group membership must be mutually exclusive");
assert.match(dbSql, /PROPOSAL_PRICING_GROUP_REVISION_MISMATCH/i, "Cross-Revision Pricing Group assignment must fail closed");
assert.match(dbSql, /PROPOSAL_REVISION_IMMUTABLE/i, "Non-draft Revision content must be immutable");
assert.match(dbSql, /PROPOSAL_ACCEPTANCE_APPEND_ONLY/i, "Acceptance evidence must be append-safe");
assert.match(dbSql, /for\s+update/i, "Proposal lifecycle transitions must lock authoritative rows");
assert.match(dbSql, /pg_advisory_xact_lock/i, "Proposal numbering/revision creation must be concurrency-safe");
assert.match(dbSql, /customer_project_proposal_number_seq/i, "Proposal numbering must use a dedicated sequence");

assert.match(dbSql, /sum\s*\([^)]*direct_sell_amount|direct_total/i, "Proposal total must include ungrouped direct Area amounts");
assert.match(dbSql, /sum\s*\([^)]*sell_amount|group_total/i, "Proposal total must include Pricing Group amounts exactly once");
assert.match(dbSql, /proposal_total/i, "Proposal read model must expose a server-derived total");

assert.match(dbSql, /super_admin[\s\S]*admin[\s\S]*sales[\s\S]*finance/i, "Proposal read authorization must align with projects.view roles");
assert.match(dbSql, /super_admin[\s\S]*admin[\s\S]*sales/i, "Proposal mutation authorization must align with projects.manage roles");
assert.match(dbSql, /revoke\s+all[\s\S]*from\s+public/i, "Proposal direct table/RPC access must be revoked from PUBLIC");
assert.doesNotMatch(dbSql, /grant\s+.*\s+to\s+anon/i, "Proposal must not be exposed to anon/Store");
for (const table of [
  "proposal_area_types",
  "customer_project_proposals",
  "customer_project_proposal_revisions",
  "customer_project_proposal_pricing_groups",
  "customer_project_proposal_areas",
  "customer_project_proposal_acceptances",
]) {
  assert.match(dbSql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"), `${table} must enable RLS`);
}

assert.doesNotMatch(dbSql, /insert\s+into\s+public\.customer_orders|update\s+public\.customer_orders|insert\s+into\s+public\.finance_|insert\s+into\s+public\.project_procurement|insert\s+into\s+public\.shipments|insert\s+into\s+public\.installations|insert\s+into\s+public\.calendar_/i, "Proposal Core must not mutate canonical Order/Finance/Procurement/Fulfillment/Calendar truth");

const seeds = [
  "Kitchen",
  "Kitchen Island",
  "Bathroom",
  "Master Bathroom",
  "Powder Room",
  "Laundry",
  "Wet Bar",
  "Bar",
  "Pantry",
  "Fireplace",
  "Outdoor Kitchen",
  "Pool House",
  "Garage",
  "Basement",
  "Office",
  "Other",
];
for (const seed of seeds) {
  assert.ok(dbSql.includes(seed), `Proposal Area Type seed must include ${seed}`);
}

console.log("Project Proposal Core contract PASS");
