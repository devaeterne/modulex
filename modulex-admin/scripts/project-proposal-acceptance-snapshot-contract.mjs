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

const migrationName = "20260908170000_project_proposal_acceptance_snapshot.sql";
const adminMigration = `supabase/migrations/${migrationName}`;
const storeMigration = `modulex-store/supabase/migrations/${migrationName}`;
const files = {
  server: "src/lib/customers/project-proposal-artifact-server.ts",
  client: "src/lib/customers/project-proposal-artifact-client.ts",
  persistRoute: "src/app/api/admin/projects/[projectId]/proposals/[proposalId]/revisions/[revisionId]/accepted-artifact/route.ts",
  downloadRoute: "src/app/api/admin/projects/[projectId]/documents/[artifactId]/download/route.ts",
  documentsTab: "src/components/customers/project-detail/ProjectDocumentsTab.tsx",
  workspace: "src/components/customers/ProjectDetailWorkspace.tsx",
  lifecycle: "src/components/customers/project-detail/ProjectProposalLifecycleActions.tsx",
};

assert.equal(exists(adminMigration), true, `P5 Admin migration mirror must exist: ${adminMigration}`);
assert.equal(exists(storeMigration, repoRoot), true, `P5 canonical Store migration must exist: ${storeMigration}`);
const adminSql = read(adminMigration);
const storeSql = read(storeMigration, repoRoot);
assert.equal(adminSql, storeSql, "P5 Admin migration mirror must be byte-identical to canonical Store migration");

for (const [name, file] of Object.entries(files)) {
  assert.equal(exists(file), true, `P5 ${name} file must exist: ${file}`);
}

for (const sqlToken of [
  "customer_project_proposal_artifacts",
  "register_project_proposal_accepted_artifact",
  "get_project_proposal_artifact",
  "get_project_proposal_artifacts",
  "customer_documents",
  "content_sha256",
]) {
  assert.ok(storeSql.includes(sqlToken), `P5 canonical migration must contain ${sqlToken}`);
}
assert.match(storeSql, /unique\s*\([^)]*proposal_revision_id[^)]*\)/i, "P5 must enforce one accepted artifact per Proposal Revision");
assert.match(storeSql, /unique\s*\([^)]*acceptance_id[^)]*\)/i, "P5 must enforce one artifact per acceptance row");
assert.match(storeSql, /unique\s*\([^)]*customer_document_id[^)]*\)/i, "P5 must not link one canonical document to multiple Proposal artifacts");
assert.match(storeSql, /revision[^;]*state[^;]*accepted|state[^;]*accepted[^;]*revision/is, "P5 registration must validate accepted Revision state");
assert.match(storeSql, /accepted_revision_id/i, "P5 registration must validate Proposal accepted_revision_id");
assert.match(storeSql, /register_customer_document/i, "P5 must reuse the canonical customer document lifecycle");
assert.match(storeSql, /customer-documents/i, "P5 must reuse the existing customer-documents bucket");
assert.doesNotMatch(storeSql, /create\s+table[^;]*(?:proposal_documents|proposal_files)/i, "P5 must not create a parallel Proposal document table");

const server = read(files.server);
const client = read(files.client);
const persistRoute = read(files.persistRoute);
const downloadRoute = read(files.downloadRoute);
const documentsTab = read(files.documentsTab);
const workspace = read(files.workspace);
const lifecycle = read(files.lifecycle);

assert.match(server, /buildProjectProposalPdfProjection/, "Accepted artifact persistence must reuse the P4 customer-safe projection");
assert.match(server, /renderProjectProposalPdf/, "Accepted artifact persistence must reuse the P4 PDF renderer");
assert.match(server, /createHash\(["']sha256["']\)|SHA-256|sha256/i, "P5 must hash persisted PDF bytes with SHA-256");
assert.match(server, /customer-documents/, "P5 server persistence must use the existing customer-documents bucket");
assert.match(server, /upsert:\s*false/, "Accepted artifact upload must never overwrite existing bytes");
assert.match(server, /register_project_proposal_accepted_artifact/, "P5 server must use the canonical artifact registration RPC");
assert.doesNotMatch(server, /SUPABASE_SECRET_KEY|service[_-]?role/i, "P5 artifact persistence must not use service-role credentials");

assert.match(persistRoute, /projects\.manage/, "Accepted artifact creation must require Project management permission");
assert.match(persistRoute, /withApiTiming/, "P5 persistence route must use the canonical API timing wrapper");
assert.match(persistRoute, /accepted-artifact/, "P5 persistence route timing label must stay on the accepted-artifact surface");

assert.match(downloadRoute, /projects\.view/, "Stored artifact download must require Project view permission");
assert.match(downloadRoute, /get_project_proposal_artifact|getProjectProposalArtifact/, "Stored artifact download must resolve canonical artifact metadata");
assert.match(downloadRoute, /sha256|contentSha256/i, "Stored artifact download must verify the persisted hash before returning bytes");
assert.doesNotMatch(downloadRoute, /renderProjectProposalPdf|buildProjectProposalPdfProjection/, "Project Documents download must return stored bytes, never re-render the Proposal");
assert.match(downloadRoute, /Cache-Control[^\n]*private[^\n]*no-store|private,\s*no-store/i, "Stored Proposal downloads must be private and no-store");

assert.match(client, /ensureAcceptedProjectProposalArtifact/, "P5 client must expose idempotent accepted-artifact persistence");
assert.match(client, /getProjectProposalArtifacts/, "P5 client must expose Project document listing");
assert.match(client, /downloadProjectProposalArtifact/, "P5 client must expose stored artifact download");

for (const primitive of ["ComponentCard", "Button", "Alert", "Table", "TableStateRow", "TableViewport"]) {
  assert.ok(documentsTab.includes(primitive), `Project Documents must compose shared Modulex primitive ${primitive}`);
}
assert.match(documentsTab, /Loading|loading/i, "Project Documents must expose loading state");
assert.match(documentsTab, /No .*documents|No accepted Proposal/i, "Project Documents must expose empty state");
assert.match(documentsTab, /Retry/i, "Project Documents must expose retry after load failure");
assert.match(documentsTab, /Download/i, "Project Documents must expose stored PDF download");
assert.doesNotMatch(documentsTab, /<button\b|<table\b/, "Project Documents must not introduce native route-local controls/tables");
assert.match(workspace, /ProjectDocumentsTab/, "Project Detail Documents tab must render the real ProjectDocumentsTab");
assert.doesNotMatch(workspace, /title=["']Documents["'][\s\S]{0,300}Project document index will reuse/i, "P5 must remove the Documents placeholder");

assert.match(lifecycle, /ensureAcceptedProjectProposalArtifact/, "Accept lifecycle must trigger accepted-artifact persistence only after acceptance succeeds");
assert.match(lifecycle, /snapshot|artifact/i, "Accept lifecycle must expose accepted snapshot persistence state/error messaging");
assert.doesNotMatch(`${server}\n${persistRoute}\n${downloadRoute}`, /create_customer_order|customer_orders.*insert|update_customer_project_status/i, "P5 artifact flow must not create Orders or mutate Project lifecycle");

console.log("Project Proposal P5 acceptance snapshot contract PASS");
