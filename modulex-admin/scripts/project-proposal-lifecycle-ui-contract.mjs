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
  lifecycleDomain: "src/lib/customers/project-proposal-lifecycle-domain.ts",
  tab: "src/components/customers/project-detail/ProjectProposalTab.tsx",
  lifecycle: "src/components/customers/project-detail/ProjectProposalLifecycleActions.tsx",
  revisions: "src/components/customers/project-detail/ProjectProposalRevisionHistory.tsx",
};

assert.equal(exists(files.lifecycleDomain), true, "P3 must add a focused Proposal lifecycle domain extension");
assert.equal(exists(files.lifecycle), true, "P3 must add a focused ProjectProposalLifecycleActions component");

const domain = read(files.lifecycleDomain);
const tab = read(files.tab);
const lifecycle = read(files.lifecycle);
const revisions = read(files.revisions);
const p3ui = `${tab}\n${lifecycle}\n${revisions}`;

for (const rpc of [
  "create_project_proposal_revision",
  "send_project_proposal_revision",
  "reject_project_proposal_revision",
  "accept_project_proposal_revision",
]) {
  assert.ok(domain.includes(rpc), `P3 lifecycle domain must call canonical RPC ${rpc}`);
}

assert.match(domain, /p_idempotency_key/, "New revision creation must pass the canonical idempotency key");
assert.match(domain, /p_revision_note/, "New revision creation must preserve the optional revision note");
assert.match(domain, /p_accepted_name/, "Acceptance must bind evidence to the exact revision through accepted name");
assert.match(domain, /p_accepted_email/, "Acceptance must support optional accepted email evidence");
assert.match(domain, /p_acceptance_method/, "Acceptance must pass an explicit acceptance method");
assert.match(domain, /p_signature_text/, "Acceptance must support optional signature text evidence");
assert.match(domain, /normalizeRequiredText\([^)]*acceptedName|Accepted name is required/i, "Acceptance must require a non-empty accepted name before RPC submission");

assert.match(tab, /ProjectProposalLifecycleActions/, "Proposal tab must render the focused lifecycle action component");
assert.match(tab, /onChanged|refreshSelected/, "Lifecycle success must refresh the authoritative Proposal read model");

for (const label of ["Send Proposal", "New Revision", "Reject Proposal", "Accept Proposal"]) {
  assert.ok(lifecycle.includes(label), `P3 lifecycle UI must expose ${label}`);
}
assert.match(lifecycle, /state\s*===\s*["']draft["']/, "Send must be exposed only from a draft revision state");
assert.match(lifecycle, /state\s*===\s*["']sent["']/, "Accept/reject/new-revision actions must be gated to a sent revision state");
assert.match(lifecycle, /Change Order/i, "Accepted Proposal UX must direct later commercial changes to Project Change Orders");
assert.match(lifecycle, /acceptedName/, "Acceptance form must collect accepted name");
assert.match(lifecycle, /acceptedEmail/, "Acceptance form must support accepted email");
assert.match(lifecycle, /acceptanceMethod/, "Acceptance form must expose acceptance method evidence");
assert.match(lifecycle, /signatureText/, "Acceptance form must support signature text evidence");
assert.match(lifecycle, /rejectionNote/, "Reject flow must collect a rejection note");
assert.match(lifecycle, /revisionNote/, "New Revision flow must support a revision note");
assert.match(lifecycle, /crypto\.randomUUID\(\)/, "New Revision flow must generate an idempotency key client-side");
assert.match(lifecycle, /busy|submitting|saving/i, "Lifecycle mutations must expose a duplicate-submit guard");

assert.match(revisions, /sentAt|Sent/i, "Revision history must surface sent lifecycle evidence");
assert.match(revisions, /acceptedAt|Accepted/i, "Revision history must surface acceptance lifecycle evidence");
assert.match(revisions, /rejectedAt|Rejected/i, "Revision history must surface rejection lifecycle evidence");

assert.doesNotMatch(p3ui, /create_customer_order|createCustomerOrder|Create Order from Proposal/, "P3 acceptance must not auto-create or expose Proposal-to-Order conversion");
assert.doesNotMatch(p3ui, /set_customer_project_status|updateCustomerProjectStatus/, "P3 must not silently mutate canonical Project lifecycle status");
assert.doesNotMatch(p3ui, /<button\b|<input\b|<select\b|<textarea\b|<label\b/, "P3 must continue using shared Modulex UI primitives");

console.log("Project Proposal lifecycle UX contract PASS");
