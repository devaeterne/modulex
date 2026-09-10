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
const serviceUuidHotfixName = "20260910071500_project_proposal_order_service_uuid_fix.sql";
const adminServiceUuidHotfix = `supabase/migrations/${serviceUuidHotfixName}`;
const storeServiceUuidHotfix = `modulex-store/supabase/migrations/${serviceUuidHotfixName}`;
const files = {
  domain: "src/lib/customers/project-proposal-order-conversion-domain.ts",
  selector: "src/components/customers/project-detail/ProjectProposalOrderConversion.tsx",
  proposalTab: "src/components/customers/project-detail/ProjectProposalTab.tsx",
  newOrder: "src/components/customers/NewCustomerOrder.tsx",
  newOrderPage: "src/app/(admin)/customers/[id]/orders/new/page.tsx",
};

assert.equal(exists(adminMigration), true, `P6 Admin migration mirror must exist: ${adminMigration}`);
assert.equal(exists(storeMigration, repoRoot), true, `P6 canonical Store migration must exist: ${storeMigration}`);

const adminSql = read(adminMigration);
const storeSql = read(storeMigration, repoRoot);
assert.equal(adminSql, storeSql, "P6 Admin migration mirror must be byte-identical to canonical Store migration");

assert.equal(exists(adminServiceUuidHotfix), true, `P6 SERVICE UUID hotfix Admin mirror must exist: ${adminServiceUuidHotfix}`);
assert.equal(exists(storeServiceUuidHotfix, repoRoot), true, `P6 SERVICE UUID hotfix canonical migration must exist: ${storeServiceUuidHotfix}`);
const adminServiceUuidSql = exists(adminServiceUuidHotfix) ? read(adminServiceUuidHotfix) : "";
const storeServiceUuidSql = exists(storeServiceUuidHotfix, repoRoot) ? read(storeServiceUuidHotfix, repoRoot) : "";
assert.equal(adminServiceUuidSql, storeServiceUuidSql, "P6 SERVICE UUID hotfix Admin mirror must be byte-identical to canonical Store migration");
assert.match(storeServiceUuidSql, /array_agg\(p\.id\s+order\s+by\s+p\.id\)\)\[1\]/i, "P6 SERVICE lookup must use a deterministic UUID-safe aggregate");
assert.doesNotMatch(storeServiceUuidSql, /min\s*\(\s*p\.id\s*\)/i, "P6 SERVICE lookup must not call unsupported min(uuid)");
assert.match(storeServiceUuidSql, /create_order_from_accepted_project_proposal/i, "P6 SERVICE UUID hotfix must repair the canonical conversion RPC");

for (const [name, file] of Object.entries(files)) {
  assert.equal(exists(file), true, `P6 ${name} file must exist: ${file}`);
}

for (const token of [
  "customer_project_proposal_order_conversions",
  "customer_project_proposal_order_conversion_lines",
  "customer_project_proposal_order_conversion_areas",
  "create_order_from_accepted_project_proposal",
  "get_project_proposal_order_conversion_preview",
  "get_project_proposal_order_conversions",
  "get_customer_order_proposal_origin",
  "create_project_customer_order",
  "customer_order_visible_line_pricing",
  "customer_visible_sell_amount",
  "manual_service",
  "SERVICE",
  "idempotency_key",
  "request_fingerprint",
]) {
  assert.ok(storeSql.includes(token), `P6 canonical migration must contain ${token}`);
}

