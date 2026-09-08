# Project Proposal P5 — Production Closeout

Date: 2026-09-08

Package: P5 — Acceptance Snapshot + Project Documents

Implementation PR: #398 — `feat(project): add Proposal acceptance snapshot`

Implementation merge SHA: `3cf0d62dac1641bdd6674959de9bdb706ab62d2d`

## Closeout status

`IMPLEMENTED / MERGED / PRODUCTION SCHEMA + DEPLOY + CI VERIFIED — SIGNED-IN LIVE ARTIFACT ACCEPTANCE PENDING`

P5 is not marked production-accepted yet. The remaining gate is a signed-in production acceptance using a real accepted Proposal Revision. At closeout verification time production contained zero accepted Proposals, zero accepted Proposal Revisions, zero Proposal acceptance rows, and zero Proposal artifacts, so the live artifact/retry/download smoke cannot be executed without inventing production business data.

P6 — Proposal → Order Conversion remains blocked until this P5 live acceptance gate is completed.

## Execution-time baseline

- `main`: `9adf26fa53779825eac554f50a666287f6fe392c`
- Current main commit: `fix(portal): reconcile Dealer pricing with Administrative Fee (#400)`
- PR #400: merged
- Open PRs at verification time: none
- Admin production Vercel deployment: `READY`
- Admin production Git SHA: `9adf26fa53779825eac554f50a666287f6fe392c`
- Production admin domain: `https://admin.oakwellcabinetry.com`
- Production Supabase project: `bzjoeernnmvuhzyvbowc`

The production deployment therefore contains P5 merge `3cf0d62dac1641bdd6674959de9bdb706ab62d2d` and the later #400 baseline reconciliation.

## Canonical migration verification

Canonical migration:

`modulex-store/supabase/migrations/20260908170000_project_proposal_acceptance_snapshot.sql`

Admin mirror:

`modulex-admin/supabase/migrations/20260908170000_project_proposal_acceptance_snapshot.sql`

Both files resolve to Git blob SHA:

`e5d47166e522b8b1b95cdb29ff40e3818a1d0395`

Result: byte-identical mirror verified.

Production migration history contains entries named `project_proposal_acceptance_snapshot`, and the expected P5 schema is present. A read-only attempt to introspect the duplicated migration-history label in greater detail was blocked by the connected tooling security layer; no production migration-history mutation or DDL repair was attempted because the live schema matches the merged contract.

## Production schema / security verification

Verified production objects:

- `public.customer_project_proposal_artifacts`
- `public.register_project_proposal_accepted_artifact(...)`
- `public.get_project_proposal_artifact(...)`
- `public.get_project_proposal_artifacts(uuid)`
- private `customer-documents` Storage bucket
- canonical `public.customer_documents` lifecycle

Artifact table verification:

- RLS enabled
- unique exact-Revision linkage
- unique acceptance linkage
- unique canonical `customer_document` linkage
- FK lifecycle is restrict/append-safe
- SHA-256 format constraint present
- lifecycle guard trigger present
- direct browser table access is not exposed through an artifact-table policy

Lifecycle guard verification:

- `private.guard_project_proposal_artifact_lifecycle()` is not executable by `PUBLIC`, `anon`, `authenticated`, or `service_role`
- direct insert/update/delete outside the canonical registration boundary fails closed
- accepted artifact rows are immutable after registration

RPC verification:

- P5 public RPCs revoke unintended `PUBLIC` / `anon` access
- authenticated execution is explicitly bounded by role and exact Project/Proposal/Revision/Acceptance checks
- accepted Revision / accepted Proposal linkage is required
- persistence is idempotent for the same accepted Revision
- registration reuses `public.register_customer_document(...)`
- no P5 service-role browser bypass exists

Canonical customer document / Storage verification:

- bucket `customer-documents` is private (`public=false`)
- PDF MIME type is permitted
- new document registration begins with `portal_visible=false`
- canonical customer-document RLS remains role-restricted
- authenticated Storage insert is restricted to Admin management roles
- authenticated Storage read remains restricted to authorized Project/customer document roles
- no anonymous P5 document access was introduced

## CI / contract verification

P5's focused contract is chained through the existing Project Proposal Core contract:

`modulex-admin/scripts/project-proposal-core-contract.mjs`
→ `project-proposal-admin-ui-contract.mjs`
→ lifecycle / P4 PDF / P5 acceptance snapshot contracts.

#400 Project Base merge-test evidence:

- workflow: Admin Project Base
- run: `34222192377`
- result: success
- `Project Proposal Core contract PASS`
- `Project Proposal Admin UI contract PASS`
- `Project Proposal lifecycle UX contract PASS`
- `Project Proposal P4 PDF contract PASS`
- `Project Proposal P5 acceptance snapshot contract PASS`

Current-main Admin UI Foundation evidence:

- run: `34225474705`
- result: success
- typecheck: success
- lint: success with existing warnings only, zero errors
- production build: success

The production build contains the accepted-artifact persistence route, stored document download route, and Proposal PDF route.

## P5 contract coverage

The focused P5 contract verifies:

- Store canonical migration and Admin mirror are byte-identical
- exact accepted Revision artifact uniqueness
- exact acceptance uniqueness
- canonical `customer_documents` linkage
- existing private `customer-documents` bucket reuse
- P4 customer-safe projection reuse
- P4 renderer reuse
- SHA-256 hashing
- immutable upload with `upsert:false`
- no service-role credential usage in the P5 artifact server path
- `projects.manage` persistence permission
- `projects.view` stored artifact download permission
- stored-byte download with SHA verification
- no re-render on Project Documents download
- private/no-store response caching
- idempotent persistence client
- Project Documents loading/empty/retry/download UX
- acceptance lifecycle snapshot persistence state/retry messaging
- no Order creation
- no Project lifecycle mutation

## Security / Performance Advisor review

Security Advisor review did not surface a P5-specific critical exposure. The artifact table intentionally has RLS enabled without direct policies because access is routed through the canonical guarded RPC boundary and direct browser grants are revoked.

Performance Advisor reported two P5-related informational unindexed-FK findings:

- `customer_project_proposal_artifacts_created_by_fkey`
- `customer_project_proposal_artifacts_proposal_id_fkey`

These are recorded as non-blocking performance debt for now. No speculative production index was added without query-plan/workload evidence.

## Live production acceptance gate

At verification time:

- accepted Proposals: `0`
- accepted Proposal Revisions: `0`
- Proposal acceptances: `0`
- Proposal artifacts: `0`

Therefore these live checks remain pending:

- create/persist the exact accepted Revision artifact through the signed-in Admin flow
- retry persistence and prove no duplicate artifact/document/object is created
- verify one canonical `customer_documents` row
- verify one private `customer-documents` Storage object
- verify stored SHA/file-size/storage metadata against returned bytes
- verify Project Detail → Documents lists the artifact
- verify Download returns exact stored bytes
- verify a newer Revision cannot alter/re-render the accepted artifact
- verify non-accepted revisions cannot create accepted artifacts
- visually/sample-check customer-safe PDF exclusion and grouped-pricing-once behavior against the real accepted Revision
- verify acceptance still creates zero Orders and does not mutate Project lifecycle

Do not satisfy this gate by fabricating production Proposal/Acceptance data or bypassing normal authorization.

## Gate decision

P5 code, schema, security boundary, deployment, and automated contracts are verified. P5 remains partially closed until the real signed-in artifact smoke above is completed.

P6 implementation must not begin before that gate is explicitly accepted.