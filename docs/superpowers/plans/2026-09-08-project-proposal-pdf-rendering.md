# Project Proposal P4 PDF Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add exact-revision, customer-safe, server-rendered Proposal PDF preview/download to Modulex Admin without persisting PDFs or changing Proposal lifecycle/schema.

**Architecture:** A pure projection converts one exact Proposal Revision + Project + settings into a customer-facing PDF model. An authenticated Admin API route resolves the exact authorized Project/Proposal/Revision and invokes a Node-safe PDF renderer. Proposal Revision History exposes preview/download actions against that exact revision ID. P5 later reuses the same projection/renderer to persist accepted immutable bytes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase JS 2.x, existing Modulex Admin auth/RPC layers, Node server runtime, `sharp`, existing Modulex PDF primitives/conventions.

**Spec:** `docs/superpowers/specs/2026-09-08-project-proposal-pdf-rendering-design.md`

## Global Constraints

- Start from exact baseline `97663bdf4b384b805497ad239078669b7442195b` on `feat/project-proposal-pdf-rendering`.
- Do not persist Proposal PDFs in P4.
- Do not create Orders or mutate Project/Proposal lifecycle from PDF code.
- Do not add Supabase schema/RPC/RLS/grant/index changes or migrations.
- Preserve existing Proposal authorization; no service-role bypass for Proposal reads.
- `internal_notes`, readiness/status note, and measurement notes must never enter customer-facing projection/PDF.
- Grouped pricing renders one amount per Pricing Group; never allocate/repeat it across member Areas.
- Display the DB/RPC `proposalTotal` as authoritative total.
- Omit empty optional labels/sections.
- Reuse shared Admin primitives and pass `smoke:admin-ui-strict` for changed feature UI.
- Avoid `ProjectProposalEditor.tsx` and `ProjectDetailWorkspace.tsx` while open PR #369 changes them.
- Add no new workflow file; extend the existing Admin Project Base contract owner.

---

### Task 1: RED P4 contract and CI ownership

**Files:**
- Create: `modulex-admin/scripts/project-proposal-pdf-contract.mjs`
- Modify: `modulex-admin/scripts/project-proposal-admin-ui-contract.mjs`

**Interfaces:**
- Consumes: repository source files only.
- Produces: `node scripts/project-proposal-pdf-contract.mjs`, called by the existing Proposal/Admin Project Base contract chain.

- [ ] **Step 1: Write the failing contract**

Create a Node contract that reads the planned projection, route, renderer, and Revision History paths. Before implementation it must fail because those files/actions do not exist. Assertions must lock:

```js
assertFile("src/lib/customers/project-proposal-pdf-projection.ts");
assertFile("src/lib/documents/proposal-pdf-server.ts");
assertFile("src/app/api/admin/projects/[projectId]/proposals/[proposalId]/revisions/[revisionId]/pdf/route.ts");
assertContains(projection, "proposalTotal");
assertNotContains(projection, "internalNotes:");
assertNotContains(projection, "readinessStatus:");
assertNotContains(projection, "measurementNotes:");
assertContains(route, 'requirePermission(request, "projects.view")');
assertContains(route, "revisionId");
assertContains(history, "Preview PDF");
assertContains(history, "Download PDF");
assertNotContains(history, "createProjectCustomerOrder");
```

Also assert the pricing projection has one explicit `pricingGroups.map(...)` summary path and one direct-area pricing path, and no group amount is copied into Area entries.

- [ ] **Step 2: Wire it into the existing Proposal contract owner**

Add a child-process invocation from `project-proposal-admin-ui-contract.mjs` following its existing focused-contract pattern. Do not create a workflow.

- [ ] **Step 3: Run/observe RED**

Run the existing Admin Project Base workflow or the focused Node contract on the branch. Expected failure: missing P4 projection/renderer/route/action files, while pre-existing Proposal P1-P3 checks stay green.

- [ ] **Step 4: Commit RED**

Commit message:

```text
test(project): add Proposal P4 PDF contract
```

---

### Task 2: Pure customer-safe Proposal PDF projection

