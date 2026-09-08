# Project Proposal P5 — Acceptance Snapshot + Project Documents Design

**Date:** 2026-09-08
**Status:** Approved

## Goal

Persist the exact customer-facing PDF bytes for an accepted Proposal Revision as an immutable Project document, then expose that stored artifact through the Project Documents tab.

P5 must reuse Modulex's existing document/storage contract. It must not create a parallel Proposal document system or a new storage bucket.

## Existing contracts reused

- `public.customer_documents`
- private `customer-documents` storage bucket
- `public.register_customer_document(...)`
- existing customer-document lifecycle guards and storage identity immutability
- P4 exact-revision customer-safe projection
- P4 server-side Proposal PDF renderer
- P3 `accept_project_proposal_revision(...)` as the authoritative acceptance lifecycle

Accepted Proposal PDFs start with `portal_visible = false`. Acceptance never auto-publishes a document to Customer Portal.

## Domain model

Add a small immutable linkage table, `public.customer_project_proposal_artifacts`, that connects one accepted Proposal Revision to one canonical `customer_documents` row.

Required identity:

- Project
- Proposal
- exact Proposal Revision
- exact Proposal Acceptance row
- canonical Customer Document
- SHA-256 of the stored PDF bytes
- creator/timestamp audit fields

`proposal_revision_id`, `acceptance_id`, and `customer_document_id` are each unique. One accepted Revision therefore has at most one accepted Proposal artifact.

The generic `customer_documents` table remains generic; no Proposal-specific columns are added to it.

## Acceptance and persistence boundary

Postgres acceptance and Supabase Storage upload cannot be one transaction. P5 therefore uses two durable stages:

1. `accept_project_proposal_revision(...)` records the authoritative business acceptance.
2. An idempotent accepted-artifact persistence operation materializes the exact accepted PDF into the existing private bucket and registers/links it.

If artifact persistence fails after acceptance, acceptance remains valid. The UI reports that the Proposal is accepted but its snapshot still needs persistence, and a retry uses the same exact accepted Revision.

A retry must never create a second accepted artifact.

## Artifact creation flow

1. Require an authenticated caller with the existing Proposal management permission.
2. Read Project + Proposal + exact Revision with the caller's bearer token.
3. Require Proposal status `accepted`, Revision state `accepted`, and `proposal.accepted_revision_id = revision.id`.
4. Resolve the matching acceptance row.
5. If the linkage already exists, return it after identity validation.
6. Build the P4 customer-safe exact-revision projection.
7. Render the P4 PDF bytes once.
8. Compute lowercase SHA-256.
9. Upload with `upsert: false` to the existing `customer-documents` bucket using a deterministic customer-scoped path.
10. If upload reports an existing object during retry, download it and require the same SHA-256 before continuing.
11. Atomically register/reuse the canonical `customer_documents` row and insert the immutable Proposal-artifact linkage through a canonical RPC.

Recommended deterministic storage path:

`{customer_id}/projects/{project_id}/proposals/{proposal_id}/revisions/{revision_id}/accepted/Proposal-{proposalNumber}-R{revisionNo}.pdf`

## Stored-byte immutability

Project Documents downloads the stored object. It never re-renders the Proposal.

Every accepted-artifact read carries the recorded SHA-256. The download path re-hashes storage bytes and fails closed if the digest differs. This adds Proposal-domain tamper detection while preserving the existing shared bucket and policies.

The linkage table itself is append-only: no direct update/delete lifecycle is provided.

## DB/RPC boundary

P5 adds canonical migration + Admin mirror with byte-identical SQL.

The DB contract must:

- validate Project → Proposal → Revision → Acceptance membership
- require the Revision and Proposal to be accepted
- require the Proposal's accepted revision to equal the linked Revision
- require a customer-scoped deterministic storage path
- require `application/pdf`
- require a 64-character lowercase SHA-256
- create or reuse the canonical customer document idempotently
- reject identity/hash/metadata mismatches on retries
- return existing artifact only when all immutable identities match
- expose project-scoped accepted-artifact read RPCs for the Admin UI/download API
- keep direct artifact mutation unavailable

No Order row is created. Project lifecycle/status is not changed.

## Project Documents UI

Replace the existing Documents placeholder with a focused `ProjectDocumentsTab` using shared Modulex table/button/alert primitives.

The initial P5 document index contains accepted Proposal snapshots and exposes:

- document filename/type
- Proposal number + exact Revision
- accepted timestamp/name when available
- portal visibility (read-only in P5)
- stored-PDF download
- explicit loading, empty, error, and retry states

P5 does not introduce a top-level `/documents` route.

## Acceptance integration

The existing P3 acceptance RPC remains authoritative and unchanged in meaning. After a successful acceptance response, the Admin client requests accepted-artifact persistence.

If persistence succeeds, refresh Proposal/Revision state normally.

If persistence fails, do not report the acceptance itself as failed. Show an explicit warning and leave a retryable action for the exact accepted Revision.

## Customer-facing projection invariants

The persisted bytes reuse P4's exact customer-safe projection. Therefore the accepted snapshot must preserve:

- DB-authoritative `proposal_total`
- each Pricing Group amount exactly once
- direct-priced ungrouped Areas only
- exact accepted Revision metadata

The persisted PDF must exclude internal-only/readiness/measurement/supplier fields already excluded by P4.

## Security

- no service-role Proposal reads or storage writes
- caller bearer token remains the authorization context
- private bucket remains private
- acceptance alone does not set `portal_visible=true`
- customer/project/proposal/revision mismatches fail closed
- anonymous and unauthorized callers cannot persist or download accepted artifacts
- no generic storage/RLS weakening

## Out of scope

- Proposal → Order conversion (P6)
- Customer Portal publication UX
- generic Project file uploads
- a new document subsystem/bucket
- re-rendering stored accepted snapshots
- changing Project lifecycle on acceptance
