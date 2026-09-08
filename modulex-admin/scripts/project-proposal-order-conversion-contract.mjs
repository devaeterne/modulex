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

const migrationName = "20260908190000_project_proposal_order_conversion.sql";
const adminMigration = `supabase/migrations/${migrationName}`;
const storeMigration = `modulex-store/supabase/migrations/${migrationName}`;
const files = {
  domain: "src/lib/customers/project-proposal-order-conversion-domain.ts",
  ui: "src/components/customers/project-detail/ProjectProposalOrderConversion.tsx",
  proposalTab: "src/components/customers/project-detail/ProjectProposalTab.tsx",
};

assert.equal(exists(adminMigration), true, `P6 Admin migration mirror must exist: ${adminMigration}`);
assert.equal(exists(storeMigration, repoRoot), true, `P6 canonical Store migration must exist: ${storeMigration}`);

const adminSql = read(adminMigration);
const storeSql = read(storeMigration, repoRoot);
assert.equal(adminSql, storeSql, "P6 Admin migration mirror must be byte-identical to canonical Store migration");

for (const [name, file] of Object.entries(files)) {
  assert.equal(exists(file), true, `P6 ${name} file must exist: ${file}`);
}

for (const token of [
  "customer_project_proposal_order_conversions",
  "customer_project_proposal_order_conversion_areas",
  "create_order_from_accepted_project_proposal",
  "get_project_proposal_order_conversions",
  "create_project_customer_order",
  "manual_service",
  "SERVICE",
  "idempotency_key",
]) {
  assert.ok(storeSql.includes(token), `P6 canonical migration must contain ${token}`);
}

assert.match(storeSql, /proposal_revision_id[\s\S]{0,400}accepted|state[\s\S]{0,300}accepted/i, "P6 must require the exact accepted Proposal Revision");
assert.match(storeSql, /accepted_revision_id/i, "P6 must validate Proposal accepted_revision_id");
assert.match(storeSql, /jsonb_array_length|cardinality|array_length/i, "P6 must reject an empty Area selection");
assert.match(storeSql, /PROPOSAL_ORDER_AREA_SELECTION_REQUIRED/i, "P6 must expose a stable empty-selection domain error");
assert.match(storeSql, /PROPOSAL_ORDER_AREA_ALREADY_CONVERTED/i, "P6 must reject already-converted Areas");
assert.match(storeSql, /PROPOSAL_ORDER_PRICING_GROUP_PARTIAL/i, "P6 must reject partial Pricing Group conversion");
assert.match(storeSql, /pg_advisory_xact_lock|for\s+update/i, "P6 conversion must serialize authoritative source rows");
assert.match(storeSql, /unique\s*\([^)]*idempotency_key[^)]*\)|create\s+unique\s+index[^;]*idempotency/i, "P6 must enforce idempotency in the database");
assert.match(storeSql, /unique\s*\([^)]*proposal_area_id[^)]*\)|create\s+unique\s+index[^;]*proposal_area_id/i, "P6 must prevent one accepted Area from silently converting twice");
assert.match(storeSql, /pricing_group_id[\s\S]*order_item_id|order_item_id[\s\S]*pricing_group_id/i, "P6 source links must preserve Pricing Group and generated Order item linkage");
assert.match(storeSql, /sell_amount/i, "P6 Pricing Group line must use the authoritative group sell amount");
assert.match(storeSql, /direct_sell_amount/i, "P6 direct Area line must use the authoritative Area sell amount");
assert.match(storeSql, /coalesce\([^)]*direct_sell_amount[^)]*,\s*0|direct_sell_amount[\s\S]{0,160}\b0\b/i, "P6 may preserve an explicitly selected unpriced Area as zero-value scope without inventing price");
assert.match(storeSql, /pricing_group[\s\S]{0,500}(?:count|array_agg|not exists|exists)/i, "P6 must validate full Pricing Group membership rather than allocating group price");
assert.doesNotMatch(storeSql, /sell_amount\s*\/|\/\s*(?:count|cardinality|array_length)/i, "P6 must never allocate Pricing Group sell amount across Areas");

