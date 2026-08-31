# Product Master UX v2 acceptance

Status: implementation in progress; production migration and authenticated acceptance pending.

This package adds dynamic Product Types and Units of Measure without replacing the canonical `products` identity, legacy `products.unit` mirror, inventory engine, pricing engine, Countertop values, order snapshots, or Store publication workflow.

Migration: `20260831140000_product_master_v2_dynamic_types_uom.sql` (additive, not applied to production in this PR).

Implemented locally: Product Type/UOM management routes, controlled Product Form selectors and Stone profile fields, server-side validation trigger, and a bounded Product Master V2 contract. Production preflight observed 463 products (`piece` 462, `slab` 1); no production rows were changed.

Remaining acceptance: production migration review/application by the operator, product-list/low-stock projection rollout, QR lifecycle verification, and authenticated regression across Inventory, Pricing, Countertop, Store, Customer Portal, and Dealer Portal.
