# Project Proposal P4 — Acceptance Record

Date: 2026-09-08
Package: P4 — Proposal PDF Rendering
PR: #384 (`feat/project-proposal-pdf-rendering`)
Status: implementation complete; focused contract verified; stacked full Admin verification + merge/live acceptance pending

## Scope delivered

P4 renders an authorized, exact Proposal Revision as customer-facing PDF bytes without changing Proposal, Project, Order, Finance, or document-storage truth.

- Builds a focused customer-safe projection from structured Project + Proposal + exact Revision data.
- Renders PDF server-side in the Node runtime.
- Exposes an authenticated exact-revision `application/pdf` API route.
- Adds **Preview PDF** and **Download PDF** actions to Proposal Revision History.
- Reuses General Settings company identity and document branding.
- Uses the shared deterministic `MM.DD.YYYY` date contract introduced by #369.
- Keeps PDF generation ephemeral; accepted artifact persistence remains P5.

## Pricing and customer-facing boundaries

- `proposalTotal` from the authoritative Proposal read model is rendered as the total; P4 does not recompute commercial truth in the browser.
- Each Pricing Group sell amount appears exactly once.
- Areas assigned to a Pricing Group show group membership without repeating or allocating the group amount.
- Direct Area sell amount renders only when the Area is ungrouped and has a direct amount.
- Empty optional fields/sections are omitted rather than rendered as blank labels.
- `internal_notes` never enters the PDF projection.
- Area readiness/status notes and measurement notes never enter the PDF projection.
- Supplier/vendor snapshot is excluded fail-closed because current schema has no explicit customer-facing supplier-display contract.
- Product cost, vendor cost, margin, commission, Finance, procurement, audit, and other internal truth are not projected.

## Authorization and security boundaries

- The PDF API requires `projects.view`.
- Project ID, Proposal ID, and Revision ID are all bound and cross-checked; mismatches fail closed.
- Server Proposal reads reuse canonical Project/Proposal RPCs with the caller bearer token and public Supabase key.
- No service-role / elevated Proposal table read is introduced.
- The browser client keeps PDF bytes binary via `response.blob()` and refreshes the authenticated session when needed.
- Server-side logo loading is SSRF-hardened: only the configured Supabase origin and public `company-assets` path are eligible for fetch; unsupported/external legacy logo URLs fall back to text branding instead of being fetched server-side.
- Long customer-facing text paginates instead of being silently truncated.

## Locked cross-domain boundaries preserved

- P4 does not create or update Orders.
- P4 does not mutate canonical Project lifecycle.
- P4 does not send/reject/accept/revise a Proposal.
- P4 adds no schema, migration, RPC, RLS, grant, or index change.
- P4 adds no accepted-document persistence; that remains P5.

## TDD / CI evidence

Focused contract: `modulex-admin/scripts/project-proposal-pdf-contract.mjs`, wired through the existing Project Proposal / Admin Project Base contract chain.

- RED: Admin Project Base run `34172867922` failed after the P4 contract was wired because the PDF projection/renderer/API/UI did not yet exist.
- GREEN: Admin Project Base run `34173399084` passed the completed P4 contract chain.
- GREEN after #369 integration: Admin Project Base run `34173671560` passed.
- Exact P4 implementation head before acceptance documentation: `693a0eb16bd5a6bd9ba8e5d35a877e706a538d09`.
- Exact-head focused GREEN: Admin Project Base run `34174000108` passed.

The corresponding Admin UI Foundation run `34174000112` did not reach Typecheck/Lint/Build because the post-#369 `main` baseline itself contained unrelated Admin UI Foundation regressions. Those baseline regressions are isolated in PR #389 (`fix(admin): close post-#369 Admin UI regressions`), whose exact head `d37d03d2baf0891e78fd53004d27bf21b64900ea` passes Admin A6 Finance Core `34197217360` and full Admin UI Foundation `34197217346`, including Typecheck, Lint, and Build.

For pre-merge verification, PR #384 is temporarily stacked on the #389 branch (`fix/vendor-payment-allocation-date-format`). Its PR diff remains P4-only. A fresh P4 head is used to run the P4 Project Base + full Admin UI Foundation against that clean baseline before #389 is merged. After #389 merges, #384 must be retargeted to execution-time `main` and rechecked before review-ready/merge.

## Remaining acceptance gate

Before marking P4 implementation fully verified / review-ready:

1. Complete the stacked #389 + P4 full Admin gate and record the exact-head evidence.
2. Merge #389 (owner action) and re-read execution-time `main` + open PR overlap.
3. Retarget/re-align PR #384 onto that clean `main` without importing unrelated changes into the P4 diff.
4. Run fresh exact-head Admin Project Base and Admin UI Foundation on the final `main` base.
5. Require strict UI, normal regressions, production surface, RBAC, Typecheck, Lint, and Build to pass on the final P4 head.

Before marking P4 production-accepted:

1. Merge PR #384 after the final execution-time recheck.
2. Confirm the Admin production deployment contains the merged SHA.
3. Run signed-in Project → Proposal → Revision History smoke for both Preview PDF and Download PDF using a safe existing Proposal/Revision fixture.
4. Verify the rendered PDF uses the exact requested Revision, DB-derived total, grouped pricing once, and excludes internal-only fields.
5. Confirm PDF generation creates no Order, Project lifecycle mutation, or persistent document artifact.
6. Then mark P4 `[x]` and proceed to P5 — Acceptance Snapshot + Project Documents.
