# Project Proposal P4 PDF Rendering Design

## Status

Approved in chat on 2026-09-08. Implementation starts from `main` commit `97663bdf4b384b805497ad239078669b7442195b` on isolated branch `feat/project-proposal-pdf-rendering`.

## Goal

Render an authorized, customer-facing PDF for an exact Project Proposal Revision without introducing a second commercial truth, a parallel document store, or browser-only PDF generation that cannot be reused by P5 acceptance persistence.

## Locked boundaries

- Structured Proposal Revision data remains canonical; PDF is rendered output only.
- P4 does not persist Proposal PDFs. Immutable accepted-artifact persistence remains P5.
- P4 does not create Orders or mutate Project lifecycle.
- P4 does not add or modify Supabase schema, RLS, grants, RPCs, migrations, Store/Portal exposure, Finance, Procurement, Fulfillment, or Change Orders.
- PDF rendering is exact-revision based. Revision N output never silently reads Revision N+1.
- Proposal DB/RPC derived `proposal_total` remains authoritative. Browser arithmetic is not commercial truth.
- `internal_notes` must never enter the customer-facing projection or PDF renderer.
- Area readiness/status note and measurement notes are operational and excluded from the customer-facing P4 document.
- Empty optional fields and empty sections are omitted instead of rendered as blank labels.
- Grouped pricing is rendered exactly once per Pricing Group. Member Areas show group membership without repeating the group sell amount.
- Direct Area pricing appears only for ungrouped Areas that have `direct_sell_amount`.
- Existing Modulex branding/settings conventions are reused.
- No Chromium/Puppeteer dependency is added. Existing Node/Next.js primitives and `sharp` are sufficient.

## Current reusable Modulex document architecture

Modulex already has:

- `src/components/documents/CommercialDocument.tsx` for branded A4 preview/print UX.
- `src/lib/documents/types.ts` for commercial document presentation types.
- `src/lib/documents/pdf.ts` for PDF byte construction and logo embedding.
- `CustomerOrderPrint.tsx` / invoice equivalents that project business data into presentation models.

The current PDF implementation is browser-oriented because logo loading uses DOM `Image`/canvas. P4 therefore must not directly call that browser-only renderer from a server route. Instead, P4 gets a focused server-safe renderer that reuses the same branding and document conventions while keeping Proposal-specific layout independent from Order/Invoice line-table assumptions.

## Architecture

### 1. Customer-safe exact-revision projection

Create `modulex-admin/src/lib/customers/project-proposal-pdf-projection.ts`.

It owns pure transformation from:

- `CustomerProject`
- `ProjectProposal`
- one selected `ProjectProposalRevision`
- company/general settings

into a serializable `ProjectProposalPdfProjection`.

Projection responsibilities:

- reject a revision that does not belong to the Proposal;
- expose Proposal number and exact revision number/state;
- expose Proposal created/revision-created/sent/accepted timestamps as available;
- expose customer name, Project number/name and job-site address snapshot;
- expose customer message and terms when present;
- expose Area scope in stable `sortOrder` order;
- include customer-facing material, finish, thickness, sq ft, linear ft, edge, backsplash, sink/cutout and scope-note details when present;
- omit readiness status, status note, measurement notes and `internal_notes`;
- build pricing summary with every Pricing Group exactly once, then direct-priced Areas;
- carry the DB/RPC `proposalTotal` unchanged as the authoritative total;
- include acceptance metadata only when that exact revision has acceptance evidence.

No database access and no PDF byte generation occurs in this file. It is deterministic and contract-testable.

### 2. Authenticated server read boundary

Create a route under:

`modulex-admin/src/app/api/admin/projects/[projectId]/proposals/[proposalId]/revisions/[revisionId]/pdf/route.ts`

The browser calls it with the existing bearer-session convention.

The route:

1. requires `projects.view` authorization using the existing Admin API auth helper;
2. loads the exact Project and exact Proposal through their existing authoritative read boundaries;
3. verifies Proposal `projectId` equals the path Project ID;
4. selects only the requested revision ID and returns 404/403-style fail-closed responses when the exact scope is unavailable;
5. loads company/general settings required for branding;
6. builds the pure Proposal PDF projection;
7. renders PDF bytes server-side;
8. returns `application/pdf` with `Content-Disposition` controlled by `?download=1`.

The route must not use a service-role read to bypass Proposal authorization. If server-side use of existing browser-oriented domain wrappers is technically unsuitable, the route may perform the same guarded RPC calls with the authenticated user token, but it must preserve the Proposal RPC authorization boundary.

### 3. Server-safe Proposal PDF renderer

Create focused document code under `modulex-admin/src/lib/documents/`:

- `proposal-pdf-types.ts` for the renderer input contract if needed outside the projection file.
- `proposal-pdf-server.ts` for PDF byte generation.

The renderer is Node-safe and receives already-sanitized projection data. It does not know about Supabase or Proposal internal fields.

It renders A4 portrait pages with:

