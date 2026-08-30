# A2.3 Stock Operations & Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close A2.3 by proving the existing stock-operation, scan, duplicate-scan, QR-label, and mobile warehouse workflows are safe, deterministic, and production-ready without widening the A2.2 database contract.

**Architecture:** Keep the existing A2.2 idempotent inventory RPCs as the only stock-write boundary. Treat A2.3 as an operational hardening/acceptance package: statically contract the current Admin scanner and label behavior, verify production QR/barcode data integrity, and record a production acceptance artifact. Do not add a parallel scan ledger or new stock mutation path.

**Tech Stack:** Next.js 16, React, TypeScript, Supabase/Postgres, html5-qrcode, qrcode.react, GitHub Actions.

**Spec:** `modulex-admin/ADMIN_ROADMAP.md` → Phase A2.3.

## Global Constraints

- Preserve A2.2 idempotent RPCs for all stock-changing operations.
- Do not mutate production inventory or movement rows during A2.3 acceptance.
- Camera duplicate protection must reject repeated identical frames before workflow dispatch and serialize scan processing.
- Guided writes must require explicit confirmation and keep source/target quantity validation.
- QR-label printing must support A4 and label-printer output using the same canonical QR payloads consumed by scan flows.
- Mobile acceptance is based on mobile-first responsive layout, 44px-class controls, environment-facing camera use, and hardware/manual scanner fallback.

---

### Task 1: Add the A2.3 deterministic contract

**Files:**
- Create: `modulex-admin/scripts/a2-stock-operations-scanning-contract.mjs`
- Create: `.github/workflows/admin-a2-stock-operations-scanning.yml`

**Interfaces:**
- Consumes: existing `StockOperationForm`, `CameraScanner`, `GuidedStockOperation`, `ScanPanel`, `QRLabelsGrid`, A2.2 contract.
- Produces: one repeatable A2.3 acceptance gate.

- [ ] **Step 1: Write the failing contract**
  - Assert all stock writes use A2.2 idempotent RPCs.
  - Assert camera duplicate cooldown and processing serialization exist.
  - Assert guided workflow validation + explicit confirmation exist.
  - Assert manual/hardware scanner fallback and mobile-first responsive classes exist.
  - Assert QR label bulk/single A4/label-printer paths use `window.print()` and canonical QR payloads.
  - Require `docs/acceptance/a2-3-stock-operations-scanning.md` so the first run is RED.

- [ ] **Step 2: Run the workflow and capture RED**
  - Expected failure: missing A2.3 production acceptance artifact.

### Task 2: Record production operational acceptance

**Files:**
- Create: `modulex-admin/docs/acceptance/a2-3-stock-operations-scanning.md`

**Interfaces:**
- Consumes: read-only production Supabase checks and current runtime source.
- Produces: durable acceptance evidence for future releases.

- [ ] **Step 1: Verify production data integrity read-only**
  - Active zones/locations have QR code + payload.
  - QR codes/payloads have no active duplicates.
  - Active products have barcode + QR values with no duplicates.
  - Inventory has no negative or over-reserved quantities.

- [ ] **Step 2: Record scan/error/duplicate/print/mobile acceptance**
  - Document camera cooldown, processing lock, guided confirmation, ambiguous-location errors, source/target validation, hardware scanner fallback, responsive layout, and print modes.

- [ ] **Step 3: Re-run A2.3 contract**
  - Expected: PASS.

### Task 3: Regression and release gate

**Files:**
- Verify only; no runtime schema change expected.

**Interfaces:**
- Consumes: A2.1/A2.2/A2.3 contracts, RBAC, production-surface checks, lint/build.
- Produces: PR-ready A2.3 package.

- [ ] **Step 1: Run A2.3 workflow on final head**
  - A2.3 deterministic contract.
  - A2.2 inventory/movement contract.
  - A2.1 warehouse/location contract.
  - production-surface and RBAC smoke.
  - lint and Next.js production build.

- [ ] **Step 2: Open PR**
  - Scope: Admin stock operations/scanning acceptance only; no Store runtime changes and no production stock mutations.

- [ ] **Step 3: After merge/deploy**
  - Confirm `main` SHA equals production Vercel Admin deployment SHA.
  - Confirm no production runtime errors.
  - Close A2.3 in `ADMIN_ROADMAP.md` and advance to A2.4.
