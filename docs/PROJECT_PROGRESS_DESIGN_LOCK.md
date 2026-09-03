# Modulex Project Progress — PB-1 Design Lock

Last reviewed: 2026-09-03
Branch: `project-base`
Scope: **PB-1 accepted Project Detail progress presentation**

This document locks the accepted PB-1 Project Progress layout so future Project packages do not accidentally reintroduce the discarded sidebar/rail layout or duplicate lifecycle activity.

---

## Purpose

Project Progress is an **at-a-glance, read-only Project overview** derived from canonical Project, Order, Invoice, shipment/installation-related Order state, and Project lifecycle history.

PB-1 does **not** make Project Progress a second source of truth. It summarizes existing canonical records and leaves authoritative financial and fulfillment rollups to later Project packages.

---

## Accepted UI Contract

### Full-width compact overview

- Project Progress is a **full-width card in the normal Project Detail flow**.
- There is **no Project Progress sidebar, side rail, or desktop-only right column**.
- The layout must remain compact and responsive rather than reserving a persistent narrow column.
- Project Settings and the dedicated Activity card remain normal full-width Project Detail sections below/around the overview according to the page flow.

### Lifecycle flow

Render the PB-1 lifecycle as one horizontal, wrapping badge flow:

```text
Draft → Quoted → Approved → Ordered → In Progress → Completed
```

Each lifecycle badge communicates one of:

- `Done`
- `Current`
- `Pending`

The current Project status remains authoritative. Historical lifecycle history may prove an earlier state was attained; it must not invent a transition that was never recorded.

`Cancelled` is an explicit Project status badge, not a seventh step inserted into the normal completion flow.

### Responsive overview blocks

Below Lifecycle, Project Progress exposes four compact responsive blocks:

1. **Orders**
2. **Delivery**
3. **Installation**
4. **Commercial**

On wide screens these may share one row; on narrower screens they wrap naturally using the shared Admin responsive grid conventions. No block becomes a separate sidebar.

---

## Orders

- Count only **active child Orders**.
- Cancelled Orders are excluded from the active count and progress calculations.
- The accepted PB-1 progress signal is `Confirmed or later / active Orders`.
- Cancelled Orders remain discoverable through the explicit cancelled-order workflow; they are not treated as active Project work.

---

## Delivery

PB-1 Delivery is a **read-only derived summary**, not the authoritative Project delivery rollup.

- Derive eligibility from existing Order `fulfillment_type` semantics.
- Customer Pickup Orders are excluded from Delivery progress.
- Preserve existing Order/Shipment lifecycle ownership.
- Do not introduce new delivery mutation behavior from Project Progress.

Authoritative multi-delivery Project rollup remains **PB-5**.

---

## Installation

PB-1 Installation is a **read-only derived summary**, not the authoritative Project installation rollup.

- Count only Orders whose existing fulfillment semantics require installation.
- Preserve the existing Order/Installation lifecycle as source of truth.
- Do not introduce Project-level installation mutations in PB-1.

Authoritative multi-installation Project rollup remains **PB-5**.

---

## Commercial

PB-1 Commercial is deliberately bounded to **count/status visibility**.

Allowed PB-1 signals include:

- Invoiced Orders / active Orders
- Paid Invoices / Invoices

PB-1 Commercial must **not** present Project financial amount rollups such as revenue, cost, gross profit, margin, paid amount, balance, receivables, or cash flow.

Those authoritative amount rollups remain **PB-2 / PB-3**.

---

## Dedicated Activity

Project lifecycle/audit history lives in the separate **Activity** card on Project Detail.

- Project Progress must **not** contain a duplicate `Recent Activity` block.
- The dedicated Activity card is the official PB-1 Project lifecycle timeline.
- It reads `customer_project_status_history`, displays the status transition in readable form, preserves newest-first chronology, and shows the actor when `changed_by` resolves to a profile.
- Missing actor identity falls back to a neutral system/user label; the UI must not fabricate a person.
- Order revision/status history remains owned by the Order domain and is not copied into the Project lifecycle audit timeline merely to make the card look busier.

---

## Admin UI / Accessibility Lock

Project Progress and Activity must continue to use shared Modulex Admin primitives/tokens:

- `ComponentCard`
- `Badge`
- shared Admin text tokens
- shared Admin table primitives for Activity
- runtime locale formatting rather than a hard-coded display locale
- light/dark-mode contrast compatible with `AdminUICheck.md` and `ADMIN_UI_GUIDE.md`

The accepted responsive behavior must remain valid across the Admin resolution matrix without horizontal page overflow.

---

## Safety / Ownership Boundaries

- Project Progress is read-only in PB-1.
- No additional Project Progress schema/migration is introduced by this presentation layer.
- Cancelled Orders do not contribute to active Project progress.
- Financial amount rollups remain deferred to PB-2/PB-3.
- Authoritative delivery/install Project rollups remain deferred to PB-5.
- Store / Customer Portal / Dealer Portal Project projection remains unchanged in PB-1.
- Do not update `modulex-store/STORE_ROADMAP.md` for this design-only closeout because no Store/portal behavior changed.

---

## Acceptance Lock

Accepted PB-1 presentation:

```text
Project Detail
  ├── Project summary
  ├── Project Progress  ← full-width compact overview
  │    ├── Lifecycle badges
  │    └── Orders | Delivery | Installation | Commercial
  ├── Project Settings (permission-gated)
  ├── Orders
  └── Activity          ← dedicated Project lifecycle/audit timeline
```

Do not restore the discarded Project Progress sidebar/right-rail design or duplicate `Recent Activity` inside Project Progress without a new explicit product decision.