- Modulex company/header branding and configured logos;
- Proposal title/number/revision/status metadata;
- Customer and Project/job-site blocks;
- optional customer message;
- Area-by-Area scope blocks;
- pricing summary;
- Proposal Total;
- optional terms;
- optional acceptance/signature metadata.

Long Area content paginates deterministically. No customer-facing field is silently truncated without a continuation strategy.

Remote logo assets are fetched server-side and normalized with `sharp` where needed. Logo failure is non-fatal: company text remains and PDF generation continues without the failed image.

### 4. Proposal Admin UX

Avoid `ProjectProposalEditor.tsx` and `ProjectDetailWorkspace.tsx` because open PR #369 currently changes them.

Extend `ProjectProposalRevisionHistory.tsx` to expose exact-revision `Preview PDF` and `Download PDF` actions for users who can view Proposals. The actions use the authenticated bearer fetch boundary and exact revision ID.

Preview opens the generated PDF in a new browser tab using an object URL or an authenticated fetch/download helper. Download uses the same endpoint with download disposition or a Blob download path.

The UI must:

- use shared `Button`, `Alert`, and existing table primitives;
- guard duplicate clicks while a PDF request is active;
- surface readable generation errors;
- never create a public unauthenticated Proposal PDF URL.

### 5. P5 compatibility

P5 will reuse:

`exact immutable accepted Revision -> ProjectProposalPdfProjection -> proposal-pdf-server`

and persist those exact bytes through the canonical Project document/storage contract after that contract is mapped. P4 therefore must not make PDF bytes depend on live mutable browser state.

## Pricing representation

For each Area:

- ungrouped + direct amount: Area scope may show `Area Price` once;
- grouped: Area scope shows `Pricing Group: <label>` with no group sell amount.

Pricing Summary order:

1. Pricing Groups sorted by `sortOrder`; each has label, optional description, amount once.
2. Direct-priced Areas sorted by Area `sortOrder`; each has Area Name and amount once.
3. Proposal Total from exact Revision `proposalTotal`.

The projection contract asserts that the sum of presentation entries may be compared to `proposalTotal` for diagnostics, but the displayed grand total always uses the DB-authoritative value.

## Customer-facing Area fields

Allowed when present:

- Area Type / Area Name
- Material description
- Supplier snapshot only when explicitly present as commercial description
- Finish
- Thickness
- Square Feet
- Linear Feet
- Edge Profile
- Edge Linear Feet
- Backsplash / Backsplash Notes
- Sink Quantity / Sink Source
- Sink Cutout Quantity / Sink Template Status
- Scope Notes
- Pricing Group label or direct Area price

Excluded:

- readiness status
- readiness/status note
- measurement notes
- internal notes
- internal IDs
- product cost, vendor cost, margin, commission, AP/AR or internal audit data

## Error behavior

- Missing/invalid bearer session: existing auth helper response.
- Missing `projects.view`: 403.
- Project unavailable: 404/fail closed.
- Proposal unavailable or belongs to another Project: 404/fail closed.
- Revision unavailable or belongs to another Proposal: 404/fail closed.
- Projection invariant failure: 422 with a non-sensitive message.
- PDF renderer failure: 500 with a non-sensitive message.
- Logo fetch/normalization failure alone does not fail the PDF.

## Testing

TDD starts with `modulex-admin/scripts/project-proposal-pdf-contract.mjs`, wired into the existing Admin Project Base contract owner rather than a new workflow.

The contract covers:

- projection file and server route existence;
- exact revision selection;
- no `internalNotes`/`internal_notes` in projection output contract;
- operational readiness/status/measurement fields excluded from PDF projection;
- empty optional sections omitted;
- grouped price rendered once per group;
- direct price rendered once per ungrouped Area;
- authoritative `proposalTotal` carried through;
- acceptance evidence tied to the exact selected revision;
- server route requires `projects.view` and authenticated bearer path;
- no service-role/client secret exposed to browser code;
- UI actions use exact revision ID and shared primitives;
- no Proposal-to-Order or Project-status mutation in P4.

Final verification:

- focused P4 contract;
- existing Proposal Admin UI contract / Admin Project Base contract;
- `smoke:admin-ui-strict` for changed UI files;
- RBAC/production-surface regressions as owned by existing workflows;
- TypeScript, lint and production build;
- no Supabase Advisors because P4 has no schema/RPC/RLS/grant/index change.

## Acceptance

P4 is implementation-verified when:

- an exact Proposal Revision can be previewed/downloaded by an authorized Admin user;
- generated PDF total equals the exact Revision DB-derived `proposalTotal`;
- grouped pricing appears once per Pricing Group;
- customer-facing Area detail omits empty fields;
- `internal_notes` and the locked operational fields never appear;
- accepted/rejected/sent/draft exact revisions render without mutating lifecycle;
- no PDF is persisted yet;
- final required CI for the exact PR head is green.

Production P4 closeout remains separate from implementation verification and requires the merged Admin deployment plus signed-in live PDF smoke.