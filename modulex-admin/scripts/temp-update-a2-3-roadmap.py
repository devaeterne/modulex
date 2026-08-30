from pathlib import Path

path = Path("modulex-admin/ADMIN_ROADMAP.md")
text = path.read_text()

replacements = [
    (
        "Main baseline: `f0281e1e00ce3045c59cc7b0209ecfadf1855e9b`",
        "Main baseline: `9e92f1eb3b89b996d17005538012b6587c24f99f`",
    ),
    (
        "Current Admin next action: **A2.2 is production-accepted; proceed to A2.3 Stock Operations & Scanning, starting with `/stock-operations` workflow/error handling, duplicate-scan protection, QR label flow, and mobile warehouse usability.**",
        "Current Admin next action: **A2.3 Stock Operations & Scanning is production-accepted and CI-GREEN; proceed to A2.4 Low-stock & Reporting after merge/deploy verification.**",
    ),
    (
        """## A2.3 Stock operations and scanning

- [ ] Review `/stock-operations` workflows.
- [ ] Review QR/barcode scan behavior, error handling, and duplicate scan protection.
- [ ] Review QR label generation/printing workflow.
- [ ] Verify mobile usability for warehouse operations.""",
        """## A2.3 Stock operations and scanning

- [x] Review `/stock-operations` workflows.
  - The existing desktop form remains on the A2.2 idempotent RPC boundary for Stock In, Stock Out, Transfer, Reserve, and Release; it validates product/location/quantity inputs, Available/Reserved limits, source/target separation, and concurrent-submit state before writes.
  - Failed requests retain the same client idempotency key for safe retry; successful operations clear it. A2.3 introduces no parallel mutation path or schema change.
- [x] Review QR/barcode scan behavior, error handling, and duplicate scan protection.
  - `CameraScanner` suppresses the same decoded value for 2200 ms and serializes decode callbacks through `processingRef`; guided writes still rely on A2.2 idempotency as the final duplicate-submission guard.
  - Guided scanning rejects unsupported/malformed workflow inputs, inactive or missing products, ambiguous shelf codes, ineligible source shelves, identical transfer source/target shelves, insufficient Available quantity, and excessive Release quantity. `/scan` retains Manual Input / Hardware Scanner fallback through the same input router.
- [x] Review QR label generation/printing workflow.
  - QR Labels supports bulk A4, bulk label-printer, single A4 sign, and single-label output with 50 × 30, 60 × 40, and 70 × 50 mm label sizes. Printed values use the same canonical Zone/Location QR payload family consumed by scanning.
  - Read-only production acceptance found 6 active Zones and 2 active Locations, all with QR code + payload, with zero checked active duplicate Zone/Location QR identifiers. All 462 active products have barcode + product QR values, with zero duplicate active barcodes/product QR values.
- [x] Verify mobile usability for warehouse operations.
  - Scan and QR-label surfaces use mobile-first responsive grids/forms, 44px-class controls, environment-facing camera capture, vibration feedback where supported, and manual/hardware scanner fallback. Physical printer-model/device-farm certification is intentionally not claimed by this source/data acceptance.
  - Permanent acceptance: `scripts/a2-stock-operations-scanning-contract.mjs` + `docs/acceptance/a2-3-stock-operations-scanning.md` + `.github/workflows/admin-a2-stock-operations-scanning.yml`.
  - TDD RED run `33318262025` failed on the intentionally missing production acceptance artifact. GREEN run `33318383553` passes A2.3, A2.2, A2.1, production-surface, RBAC, lint, and Next.js production build.
  - Production inventory/movement mutation during A2.3 acceptance: **NONE**; read-only integrity checks also found zero negative/over-reserved inventory rows.""",
    ),
    (
        "- [ ] Scan/label workflows pass device/mobile regression checks.",
        "- [x] Scan/label workflows pass device/mobile regression checks.\n  - A2.3 permanently guards camera same-value cooldown/serialization, guided confirmation and error handling, manual/hardware scanner fallback, QR label print modes/sizes, responsive warehouse UI contracts, and A2.2 idempotent write boundaries.",
    ),
    (
        "  - A2.1 warehouse/location integrity and A2.2 inventory/movement contracts are permanent Admin workflow gates; A2.2 production acceptance includes idempotency/reversal, append-only UPDATE/DELETE protection, and explicit denial of application-role TRUNCATE privilege.",
        "  - A2.1 warehouse/location integrity, A2.2 inventory/movement, and A2.3 stock-operations/scanning contracts are permanent Admin workflow gates. A2.3 protects scanner duplicate handling, guided confirmation/error recovery, QR label printing, mobile fallback behavior, and continued use of the A2.2 idempotent write boundary.",
    ),
    (
        "- [x] A2.2 inventory/movement production acceptance is complete: server-side inventory discovery, explicit On Hand/Reserved/Available semantics, idempotent mutation RPCs, append-only/reversal audit contracts, production migrations, advisor review, Admin deployment verification, and final application-role TRUNCATE revocation are covered by PR #173 plus closeout PR #174.",
        "- [x] A2.2 inventory/movement production acceptance is complete: server-side inventory discovery, explicit On Hand/Reserved/Available semantics, idempotent mutation RPCs, append-only/reversal audit contracts, production migrations, advisor review, Admin deployment verification, and final application-role TRUNCATE revocation are covered by PR #173 plus closeout PR #174.\n- [x] A2.3 stock operations/scanning acceptance is complete: existing stock writes remain on A2.2 idempotent RPCs; camera repeated-frame suppression and serialized processing, guided confirmation/error handling, QR label printing, hardware/manual fallback, responsive warehouse behavior, and clean production QR/barcode integrity are covered by the permanent A2.3 gate.",
    ),
    (
        "- [x] A2.2 keeps the existing hybrid inventory architecture: mutable `inventory` snapshot for operational reads plus append-safe `inventory_movements` ledger. It does not adopt full event sourcing or create separate damaged/hold quantity buckets.",
        "- [x] A2.2 keeps the existing hybrid inventory architecture: mutable `inventory` snapshot for operational reads plus append-safe `inventory_movements` ledger. It does not adopt full event sourcing or create separate damaged/hold quantity buckets.\n- [x] A2.3 does not add a scan-specific write ledger or new mutation API. Camera/manual scans resolve workflow inputs; confirmed stock changes continue through the A2.2 idempotent RPC + movement-ledger boundary.",
    ),
    (
        """Primary Admin roadmap work is **Phase A2 — Inventory, Warehouses & Physical Operations**. **A2.2 — Inventory & Movements is production-accepted and closed.**

1. Start **A2.3 — Stock Operations & Scanning** from current `main`.
2. Review `/stock-operations` end to end: operation selection, validation, failure/retry UX, and reason/reference behavior against the now-authoritative A2.2 idempotent RPC contracts.
3. Review QR/barcode scanning for malformed payloads, repeated scans, duplicate submissions, permission failures, and clear recovery behavior.
4. Verify QR label generation/printing plus mobile/tablet warehouse usability, then close A2.3 only after device-oriented regression coverage is GREEN.
5. Continue with **A2.4 — Low-stock & Reporting** after A2.3 acceptance.

**Cross-roadmap coordination:** PR #172 (GC-8B accessibility/performance hardening) is merged to `main`. A2.2 intentionally changes only Admin/shared Supabase inventory contracts and does not modify Store runtime behavior; Store production acceptance remains tracked by the Store roadmap.""",
        """Primary Admin roadmap work is **Phase A2 — Inventory, Warehouses & Physical Operations**. **A2.3 — Stock Operations & Scanning is production-accepted and closed.**

1. Merge/deploy the A2.3 acceptance package after final branch checks remain GREEN; verify Admin production is on the merge SHA and has no new runtime errors.
2. Start **A2.4 — Low-stock & Reporting** from the resulting current `main`.
3. Define the low-stock threshold source of truth against A2.2 Available semantics and product minimum-stock configuration.
4. Verify low-stock/report queries and indexes, then reconcile inventory and movement reports against source records and decide export requirements.
5. Close the Phase A2 exit gate only after A2.4 reporting reconciliation is complete.

**Cross-roadmap coordination:** A2.3 is Admin-only acceptance/hardening and introduces no Store runtime, shared schema, or production stock mutation change; Store production acceptance remains tracked by the Store roadmap.""",
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one roadmap match, found {count}: {old[:100]!r}")
    text = text.replace(old, new, 1)

path.write_text(text)