**Files:**
- Create: `modulex-admin/src/lib/customers/project-proposal-pdf-projection.ts`
- Test: `modulex-admin/scripts/project-proposal-pdf-contract.mjs`

**Interfaces:**
- Consumes: `CustomerProject`, `ProjectProposal`, `ProjectProposalRevision`, `GeneralSettings`.
- Produces:

```ts
export type ProjectProposalPdfProjection = {
  title: "Proposal / Estimate";
  proposalNumber: string;
  revisionNo: number;
  revisionState: ProjectProposalRevisionState;
  currencyCode: string;
  fileName: string;
  dates: Array<{ label: string; value: string }>;
  company: { name: string; lines: string[]; primaryLogoUrl: string | null; secondaryLogoUrl: string | null };
  customer: { name: string; lines: string[] };
  project: { number: string; name: string; jobSiteLines: string[] };
  customerMessage: string | null;
  areas: ProjectProposalPdfArea[];
  pricing: ProjectProposalPdfPriceEntry[];
  proposalTotal: number;
  termsText: string | null;
  acceptance: ProjectProposalPdfAcceptance | null;
};

export function buildProjectProposalPdfProjection(input: {
  project: CustomerProject;
  proposal: ProjectProposal;
  revision: ProjectProposalRevision;
  settings: GeneralSettings;
}): ProjectProposalPdfProjection;
```

- [ ] **Step 1: Extend RED assertions for concrete projection semantics**

Require sorted Areas, sorted Pricing Groups, direct pricing only when `pricingGroupId === null`, and exact-revision membership validation.

- [ ] **Step 2: Implement projection helpers**

Implement pure helpers:

```ts
function compact(values: Array<string | null | undefined>): string[];
function addressLines(snapshot: Record<string, unknown> | null): string[];
function areaDetails(area: ProjectProposalArea): Array<{ label: string; value: string }>;
function pricingEntries(revision: ProjectProposalRevision): ProjectProposalPdfPriceEntry[];
```

`areaDetails` may include only customer-facing fields listed in the spec. Do not reference `internalNotes`, `readinessStatus`, `statusNote`, or `measurementNotes` anywhere in the returned projection.

- [ ] **Step 3: Implement exact revision guard**

Fail if `proposal.revisions` does not contain `revision.id`:

```ts
if (!input.proposal.revisions.some((entry) => entry.id === input.revision.id)) {
  throw new Error("Proposal revision does not belong to this Proposal.");
}
```

- [ ] **Step 4: Implement pricing projection**

```ts
const grouped = [...revision.pricingGroups]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((group) => ({ kind: "group" as const, label: group.label, description: group.description, amount: group.sellAmount }));

const direct = [...revision.areas]
  .filter((area) => !area.pricingGroupId && area.directSellAmount !== null)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((area) => ({ kind: "area" as const, label: area.areaName, description: null, amount: area.directSellAmount! }));
```

Keep `proposalTotal: revision.proposalTotal` unchanged.

- [ ] **Step 5: Run focused contract until GREEN for projection assertions**

Expected: projection assertions pass; route/renderer/UI assertions still fail.

- [ ] **Step 6: Commit**

```text
feat(project): add Proposal PDF projection
```

---

### Task 3: Node-safe Proposal PDF renderer

**Files:**
- Create: `modulex-admin/src/lib/documents/proposal-pdf-server.ts`
- Modify only if needed for reusable non-DOM helpers: `modulex-admin/src/lib/documents/pdf.ts`
- Test: `modulex-admin/scripts/project-proposal-pdf-contract.mjs`

**Interfaces:**
- Consumes: `ProjectProposalPdfProjection`.
- Produces:

```ts
export async function renderProjectProposalPdf(
  projection: ProjectProposalPdfProjection,
): Promise<Uint8Array>;
```

- [ ] **Step 1: Extend RED contract for server-only renderer**

Assert the renderer does not use `document.createElement`, `new Image`, `window`, or browser download APIs. Assert it accepts the projection and returns PDF bytes.

- [ ] **Step 2: Implement low-level PDF byte writer**

