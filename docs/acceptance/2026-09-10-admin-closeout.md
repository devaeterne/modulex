# Modulex Admin production closeout — 2026-09-10

Baseline `main`: `98cb6a80ef52999ec39ee600673ff845907ce530`.
Closeout branch: `fix/admin-closeout-20260910` / PR #424.

## Countertop Multi-Backsplash

Status: **production accepted, source hotfix pending PR #424 merge**.

- Canonical multi-backsplash migration is applied in production.
- Live pricing smoke reproduced an optional-edge PL/pgSQL regression when `top_edge=false`: an unassigned `record` was referenced.
- An append-only pricing hotfix replaces the optional `record` dependency with initialized scalar edge fields. No already-applied migration was rewritten.
- Post-hotfix production smoke priced a 4-inch / 10-LF no-edge backsplash and a Full Height 18-inch / 8-LF backsplash with a managed polished top edge in the same request.
- The no-edge line returned null edge identity and zero edge subtotal; the polished line returned the selected edge and its charge.
- Countertop contracts now cover this regression.

## Project Proposal P5 — accepted artifact

Status: **production accepted**.

A real accepted Proposal (`PROP-2026-000010`, revision 1) has an accepted PDF artifact linked through canonical Proposal acceptance → artifact → `customer_documents` metadata → private `customer-documents` Storage object.

Acceptance evidence:

- document type is `proposal_acceptance`;
- PDF file metadata and Storage object size both equal 40,670 bytes;
- the stored content SHA-256 is present on the immutable artifact row;
- `portal_visible=false` remains fail-closed;
- retrying the exact immutable registration under an authenticated Sales context returned the same artifact identity;
- the retry probe ran in an explicit rollback transaction and persisted no acceptance-test mutation.

The prior P5 blocker (no real accepted Proposal artifact available for production acceptance) is no longer valid.

## Project Proposal P6 — accepted Proposal to Draft Order

Status: **production accepted after UUID aggregate hotfix, source mirror pending PR #424 merge**.

A real accepted Proposal revision exposes the accepted commercial unit `bath 102` at USD 500.00 through the guarded preview RPC.

The first rollback-only production conversion surfaced a PostgreSQL compatibility bug in the SERVICE lookup: `min(uuid)` was used even though PostgreSQL has no `min(uuid)` aggregate. The closeout adds byte-identical Admin/Store append-only migration mirrors that retain the exactly-one SERVICE validation while selecting its UUID deterministically without a UUID aggregate.

Post-hotfix production acceptance:

- the accepted Area created a canonical Draft Order inside an explicit transaction;
- repeating the exact request with the same idempotency key returned the same Order ID;
- accepted customer-visible scope remained authoritative;
- rollback left zero conversion, conversion-line, conversion-area, or acceptance-test Order residue;
- direct provenance-table access remained denied and the guarded public read contract stayed authoritative.

## Stale Admin roadmap reconciliation

The following older `[~]` notes are behind current merged/production reality and should be treated as closed when the PR is merged:

- Order Product Type + UOM + `pricing_model` routing: production migration `order_product_pricing_v2` is applied and current Order create/edit code enforces the routed pricing models.
- Configured Countertop Replace/Remove: canonical migration `countertop_replace_remove` is applied and current Admin code contains the dedicated workflow.
- Operational Countertop Stone/Sink catalog: canonical migration `countertop_catalog_product` is applied; current Admin contains the catalog surface and current Countertop selectors consume the canonical products.
- Project Proposal P3/P4: later merged P5/P6 code and production data prove the old P3/P4 “pending” wording is obsolete.
- Project Proposal P5/P6: production acceptance is recorded above.

Vendor Catalog Review v3 is **not** blanket-closed by this document. Its availability migration/schema are now reconciled in production, but the broader Vendor Catalog review/import workflow remains a separately tracked operational surface and should retain a partial status until its remaining signed-in production acceptance/polish is explicitly closed.

## Current high-level domain interpretation

- Customer final closeout CUST-7 through CUST-11 is complete.
- Inventory A2 and Product/Pricing A3 core exit gates are complete.
- Finance A6 F0 through F7 is complete and production-verified.
- Project Base PB-1 through PB-8 is production-established; PB-4 remains intentionally Finance-owned rather than a duplicate Project expense ledger. PB-9 historical import exists as a separate import capability.
- Personnel remains a functional but not fully product-classified domain: A6.1 still requires route production/planned/remove classification and final acceptance decisions.
- Store CMS/publishing core is strong, while the broader A4 leads/dealer/settings exit gate still contains planned work.
- Admin UI responsive/theme/dark-mode foundation UI-2A through UI-2E is closed; future page-specific visual polish is incremental rather than a foundation blocker.
