# Project Proposal P5 — Acceptance Snapshot + Project Documents Implementation Plan

> **Execution:** follow TDD RED → GREEN on isolated branch `feat/project-proposal-acceptance-snapshot`; do not apply production DDL before merge.

**Goal:** Persist the exact accepted Proposal Revision PDF as one immutable canonical customer document and expose stored-byte downloads in Project Documents.

**Architecture:** Reuse `customer_documents`, private `customer-documents` storage, existing Proposal acceptance lifecycle, and P4 projection/renderer. Add only an immutable Proposal-artifact linkage table plus canonical RPCs. Storage upload is outside the Postgres acceptance transaction, so artifact creation is idempotent/retryable and never rolls back acceptance.

---

## Task 1 — RED contract

**Files**
- Create `modulex-admin/scripts/project-proposal-acceptance-snapshot-contract.mjs`
- Modify `modulex-admin/scripts/project-proposal-admin-ui-contract.mjs`

Contract must fail until P5 implementation exists and assert:
- canonical Store/Admin migration mirror exists and is byte-identical
- immutable artifact linkage table/RPC contract exists
- accepted-artifact server/client/routes exist
- storage uses existing `customer-documents`, `upsert:false`, caller bearer auth, and SHA-256 verification
- Project Documents placeholder is replaced by a real shared-primitive tab
- stored download does not call the PDF renderer
- acceptance integration treats artifact failure separately from acceptance failure
- no Order creation/project lifecycle mutation/new bucket

Create draft PR and capture an Admin Project Base RED run.

## Task 2 — Canonical DB artifact contract

**Files**
- Create `modulex-store/supabase/migrations/20260908170000_project_proposal_acceptance_snapshot.sql`
- Create byte-identical Admin mirror at `modulex-admin/supabase/migrations/20260908170000_project_proposal_acceptance_snapshot.sql`

Implement:
- `customer_project_proposal_artifacts`
- append-only lifecycle guard
- `register_project_proposal_accepted_artifact(...)`
- `get_project_proposal_artifact(...)`
- `get_project_proposal_artifacts(...)`
- appropriate RLS/grants without direct mutation access

Registration must validate exact Project/Proposal/Revision/Acceptance/customer chain, accepted state, PDF metadata, deterministic customer-scoped path and SHA-256. It must reuse an existing canonical `customer_documents` row only when immutable metadata matches; otherwise fail closed.

## Task 3 — Accepted-artifact server persistence

**Files**
- Create `modulex-admin/src/lib/customers/project-proposal-artifact-server.ts`
- Create POST route under exact Proposal Revision accepted-artifact path
- Update API timing contract if required by existing conventions

Implement caller-scoped Supabase client, accepted-state validation, P4 projection/renderer reuse, SHA-256, deterministic path, `upsert:false`, retry conflict verification, canonical registration RPC, safe errors, no service role.

## Task 4 — Stored-byte list/download domain

**Files**
- Create `modulex-admin/src/lib/customers/project-proposal-artifact-client.ts`
- Create project document download route

Implement project artifact list, retry persistence client, and stored download. Download must resolve canonical artifact metadata, fetch private storage bytes with caller auth, SHA-256 verify, then return the stored PDF with private/no-store/nosniff headers. Never invoke the Proposal PDF renderer from the download path.

## Task 5 — Acceptance UX integration

**Files**
- Modify focused Proposal lifecycle/revision components only as needed

After successful `accept_project_proposal_revision`, request artifact persistence. If persistence fails, retain accepted lifecycle state and show an explicit retryable snapshot warning instead of reporting acceptance itself as failed. Prevent duplicate submits.

## Task 6 — Project Documents UI

**Files**
- Create `modulex-admin/src/components/customers/project-detail/ProjectDocumentsTab.tsx`
- Modify `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`

Replace the placeholder with loading/error/empty/success states using shared Modulex primitives and list accepted Proposal artifacts with stored-PDF download.

## Task 7 — Acceptance evidence + roadmap

**Files**
- Create `modulex-admin/docs/acceptance/project-proposal-p5.md`
- Update `docs/PROJECT_PROPOSAL_PLAN.md` and `modulex-admin/ADMIN_ROADMAP.md` only when implementation evidence supports the status

Run exact-head:
- P5 contract
- Proposal Admin contract chain
- Admin Project Base workflow
- Admin UI Foundation workflow if changed Admin UI/API surfaces require it
- migration byte identity check
- typecheck/lint/build

Do not mark production accepted until merged migration is applied, deployment contains the merge, and signed-in stored-artifact acceptance/download smoke is verified.