Use the established raw-PDF object/xref approach already present in `src/lib/documents/pdf.ts` rather than adding a library. Keep functions local/focused: text escaping, wrapping, drawing rules, page object assembly, pagination.

- [ ] **Step 3: Implement server logo loading**

```ts
async function loadServerLogo(url: string | null): Promise<PdfImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const input = Buffer.from(await response.arrayBuffer());
    const normalized = await sharp(input).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(normalized.data), width: normalized.info.width, height: normalized.info.height };
  } catch {
    return null;
  }
}
```

Logo failure alone must not reject rendering.

- [ ] **Step 4: Render Proposal pages**

First page order:

1. company/logo header;
2. Proposal number + `Revision N` + state/date/validity;
3. Customer and Project/job site;
4. optional customer message;
5. Area scope blocks.

Continue Area blocks onto subsequent pages as needed. Final page renders pricing summary, authoritative total, optional terms, optional acceptance evidence.

Do not place grouped sell amounts inside Area blocks.

- [ ] **Step 5: Keep pagination non-truncating**

Wrap all strings to fixed character widths and carry overflow rows/Area blocks to continuation pages. Do not use `.slice(0, N)` to discard customer scope or terms content.

- [ ] **Step 6: Run focused contract**

Expected: renderer/projection assertions pass; route/UI may still fail.

- [ ] **Step 7: Commit**

```text
feat(project): render Proposal PDF server-side
```

---

### Task 4: Authenticated exact-revision PDF API

**Files:**
- Create: `modulex-admin/src/app/api/admin/projects/[projectId]/proposals/[proposalId]/revisions/[revisionId]/pdf/route.ts`
- Create if needed: `modulex-admin/src/lib/customers/project-proposal-server-read.ts`
- Test: `modulex-admin/scripts/project-proposal-pdf-contract.mjs`

**Interfaces:**
- HTTP GET path parameters: `projectId`, `proposalId`, `revisionId`.
- Query: `download=1` for attachment disposition; otherwise inline.
- Response: `application/pdf`.

- [ ] **Step 1: Extend RED contract for auth/scope rules**

Require `projects.view`, exact three IDs, fail-closed Project/Proposal/revision ownership checks, and `application/pdf`/content disposition headers.

- [ ] **Step 2: Preserve user authorization on server reads**

Use `requirePermission(request, "projects.view")` to resolve the actor and token. For Proposal RPC reads, construct/use an authenticated Supabase client carrying the request bearer token so the existing Proposal RPC role guards remain authoritative. Do not read Proposal tables directly with `supabaseAdmin`.

If a focused helper is needed, expose:

```ts
export async function getProjectProposalPdfSource(input: {
  accessToken: string;
  projectId: string;
  proposalId: string;
  revisionId: string;
}): Promise<{ project: CustomerProject; proposal: ProjectProposal; revision: ProjectProposalRevision; settings: GeneralSettings }>;
```

- [ ] **Step 3: Validate exact ownership**

```ts
if (proposal.projectId !== projectId) return jsonError("Proposal not found.", 404);
const revision = proposal.revisions.find((entry) => entry.id === revisionId);
if (!revision) return jsonError("Proposal revision not found.", 404);
```

Project read must also be scoped to `projectId` through the existing Project read contract.

- [ ] **Step 4: Build projection and render**

Call only:

```ts
const projection = buildProjectProposalPdfProjection({ project, proposal, revision, settings });
const bytes = await renderProjectProposalPdf(projection);
```

- [ ] **Step 5: Return safe headers**

Use `projection.fileName` after projection-side filename sanitization. Return `inline` by default and `attachment` only for `download=1`.

- [ ] **Step 6: Run focused contract**

Expected: route/projection/renderer assertions pass; UI assertions may remain RED.

- [ ] **Step 7: Commit**

```text
feat(project): add Proposal PDF API
```

---

### Task 5: Exact-revision Preview / Download UI

