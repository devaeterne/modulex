# Project Proposal P3 — Acceptance Record

Date: 2026-09-08
Package: P3 — Revision / Send / Acceptance UX
PR: #381 (`feat/project-proposal-lifecycle-ux`)
Status: implementation verified; merge + signed-in production acceptance pending

## Scope delivered

P3 connects the existing Proposal lifecycle RPC boundary to the Project Detail Proposal tab without changing schema or creating a second lifecycle system.

- Draft revision exposes **Send Proposal**.
- Sent revision exposes **New Revision**, **Reject Proposal**, and **Accept Proposal**.
- New Revision uses a client-generated idempotency key and preserves it across retry.
- Reject records a required rejection note against the exact sent revision.
- Accept records required accepted name + acceptance method, with optional accepted email and signature text, against the exact sent revision.
- Accepted Proposal UX is read-only and directs later commercial changes to Project Change Orders.
- Revision history surfaces sent/rejected/accepted lifecycle evidence.

## Locked boundaries preserved

- Proposal lifecycle remains separate from canonical Project lifecycle.
- P3 does not call Project status mutation APIs.
- Acceptance does not create an Order.
- Proposal → Order conversion remains deferred to P6 and must stay explicit.
- Accepted Revision immutability remains authoritative at the existing DB/RPC boundary.
- Existing DB guards still require at least one Area before send and reject orphan Pricing Groups.
- A Proposal with an existing draft cannot create a second draft revision.

## TDD evidence

Focused contract: `modulex-admin/scripts/project-proposal-lifecycle-ui-contract.mjs`, wired through the existing Project Proposal contract chain.

- RED: Admin Project Base run `34170652759` failed only when the newly wired P3 lifecycle contract required lifecycle files/actions that did not yet exist.
- GREEN: Admin Project Base run `34170930717` passed the Proposal Core + P2 + P3 contract chain and all Project Base regressions.
- GREEN: Admin UI Foundation run `34170930765` passed strict changed-file UI validation, Admin regressions, production-surface checks, RBAC, typecheck, lint, and production build.

## Production gate

No Supabase migration is introduced by P3; all lifecycle RPCs were delivered and production-accepted in P1.

Before marking P3 fully production-accepted:

1. Merge PR #381 after execution-time main/open-PR recheck.
2. Confirm the Admin production deployment contains the merged SHA.
3. Run signed-in Project → Proposal smoke for draft send, sent lifecycle controls, and read-only accepted state without performing unsafe business mutations unless an appropriate test fixture exists.
4. Confirm acceptance still creates no Order and does not silently change Project status.
5. Then mark P3 `[x]` and move the Proposal tracker to P4 — Proposal PDF Rendering.
