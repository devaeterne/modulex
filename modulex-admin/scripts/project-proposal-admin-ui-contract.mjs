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

const files = {
  workspace: "src/components/customers/ProjectDetailWorkspace.tsx",
  domain: "src/lib/customers/project-proposal-domain.ts",
  tab: "src/components/customers/project-detail/ProjectProposalTab.tsx",
  editor: "src/components/customers/project-detail/ProjectProposalEditor.tsx",
  areaList: "src/components/customers/project-detail/ProjectProposalAreaList.tsx",
  areaModal: "src/components/customers/project-detail/ProjectProposalAreaModal.tsx",
  groups: "src/components/customers/project-detail/ProjectProposalPricingGroups.tsx",
  revisions: "src/components/customers/project-detail/ProjectProposalRevisionHistory.tsx",
};

for (const [name, file] of Object.entries(files)) {
  assert.equal(exists(file), true, `Proposal Admin UI ${name} file must exist: ${file}`);
}

const workspace = read(files.workspace);
const domain = read(files.domain);
const tab = read(files.tab);
const editor = read(files.editor);
const areaList = read(files.areaList);
const areaModal = read(files.areaModal);
const groups = read(files.groups);
const revisions = read(files.revisions);
const ui = `${tab}\n${editor}\n${areaList}\n${areaModal}\n${groups}\n${revisions}`;

assert.match(workspace, /"Overview"\s*,\s*"Proposal"\s*,\s*"Orders"/, "Proposal tab must appear immediately before Orders");
assert.match(workspace, /ProjectProposalTab/, "Project Detail must render the focused Proposal tab component");
assert.doesNotMatch(workspace, /router\.push\(["'`]\/proposals/, "P2 must not introduce a top-level /proposals route");

for (const rpc of [
  "get_project_proposals",
  "get_project_proposal",
  "get_proposal_area_types",
  "create_project_proposal",
  "update_project_proposal_draft",
  "upsert_project_proposal_area",
  "delete_project_proposal_area",
  "upsert_project_proposal_pricing_group",
  "delete_project_proposal_pricing_group",
]) {
  assert.ok(domain.includes(rpc), `Proposal domain client must use canonical RPC ${rpc}`);
}

assert.match(domain, /normalizeOptionalNumber/, "Proposal domain must centralize optional numeric normalization");
assert.match(domain, /return\s+null/, "Empty optional Proposal values must normalize to NULL");
assert.doesNotMatch(domain, /Number\([^)]*\)\s*\|\|\s*0/, "Optional numeric normalization must not coerce empty values to zero");
assert.match(domain, /PROPOSAL_[A-Z0-9_]+/, "Proposal domain must map authoritative RPC/domain errors");
assert.match(domain, /direct_sell_amount:\s*directSellAmount/, "Domain client must map typed directSellAmount to the canonical direct_sell_amount payload");
assert.match(domain, /pricing_group_id:\s*pricingGroupId/, "Domain client must map typed pricingGroupId to the canonical pricing_group_id payload");
assert.match(domain, /internal_notes:\s*normalizeOptionalText\(area\.internalNotes\)/, "Domain client must map Internal Notes explicitly without leaking it into customer-facing fields");
assert.match(domain, /sell_amount:\s*sellAmount/, "Domain client must map typed Pricing Group sellAmount to canonical sell_amount");

assert.match(tab, /Loading Proposal/i, "Proposal tab must expose an explicit loading state");
assert.match(tab, /Create Proposal/i, "Proposal tab must expose an empty-state Create Proposal action");
assert.match(tab, /Retry/i, "Proposal tab must expose retry for load failures");
assert.match(tab, /permission|access restricted|not have permission/i, "Proposal tab must expose permission-denied state");
assert.match(tab, /proposal_total/, "Proposal total displayed by the UI must come from the server read model");

for (const label of ["Area Type", "Area Name", "Readiness", "Status Note"]) {
  assert.ok(areaModal.includes(label), `Area editor default form must contain ${label}`);
}
for (const section of ["Material", "Measurements", "Edge / Backsplash", "Sink / Cutout", "Scope Notes", "Internal Notes", "Pricing"]) {
  assert.ok(areaModal.includes(section), `Area editor must expose optional section ${section}`);
}
assert.match(areaModal, /allowEmpty/, "Area Type and optional selectors must allow an empty value");
assert.match(areaModal, /directSellAmount/, "Area editor must support typed direct pricing");
assert.match(areaModal, /pricingGroupId/, "Area editor must support typed Pricing Group assignment");
assert.match(areaModal, /disabled=.*pricing|pricing.*disabled=/is, "Area editor must make direct/group pricing exclusivity visible in the UI");
assert.match(areaModal, /internalNotes/, "Area editor must keep Internal Notes as a distinct internal-only field");

assert.match(groups, /sellAmount/, "Pricing Group UI must edit one authoritative typed group sell amount");
assert.match(groups, /member|Area/i, "Pricing Group UI must show Area membership without allocating the group price");
assert.doesNotMatch(groups, /sellAmount\s*\/|\/\s*areas?\.length/i, "Pricing Group UI must never allocate group price across Areas");

assert.match(areaList, /Move up|Move down|Reorder/i, "Area list must support ordering without changing commercial values");
assert.match(revisions, /Revision/i, "P2 must surface revision history read-only while lifecycle actions remain P3");
assert.doesNotMatch(revisions, /accept_project_proposal_revision|send_project_proposal_revision|reject_project_proposal_revision/, "P2 revision history must not implement P3 send/reject/accept actions");

for (const primitive of ["ComponentCard", "Button", "Modal", "Label", "Input", "Select", "TextArea"]) {
  assert.ok(ui.includes(primitive), `Proposal UI must compose shared Modulex primitive ${primitive}`);
}
assert.doesNotMatch(ui, /<button\b|<input\b|<select\b|<textarea\b|<label\b/, "Proposal feature UI must not introduce native route-local controls");
assert.doesNotMatch(ui, /\bbg-(?:red|blue|green|yellow|gray|slate|stone|zinc|neutral|white|black)-/, "Proposal feature UI must not own route-local appearance colors");

console.log("Project Proposal Admin UI contract PASS");
await import("./project-proposal-lifecycle-ui-contract.mjs");