**Files:**
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectProposalRevisionHistory.tsx`
- Create: `modulex-admin/src/lib/customers/project-proposal-pdf-client.ts`
- Modify if needed to pass Project/Proposal IDs: `modulex-admin/src/components/customers/project-detail/ProjectProposalTab.tsx`
- Test: `modulex-admin/scripts/project-proposal-pdf-contract.mjs`

**Interfaces:**
- Client helper:

```ts
export async function fetchProjectProposalPdf(input: {
  projectId: string;
  proposalId: string;
  revisionId: string;
  download?: boolean;
}): Promise<Blob>;
```

- [ ] **Step 1: Extend RED UI assertions**

Require shared `Button`, exact `revision.id`, duplicate-click loading state, error `Alert`, Preview PDF and Download PDF labels, and no lifecycle/order mutation imports.

- [ ] **Step 2: Implement authenticated Blob fetch**

The existing generic `authenticatedFetch<T>` assumes JSON, so implement a focused bearer Blob helper using the same session/refresh behavior instead of corrupting PDF bytes with `.json()`.

- [ ] **Step 3: Add Preview action**

Fetch exact-revision Blob, create object URL, open a new tab, and revoke the URL after the tab has received it. If popup blocking prevents opening, surface an error instead of silently failing.

- [ ] **Step 4: Add Download action**

Fetch with `download: true`, create a temporary anchor programmatically, set a safe filename derived from Proposal number + revision, click, remove and revoke URL.

- [ ] **Step 5: Add duplicate-submit/error state**

Track the active revision/action key. Disable the two PDF actions for the active revision while its request is running. Render a shared `Alert` for failures.

- [ ] **Step 6: Pass IDs without changing #369 overlap files**

If Revision History currently lacks `projectId`/`proposalId`, pass them from `ProjectProposalTab.tsx`. Do not touch `ProjectProposalEditor.tsx` or `ProjectDetailWorkspace.tsx`.

- [ ] **Step 7: Run focused P4 contract and strict UI contract**

Expected:

```text
node scripts/project-proposal-pdf-contract.mjs -> PASS
ADMIN_UI_STRICT_FILES=<changed-ui-files> npm run smoke:admin-ui-strict -> PASS
```

- [ ] **Step 8: Commit**

```text
feat(project): add Proposal PDF preview and download
```

---

### Task 6: Tracking, acceptance record, and final verification

**Files:**
- Create: `modulex-admin/docs/acceptance/project-proposal-p4.md`
- Modify: `docs/PROJECT_PROPOSAL_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces a review-ready P4 PR with implementation verification evidence; production remains pending until merge/deploy/live smoke.

- [ ] **Step 1: Record implementation acceptance**

Document baseline, branch, exact P4 scope, no migration, customer-data exclusions, grouped-pricing rule, RED evidence, GREEN evidence, and post-merge production gate.

- [ ] **Step 2: Update trackers accurately**

`PROJECT_PROPOSAL_PLAN.md`:

- keep P3 `[~]` until its production closeout actually occurs;
- mark P4 `[~] IMPLEMENTATION VERIFIED — PR ...; MERGE + LIVE ACCEPTANCE PENDING` only after final CI is green;
- check P4 scope boxes only for implemented/verified items.

`ADMIN_ROADMAP.md`:

- keep P3 production state truthful;
- mark P4 active/implementation-verified, not production accepted.

- [ ] **Step 3: Run final local/CI gates**

Required exact-head checks:

```text
project-proposal-pdf-contract
project-proposal-admin-ui-contract / Admin Project Base
Admin UI Foundation strict changed-file gate
RBAC
production-surface
TypeScript
lint
production build
```

No Supabase Advisor scan is required because no schema/RPC/RLS/grant/index changes are made.

- [ ] **Step 4: Review branch diff for scope leakage**

Confirm no migration, no Store files, no Proposal lifecycle mutation, no Order creation, no service secret in browser code, and no #369 overlap file except unavoidable shared docs.

- [ ] **Step 5: Create/update PR and wait for exact-head CI**

PR title:

```text
feat(project): add Proposal PDF rendering
```

PR body must include architecture, exclusions, TDD evidence, no-migration statement, parallel PR overlap review, and post-merge live acceptance gate.

- [ ] **Step 6: Final report**

Report branch, final head SHA, PR number, changed files, RED run, final GREEN runs, migration/deploy status, and remaining production acceptance steps.