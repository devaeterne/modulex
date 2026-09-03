# Modulex Project Progress — Design Lock

Approved: 2026-09-03
Branch: `project-base`
Scope: PB-1 Project Detail read-only progress summary

## Purpose

Project Detail must give an operator a fast, truthful at-a-glance view of where a Project stands without creating a second lifecycle or duplicating Order, Shipment, Installation, Invoice, or Finance sources of truth.

## UI contract

The Project Detail surface includes a shared-Admin `Project Progress` card/rail using the conventions in `modulex-admin/AdminUICheck.md` and `modulex-admin/docs/ADMIN_UI_GUIDE.md`:

- `ComponentCard` owns the surface.
- `Badge` communicates current/done/pending/progress states.
- `ADMIN_TEXT_STYLES` owns light/dark text contrast.
- Loading, error, Retry and empty states are explicit.
- No route-local colors, borders, radii, shadows, buttons or ad-hoc status chips.
- At 1280/1366 widths the progress card stacks to preserve the Project Settings form; at sufficiently wide desktop widths it may render as a right-side rail.

## Lifecycle dimension

The authoritative Project lifecycle remains `customer_projects.status`:

```text
DRAFT
QUOTED
APPROVED
ORDERED
IN_PROGRESS
COMPLETED
CANCELLED
```

The progress UI may visualize lifecycle history as Done / Current / Pending, but it must not invent additional Project lifecycle states such as Delivered, Installed, Revised, Invoiced, or Paid.

## Orders

- Only active child Orders participate in progress summaries.
- `cancelled` Orders are excluded from active counts and fulfillment/commercial denominators.
- Order revision events remain Order revision/audit events; they do not become Project lifecycle states.

## Delivery

PB-1 delivery progress is a read-only approximation derived from canonical active child Order lifecycle and `fulfillment_type`:

- `pickup` Orders are excluded from Delivery progress.
- Delivery completion is inferred only from existing Order states that are at/after delivery.
- No new Project delivery status is persisted.

The full authoritative Project delivery rollup across child Shipments remains PB-5.

## Installation

PB-1 installation progress is a read-only approximation:

- only active Orders with `fulfillment_type = delivery_installation` participate;
- completion is inferred from the existing canonical Order lifecycle;
- no new Project installation state is persisted.

The full authoritative Project installation rollup across Installation records remains PB-5.

## Commercial

PB-1 Commercial progress is intentionally count/status only:

- invoiced Orders / active Orders;
- paid Invoices / non-void Invoices.

It must not calculate Project sales, cost, gross profit, margin, collected amount, balance, or payment ledger state.

Financial amount rollups remain PB-2 and the payment ledger remains PB-3.

## Recent Activity

Recent Activity may combine truthful canonical events from:

- `customer_project_status_history`;
- `customer_order_status_history`;
- `customer_order_revisions`;
- non-void `customer_invoices`.

Events are descriptive history, not workflow milestones. Actor names are shown when current RLS permits resolving the referenced profile; otherwise the UI fails safely to `Modulex user` / `System` rather than weakening RLS.

## Safety boundary

This PB-1 feature is read-only and introduces:

- no migration;
- no new persisted Project workflow state;
- no Store/Portal projection;
- no change to canonical Order, Shipment, Installation, Invoice, pricing, reservation, revision, or finance contracts.
