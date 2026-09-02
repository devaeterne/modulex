# Commercial Document Countertop + Logo Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the saved Countertop configuration details on both Order and Invoice A4 print/PDF output and normalize Logo 2 visual size without changing database schema.

**Architecture:** Reuse the existing immutable `countertop_configurations.pricing_snapshot` parser/query path rather than inventing a second Countertop model. Extract the shared Countertop summary loader from `order-domain.ts`, format one commercial-document detail string from the saved snapshot, feed it to Order and Invoice mappers, and make both HTML and direct-PDF renderers support wrapped multi-line detail rows. Keep document branding fields unchanged; only normalize the secondary logo presentation box.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase JS, shared Modulex Admin UI primitives/tokens, existing custom PDF writer.

**Spec:** User-provided Order/detail/print screenshots in the current project conversation.

## Global Constraints

- Work from execution-time `main` SHA `d8167b81944a22ca9d568159e4ffd3139d9fd850`.
- Do not touch open PR #246 vendor-approval scope or depend on it.
- No database migration: existing Countertop configuration snapshots and existing primary/secondary logo settings are canonical.
- Order and Invoice print/PDF must remain one shared `CommercialDocument` design.
- A4 paper remains white; existing light-logo variants remain the printable/PDF source.
- New/modified Admin feature UI must pass `smoke:admin-ui-strict` and Admin UI regression.
- Update `modulex-admin/ADMIN_ROADMAP.md` in the same PR.

---

### Task 1: Lock the regression with a failing contract

**Files:**
- Modify: `modulex-admin/scripts/commercial-document-contract.mjs`

**Interfaces:**
- Consumes: current Order/Invoice print wrappers, shared PDF renderer and `CommercialDocument`.
- Produces: contract assertions that require shared Countertop snapshot loading/formatting, Invoice `order_item_id` linkage, wrapped PDF detail rows and normalized secondary logo sizing.

- [ ] **Step 1: Add contract assertions**

Require:
- `src/lib/customers/countertop-summary.ts`.
- exported `loadCountertopLineSummaries` and `formatCountertopPrintDetail`.
- both print wrappers to call the shared loader/formatter.
- Invoice print to derive Countertop summaries from `order_item_id`.
- HTML detail rendering to preserve wrapped/multiline detail text.
- PDF to render multiple detail rows and use dynamic row height/page packing.
- a dedicated larger secondary-logo box in both HTML and PDF.

- [ ] **Step 2: Run the PR workflow and verify RED**

Expected: `Admin Commercial Documents UI` fails specifically because the shared Countertop print helper/detail/logo normalization is not implemented yet.

- [ ] **Step 3: Commit**

Commit message: `test: require countertop details in commercial documents`

---

### Task 2: Share Countertop snapshot loading and document formatting

**Files:**
- Create: `modulex-admin/src/lib/customers/countertop-summary.ts`
- Modify: `modulex-admin/src/lib/customers/order-domain.ts`
- Modify: `modulex-admin/src/components/customers/CustomerOrderPrint.tsx`
- Modify: `modulex-admin/src/components/customers/CustomerInvoicePrint.tsx`

**Interfaces:**
- Produces: `loadCountertopLineSummaries(orderItemIds: string[]): Promise<CountertopLineSummary[]>`.
- Produces: `formatCountertopPrintDetail(summary?: CountertopLineSummary | null): string | null`.
- Order print maps summaries by `CustomerOrderItem.id`.
- Invoice print maps summaries by `CustomerInvoiceItem.order_item_id`.

- [ ] **Step 1: Extract existing parser/loader unchanged**

Move the existing `pricing_snapshot` parser and `countertop_configurations` read into the focused shared module. Keep `order-domain.ts` behavior identical by importing the shared loader.

- [ ] **Step 2: Add compact commercial-document formatting**

Format saved data into readable lines containing available values only:
- `Material: <stone type> · Area: <sq ft> · Band: <material band>`
- `Edge: <name> · <linear ft>`
- `Sink: <name> (<sku>)`
- `Services: <name> ×<qty>, ...`
- manual material override amount/reason when present.

- [ ] **Step 3: Feed Order print from order-item Countertop snapshots**

Keep existing service `line_note`; when Countertop summary exists, combine Countertop detail before the line note without losing either.

- [ ] **Step 4: Feed Invoice print through immutable order-item linkage**

Use existing `CustomerInvoiceItem.order_item_id` to load the same saved Countertop pricing snapshot. Do not look up current Product Master attributes or invent live pricing data.

- [ ] **Step 5: Commit**

Commit message: `fix: include countertop snapshots in order and invoice print`

---

### Task 3: Render full details and normalize Logo 2 in HTML + PDF

**Files:**
- Modify: `modulex-admin/src/components/documents/CommercialDocument.tsx`
- Modify: `modulex-admin/src/lib/documents/pdf.ts`

**Interfaces:**
- Consumes: `CommercialDocumentLine.detail` as newline-delimited compact saved detail text.
- Produces: HTML print that preserves line breaks and PDF rows whose height tracks wrapped description/detail lines.

- [ ] **Step 1: Preserve detail line breaks in HTML**

Render `item.detail` with `whitespace-pre-line` so Countertop sections remain readable without introducing a new UI primitive.

- [ ] **Step 2: Make PDF line rendering height-aware**

Split detail on line breaks, wrap each segment, render multiple rows, compute line height from description/detail rows, and pack pages by available vertical height instead of a fixed item count. Keep a conservative bottom boundary so totals/signatures cannot overlap detail rows.

- [ ] **Step 3: Normalize Logo 2**

Give the secondary logo a dedicated visual box larger than the current generic `max-h-16 max-w-[180px]` treatment and mirror that sizing in PDF coordinates/max-height. Keep `object-contain` and do not stretch aspect ratio.

- [ ] **Step 4: Commit**

Commit message: `fix: render commercial detail rows and secondary logo consistently`

---

### Task 4: Roadmap + final verification + PR handoff

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces: documented completion evidence and a merge-ready PR; no production DB/deploy action.

- [ ] **Step 1: Record the refinement under A1.5 / completed operations**

Record that Order/Invoice print + direct PDF now render saved Countertop configuration snapshots and normalized dual-logo header sizing, with no schema change.

- [ ] **Step 2: Run fresh final CI**

Require green:
- commercial document contract
- `smoke:admin-ui-strict:self-test`
- `smoke:admin-ui-strict`
- `typecheck`
- `lint`
- production `build`
- Admin UI Foundation regression
- any A1 workflow triggered by the changed customer document files.

- [ ] **Step 3: Review PR diff against latest base**

Confirm no vendor-catalog files, no migration files, and no unrelated behavior changes.

- [ ] **Step 4: Mark PR ready and hand off for user merge**

Do not merge automatically.