assert.match(storeSql, /state\s*=\s*'accepted'|state\s*<>\s*'accepted'/i, "P6 must require the exact accepted Proposal Revision");
assert.match(storeSql, /customer_project_proposal_acceptances/i, "P6 must require immutable acceptance evidence for the exact Revision");
assert.doesNotMatch(storeSql, /customer_project_proposals[^;\n]*accepted_revision_id|accepted_revision_id/i, "P6 must not invent a non-canonical Proposal accepted_revision_id column");
assert.match(storeSql, /jsonb_array_length|cardinality|array_length/i, "P6 must reject an empty Area selection");
assert.match(storeSql, /PROPOSAL_ORDER_AREA_SELECTION_REQUIRED/i, "P6 must expose a stable empty-selection domain error");
assert.match(storeSql, /PROPOSAL_ORDER_AREA_ALREADY_CONVERTED/i, "P6 must reject already-converted Areas");
assert.match(storeSql, /PROPOSAL_ORDER_PRICING_GROUP_PARTIAL/i, "P6 must reject partial Pricing Group conversion");
assert.match(storeSql, /PROPOSAL_ORDER_CURRENCY_MISMATCH/i, "P6 must fail closed rather than invent FX conversion");
assert.match(storeSql, /PROPOSAL_ORDER_IDEMPOTENCY_MISMATCH/i, "P6 must reject idempotency-key reuse for a different canonical request");
assert.match(storeSql, /PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED/i, "P6 must fail closed when accepted customer-visible cents cannot reconcile with Administrative Fee");
assert.match(storeSql, /pg_advisory_xact_lock|for\s+update/i, "P6 conversion must serialize authoritative source rows");
assert.match(storeSql, /unique\s*\([^)]*idempotency_key[^)]*\)|create\s+unique\s+index[^;]*idempotency/i, "P6 must enforce idempotency in the database");
assert.match(storeSql, /unique\s*\([^)]*proposal_area_id[^)]*\)|create\s+unique\s+index[^;]*proposal_area_id/i, "P6 must prevent one accepted Area from silently converting twice");
assert.match(storeSql, /pricing_group_id[\s\S]*initial_order_item_id|initial_order_item_id[\s\S]*pricing_group_id/i, "P6 conversion lines must preserve Pricing Group and generated Order item linkage");
assert.match(storeSql, /sell_amount/i, "P6 Pricing Group line must use the authoritative group sell amount");
assert.match(storeSql, /direct_sell_amount/i, "P6 ungrouped Area line must use the authoritative Area sell amount");
assert.match(storeSql, /coalesce\([^)]*direct_sell_amount[^)]*,\s*0|direct_sell_amount[\s\S]{0,160}\b0\b/i, "P6 preserves explicitly selected unpriced accepted Area scope as zero without inventing price");
assert.match(storeSql, /pricing_group[\s\S]{0,700}(?:count|array_agg|not exists|exists)/i, "P6 must validate full Pricing Group membership rather than allocating group price");
assert.doesNotMatch(storeSql, /sell_amount\s*\/|\/\s*(?:count|cardinality|array_length)/i, "P6 must never allocate Pricing Group sell amount across Areas");

assert.match(storeSql, /administrative_fee_percent/i, "P6 must preserve the selected Administrative Fee snapshot internally");
assert.match(storeSql, /base[_ ]?(?:sell|cent)|base_sell_amount_snapshot/i, "P6 must derive internal base sell rather than adding fee on top of accepted Proposal price");
assert.match(storeSql, /customer_order_visible_line_pricing/i, "P6 must verify the canonical customer-visible line projection after Order creation");
assert.doesNotMatch(storeSql, /unit_price[^\n;]{0,120}(?:direct_sell_amount|sell_amount)|(?:direct_sell_amount|sell_amount)[^\n;]{0,120}unit_price/i, "P6 must not blindly use accepted customer-visible Proposal amounts as base SERVICE unit prices before Administrative Fee");
assert.match(storeSql, /p_order_discount_amount[^\n]{0,100}\b0\b|order_discount[^\n]{0,100}\b0\b/i, "P6 initial conversion must not discount the accepted baseline a second time");

assert.match(storeSql, /internal_notes/i, "P6 must explicitly preserve the internal Order-notes boundary");
for (const forbiddenSnapshot of ["measurement_notes", "readiness_status", "supplier_snapshot"]) {
  assert.match(storeSql, new RegExp(forbiddenSnapshot, "i"), `P6 migration must explicitly exclude ${forbiddenSnapshot} from customer-safe Service line snapshots`);
}
assert.match(storeSql, /line_note/i, "P6 must preserve Proposal origin/scope in canonical Service line notes");
assert.doesNotMatch(storeSql, /insert\s+into\s+public\.(?:project_procurement|shipments|installations|customer_invoices|calendar_)/i, "P6 must not create Procurement/Fulfillment/Invoice/Calendar truth");
assert.doesNotMatch(storeSql, /update\s+public\.customer_project_proposal_(?:revisions|areas|pricing_groups)/i, "P6 must not mutate immutable Proposal baseline");

