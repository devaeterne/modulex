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
  projection: "src/lib/customers/project-proposal-pdf-projection.ts",
  renderer: "src/lib/documents/proposal-pdf-server.ts",
  route: "src/app/api/admin/projects/[projectId]/proposals/[proposalId]/revisions/[revisionId]/pdf/route.ts",
  client: "src/lib/customers/project-proposal-pdf-client.ts",
  history: "src/components/customers/project-detail/ProjectProposalRevisionHistory.tsx",
  tab: "src/components/customers/project-detail/ProjectProposalTab.tsx",
};

for (const [name, file] of Object.entries(files)) {
  assert.equal(exists(file), true, `Proposal P4 ${name} file must exist: ${file}`);
}

const projection = read(files.projection);
const renderer = read(files.renderer);
const route = read(files.route);
const client = read(files.client);
const history = read(files.history);
const tab = read(files.tab);
const p4 = `${projection}\n${renderer}\n${route}\n${client}\n${history}\n${tab}`;

assert.match(projection, /ProjectProposalPdfProjection/, "P4 must define a focused customer-facing Proposal PDF projection");
assert.match(projection, /buildProjectProposalPdfProjection/, "P4 must build the projection in a pure focused function");
assert.match(projection, /proposal\.revisions\.some|proposal\.revisions\.find/, "Projection must verify the exact Revision belongs to the Proposal");
assert.match(projection, /proposalTotal:\s*revision\.proposalTotal/, "PDF total must carry the DB-authoritative Proposal revision total");
assert.match(projection, /pricingGroups[^\n]*\.sort|\[\.\.\.revision\.pricingGroups\][\s\S]*\.sort/, "Pricing Groups must use stable sort order before rendering");
assert.match(projection, /kind:\s*["']group["']/, "Grouped pricing must have one explicit group-summary representation");
assert.match(projection, /kind:\s*["']area["']/, "Ungrouped direct Area pricing must have a distinct summary representation");
assert.match(projection, /!area\.pricingGroupId[\s\S]*area\.directSellAmount\s*!==\s*null/, "Direct prices must only render for ungrouped Areas with an amount");
assert.doesNotMatch(projection, /internalNotes|internal_notes/, "Internal Notes must never enter the customer-facing PDF projection");
assert.doesNotMatch(projection, /readinessStatus|readiness_status|statusNote|status_note|measurementNotes|measurement_notes/, "Operational readiness/status/measurement fields must stay out of the customer-facing PDF projection");
assert.doesNotMatch(projection, /sellAmount\s*\/|\/\s*[^\n]*areas?\.length/i, "P4 must never allocate grouped sell amount across Areas");

assert.match(renderer, /renderProjectProposalPdf/, "P4 must expose a server-side Proposal PDF renderer");
assert.match(renderer, /Promise<Uint8Array>|Promise\s*<\s*Uint8Array\s*>/, "Server Proposal PDF renderer must return PDF bytes");
assert.match(renderer, /from\s+["']sharp["']|require\(["']sharp["']\)/, "Server renderer must use existing sharp for logo normalization");
assert.doesNotMatch(renderer, /document\.createElement|new\s+Image\b|\bwindow\b/, "Server Proposal PDF renderer must not depend on browser DOM APIs");
assert.match(renderer, /pricing/, "Renderer must render the projection pricing summary");
assert.match(renderer, /proposalTotal/, "Renderer must render the authoritative Proposal total");

assert.match(route, /requirePermission\(request,\s*["']projects\.view["']\)/, "Proposal PDF route must require projects.view");
for (const param of ["projectId", "proposalId", "revisionId"]) {
  assert.ok(route.includes(param), `Proposal PDF route must bind exact ${param}`);
}
assert.match(route, /proposal\.projectId\s*!==\s*projectId|proposal\.project_id\s*!==\s*projectId/, "Proposal PDF route must fail closed on Project/Proposal mismatch");
assert.match(route, /revisions\.find\([^)]*revisionId|revision\.id\s*===\s*revisionId/, "Proposal PDF route must select the exact requested Revision");
assert.match(route, /application\/pdf/, "Proposal PDF route must return application/pdf");
assert.match(route, /Content-Disposition/i, "Proposal PDF route must control inline/download content disposition");
assert.doesNotMatch(route, /supabaseAdmin[\s\S]*customer_project_proposal|from\(["']customer_project_proposal/, "Proposal PDF route must not bypass Proposal RPC authorization with direct elevated table reads");

assert.match(client, /fetchProjectProposalPdf/, "P4 must expose an authenticated Proposal PDF Blob client");
assert.match(client, /getSession\(\)|refreshSession\(\)/, "Proposal PDF client must use the current authenticated session boundary");
assert.match(client, /response\.blob\(\)/, "Proposal PDF client must preserve binary PDF bytes instead of parsing JSON");

assert.match(history, /Preview PDF/, "Revision History must expose exact-revision PDF preview");
assert.match(history, /Download PDF/, "Revision History must expose exact-revision PDF download");
assert.match(history, /revision\.id/, "PDF actions must bind the exact Revision ID");
assert.match(history, /Button/, "P4 UI actions must use the shared Button primitive");
assert.match(history, /Alert/, "P4 UI must surface PDF generation errors through the shared Alert primitive");
assert.match(history, /busyPdf|pdfBusy|activePdf|pdfAction/i, "P4 UI must guard duplicate PDF requests");
assert.doesNotMatch(history, /<button\b/, "P4 UI must not introduce a native route-local button");

assert.doesNotMatch(p4, /createProjectCustomerOrder|create_project_customer_order|setCustomerProjectStatus|updateCustomerProject\(/, "P4 must not create Orders or mutate Project lifecycle");
assert.doesNotMatch(p4, /SUPABASE_SECRET_KEY|service_role|SERVICE_ROLE/, "P4 browser-facing source must not expose elevated Supabase credentials");

console.log("Project Proposal P4 PDF contract PASS");