assert.match(storeSql, /internal_notes/i, "P6 implementation must explicitly reason about Order/internal notes boundary");
for (const forbiddenSnapshot of ["measurement_notes", "readiness_status", "supplier_snapshot"]) {
  assert.match(storeSql, new RegExp(forbiddenSnapshot, "i"), `P6 migration must explicitly exclude ${forbiddenSnapshot} from customer-safe Service line snapshots`);
}
assert.match(storeSql, /line_note/i, "P6 must preserve Proposal origin/scope snapshot in canonical Service line notes");
assert.doesNotMatch(storeSql, /insert\s+into\s+public\.(?:project_procurement|shipments|installations|customer_invoices|calendar_)/i, "P6 must not create Procurement/Fulfillment/Invoice/Calendar truth");
assert.doesNotMatch(storeSql, /update\s+public\.customer_project_proposal_(?:revisions|areas|pricing_groups)/i, "P6 must not mutate immutable Proposal baseline");

assert.match(storeSql, /revoke\s+all[\s\S]*from\s+public/i, "P6 must revoke PUBLIC access");
assert.doesNotMatch(storeSql, /grant\s+.*\s+to\s+anon/i, "P6 must not expose conversion tables/RPCs to anon");
assert.match(storeSql, /super_admin[\s\S]*admin[\s\S]*sales/i, "P6 mutation authorization must align with projects.manage roles");
assert.match(storeSql, /super_admin[\s\S]*admin[\s\S]*sales[\s\S]*finance/i, "P6 read authorization must align with projects.view roles");
assert.match(storeSql, /enable\s+row\s+level\s+security/i, "P6 provenance tables must enable RLS");
assert.match(storeSql, /immutable|lifecycle/i, "P6 provenance must be append-safe/immutable");

const domain = read(files.domain);
const ui = read(files.ui);
const proposalTab = read(files.proposalTab);

assert.match(domain, /create_order_from_accepted_project_proposal/, "P6 domain client must call the canonical conversion RPC");
assert.match(domain, /get_project_proposal_order_conversions/, "P6 domain client must expose conversion history");
assert.match(domain, /idempotency/i, "P6 domain client must preserve a retry idempotency key");
assert.match(domain, /PROPOSAL_ORDER_/i, "P6 domain client must map stable conversion domain errors");
assert.doesNotMatch(domain, /subtotal|tax_amount|grand_total|sellAmount\s*\+|sellAmount\s*\*/i, "P6 browser domain must not duplicate Order arithmetic");

for (const primitive of ["ComponentCard", "Button", "Alert", "Modal"]) {
  assert.ok(ui.includes(primitive), `P6 UI must compose shared Modulex primitive ${primitive}`);
}
assert.match(ui, /Create Draft Order/i, "P6 UI must expose an explicit conversion action");
assert.match(ui, /accepted/i, "P6 UI must make the accepted baseline requirement visible");
assert.match(ui, /converted|Order/i, "P6 UI must show already-converted Area/order history");
assert.match(ui, /Retry|retry/i, "P6 UI must expose retry behavior");
assert.match(ui, /crypto\.randomUUID|idempotency/i, "P6 UI must generate/preserve idempotency for duplicate-submit safety");
assert.doesNotMatch(ui, /<button\b|<input\b|<select\b|<table\b/, "P6 UI must not introduce native route-local controls/tables");
assert.match(proposalTab, /ProjectProposalOrderConversion/, "Proposal tab must render the focused P6 conversion surface");
assert.doesNotMatch(proposalTab, /createOrderFromAcceptedProjectProposal\([^)]*\).*acceptProjectProposalRevision|acceptProjectProposalRevision[\s\S]{0,500}createOrderFromAcceptedProjectProposal/i, "Proposal acceptance must not auto-create an Order");

console.log("Project Proposal P6 order conversion contract PASS");
