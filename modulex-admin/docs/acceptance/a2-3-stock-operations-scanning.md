# A2.3 Stock Operations & Scanning Production Acceptance

A2.3 production acceptance: PASS

Accepted on: 2026-08-30
Production Supabase project: `bzjoeernnmvuhzyvbowc`
Baseline `main`: `9e92f1eb3b89b996d17005538012b6587c24f99f`

## Production data integrity

Read-only production queries were used. No inventory, movement, warehouse, zone, location, or product row was mutated as part of this acceptance.

- Active zones: 6
- Active zones missing QR code/payload: 0
- Active locations: 2
- Active locations missing QR code/payload: 0
- Active products: 462
- Active products with barcode: 462
- Active products with product QR: 462
- Duplicate active barcodes: 0
- Duplicate active product QR values: 0
- Duplicate active zone QR codes: 0
- Duplicate active location QR codes: 0
- Duplicate active location QR payloads: 0
- Invalid inventory quantities: 0

`invalid inventory quantities` means any row with negative on-hand quantity, negative reserved quantity, or reserved quantity greater than on-hand quantity.

## `/stock-operations` workflow acceptance

Stock operations: PASS

The desktop Stock Operations form remains on the A2.2 write boundary. Stock In, Stock Out, Transfer, Reserve, and Release all call the corresponding idempotent RPC, keep one client UUID idempotency key per unchanged request payload, prevent concurrent submit through `isSubmitting`, and validate required product/location/quantity values before the request.

Quantity safety remains explicit:

- Stock Out, Transfer, and Reserve reject a quantity greater than Available.
- Release rejects a quantity greater than Reserved.
- Transfer rejects identical source and target locations.
- Source options are restricted to eligible product inventory locations.
- Failed operations retain the same idempotency key for safe retry; a successful operation clears it.

## QR / barcode scan behavior

Camera duplicate protection: PASS

`CameraScanner` keeps a 2200 ms same-value cooldown and a `processingRef` serialization guard. Repeated frames containing the same value inside the cooldown are ignored before workflow dispatch, while a scan callback is never processed concurrently with another callback.

Scan error handling: PASS

The guided scanner rejects unsupported warehouse/zone scans during a stock mutation, missing/inactive products, unresolved locations, ambiguous shelf codes, source shelves that do not contain eligible stock, identical transfer source/target shelves, insufficient Available quantity, and excessive Release quantity. Camera processing failures surface a user-visible scanner error rather than silently failing.

Manual / hardware scanner fallback: PASS

`/scan` provides a Manual Input / Hardware Scanner form that uses the same `processInput` routing as camera scans. This gives warehouse devices a non-camera path for USB/Bluetooth keyboard-wedge scanners and manual QR/SKU/barcode entry.

## Guided stock-write acceptance

Guided write confirmation: PASS

Every guided Stock In, Stock Out, Transfer, Reserve, or Release action requires an explicit confirmation through the operation-specific confirmation message before invoking the A2.2 idempotent RPC. Product, source, target, quantity, Available, and Reserved validation remains in front of that confirmation/write boundary.

The camera is automatically hidden once the guided workflow has all required product/source/target inputs, reducing accidental additional scans before confirmation.

## QR label generation and printing

QR label printing: PASS

The QR Labels surface consumes active Zone and Location records and renders the same canonical QR payloads understood by the scanner. It supports:

- bulk A4 sheet printing;
- bulk label-printer printing;
- single A4 shelf/zone sign printing;
- single label-printer output;
- 50 × 30 mm, 60 × 40 mm, and 70 × 50 mm label sizes;
- print-specific `@page` sizing and 100% label-printer scale guidance;
- QR code, human-readable location hierarchy, and QR code text on printed output.

The production data check confirms all active Zones and Locations already have QR code + payload values and there are no active duplicate QR identifiers in the checked domains.

## Mobile warehouse usability

Mobile warehouse usability: PASS

The warehouse scanning surfaces are mobile-first and retain usable fallbacks:

- scan operation selector starts as a two-column mobile grid and expands at larger breakpoints;
- scan/manual controls use 44px-class (`h-11`) touch targets;
- forms stack vertically on narrow widths and move to horizontal layouts only at larger breakpoints;
- QR label cards/filter controls start as one-column layouts and expand responsively;
- camera requests the environment-facing camera and lazily loads `html5-qrcode` only when the camera component mounts;
- successful camera decodes can trigger device vibration feedback;
- manual/hardware scanner input remains available when camera permission, camera hardware, or scanning conditions are unsuitable.

This acceptance is a source-contract and production-data verification. It does not claim a physical printer model certification or device-farm certification; those remain hardware-specific operational checks if Modulex later standardizes warehouse devices/printers.

## Release boundary

A2.3 introduces no production DDL, no parallel scan ledger, and no new stock mutation function. A2.2 remains the canonical inventory write/audit boundary.

Production inventory/movement mutation: NONE

The permanent A2.3 GitHub Actions gate re-runs A2.3 scanner/label contracts together with A2.2 inventory/movement, A2.1 warehouse/location, production-surface, RBAC, lint, and Next.js production-build regressions.

Repository closeout cleanup: PASS — temporary roadmap-update tooling was removed before the final branch verification; only permanent A2.3 plan, acceptance, contract, workflow, and roadmap changes remain.