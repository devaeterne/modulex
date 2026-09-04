# Countertop Catalog UI/UX Redesign Spec

## Goal
Make the Admin Countertop Catalog practical for large Stone and Sink catalogs without changing existing catalog business rules or persistence contracts.

## Approved UX
- Replace the vertically stacked Stone and Sink tables with one workspace using **Stones** and **Sinks** tabs.
- Show only the active catalog at a time.
- Add catalog search and status filtering for the active tab.
- Add client-side pagination with 25 / 50 / 100 rows per page.
- Reset the active page when tab, search, status filter, or page size changes.
- Keep the existing Add/Edit modal flows and canonical RPCs.
- Simplify each table so scanning does not require a very wide row.

## Table model
### Stones
Show five columns:
1. Stone — name and SKU together.
2. Details — brand, Stone Type, and optional vendor.
3. Price Band — Material Price Band.
4. Status.
5. Actions.

### Sinks
Show five columns:
1. Sink — name and SKU together.
2. Brand.
3. Pricing — compact price-group summary instead of one table column per Price Group.
4. Status.
5. Actions.

Price editing remains in the existing Sink editor, where every active order-eligible Price Group is still required.

## Actions
Use the shared Admin Dropdown primitives behind a compact `…` action trigger for Edit and Activate/Deactivate. Do not introduce a new lifecycle behavior.

## Shared Admin UI contract
- Continue using `ComponentCard`, `Input`, `Select`, `Button`, `Badge`, `Dropdown`, `DropdownItem`, `Modal`, and the shared Admin Table primitives.
- Do not add route-local color, border, background, radius, shadow, ring, or dark-mode appearance classes.
- Keep the route `PageBreadcrumb`.
- Preserve keyboard/ARIA semantics for tabs and row action menus.

## Data and behavior constraints
- No database/schema changes.
- Preserve `save_countertop_catalog_product` for Stone/Sink saves.
- Preserve `set_product_status` for lifecycle changes.
- Existing reference loading, Stone profile rules, and Sink price validation remain unchanged.
- Search/pagination are presentation-layer behavior over the already-loaded catalog rows; this change does not introduce a new server paging contract.

## Acceptance
- Stones and Sinks are mutually exclusive tab panels.
- Search matches practical identifying/detail fields for the active catalog.
- Status filter supports all / active / inactive.
- Pagination never renders more than the selected page size and disables invalid Previous/Next moves.
- Filter/page-size/tab changes return the active page to page 1.
- Sink table no longer creates one visible column per Price Group.
- Existing Add/Edit/status mutation workflows remain available.
- `npm run smoke:countertop-ui`, `npm run smoke:admin-ui-strict`, typecheck, lint, and build pass in CI.