assert.match(storeSql, /revoke\s+all[\s\S]*from\s+public/i, "P6 must revoke PUBLIC access");
assert.doesNotMatch(storeSql, /grant\s+.*\s+to\s+anon/i, "P6 must not expose conversion tables/RPCs to anon");
assert.match(storeSql, /super_admin[\s\S]*admin[\s\S]*sales/i, "P6 mutation authorization must align with Proposal/Order manage roles");
assert.match(storeSql, /super_admin[\s\S]*admin[\s\S]*sales[\s\S]*finance/i, "P6 read authorization must align with Project/Proposal view roles");
assert.match(storeSql, /enable\s+row\s+level\s+security/i, "P6 provenance tables must enable RLS");
assert.match(storeSql, /PROPOSAL_ORDER_CONVERSION_IMMUTABLE|immutable/i, "P6 provenance must be append-safe/immutable");

const domain = read(files.domain);
const selector = read(files.selector);
const proposalTab = read(files.proposalTab);
const newOrder = read(files.newOrder);
const newOrderPage = read(files.newOrderPage);

assert.match(domain, /create_order_from_accepted_project_proposal/, "P6 domain client must call the canonical conversion RPC");
assert.match(domain, /get_project_proposal_order_conversion_preview/, "P6 domain client must expose authoritative selection/New Order preview");
assert.match(domain, /get_project_proposal_order_conversions/, "P6 domain client must expose conversion history");
assert.match(domain, /get_customer_order_proposal_origin/, "P6 domain client must expose internal Order origin");
assert.match(domain, /idempotency/i, "P6 domain client must preserve a retry idempotency key");
assert.match(domain, /PROPOSAL_ORDER_/i, "P6 domain client must map stable conversion domain errors");
assert.doesNotMatch(domain, /subtotal\s*[+*]|tax_amount\s*[+*]|sellAmount\s*[+*]/i, "P6 browser domain must not duplicate authoritative Order/Proposal arithmetic");

for (const primitive of ["ComponentCard", "Button", "Alert", "Modal"]) {
  assert.ok(selector.includes(primitive), `P6 selector must compose shared Modulex primitive ${primitive}`);
}
assert.match(selector, /Create Order from Proposal/i, "P6 selector must expose the explicit conversion workflow");
assert.match(selector, /Continue to Order/i, "P6 selector must continue into the existing New Order experience instead of creating a parallel editor");
assert.match(selector, /converted|Order/i, "P6 selector must show already-converted scope/order history");
assert.match(selector, /Retry|retry/i, "P6 selector must expose retry behavior");
assert.doesNotMatch(selector, /createOrderFromAcceptedProjectProposal\s*\(/, "P6 Proposal selector must not directly create the Order before New Order header review");
assert.doesNotMatch(selector, /<button\b|<input\b|<select\b|<table\b/, "P6 selector must not introduce native route-local controls/tables");
assert.match(proposalTab, /ProjectProposalOrderConversion/, "Proposal tab must render the focused P6 selection surface");
assert.doesNotMatch(proposalTab, /createOrderFromAcceptedProjectProposal\([^)]*\).*acceptProjectProposalRevision|acceptProjectProposalRevision[\s\S]{0,500}createOrderFromAcceptedProjectProposal/i, "Proposal acceptance must not auto-create an Order");

assert.match(newOrderPage, /proposalRevisionId/i, "Existing New Order page must accept explicit Proposal conversion source identity");
assert.match(newOrderPage, /proposalAreaIds/i, "Existing New Order page must carry selected Proposal Areas into conversion mode");
assert.match(newOrder, /proposalRevisionId/i, "Existing New Order component must support Proposal conversion mode");
assert.match(newOrder, /getProjectProposalOrderConversionPreview/i, "New Order conversion mode must re-read authoritative accepted Proposal preview");
assert.match(newOrder, /createOrderFromAcceptedProjectProposal/i, "New Order conversion save must use the authoritative P6 RPC client");
assert.match(newOrder, /Accepted Proposal/i, "New Order conversion mode must visibly identify the immutable accepted source");
assert.match(newOrder, /Order Discount[\s\S]{0,500}(?:disabled|0)/i, "P6 conversion mode must prevent a second Order discount from changing accepted scope");
assert.match(newOrder, /administrativeFee/i, "Administrative Fee remains visible internally in New Order conversion mode");

console.log("Project Proposal P6 order conversion contract PASS");
