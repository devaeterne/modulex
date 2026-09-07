from pathlib import Path

project = Path('docs/PROJECT_BASE_PLAN.md')
text = project.read_text()
old_top = """Active branch: `docs/pb7-production-closeout`
Production Supabase: `bzjoeernnmvuhzyvbowc`

Current package: **PB-7 Change Orders — COMPLETE / PRODUCTION VERIFIED**

Current status: **PB-1, PB-2, PB-3A, PB-3B, PB-5, PB-6 and PB-7 are completed Project capabilities. PB-4 Project Expenses/Outgoings remains intentionally Finance-owned. PB-7 Change Orders are merged and production-accepted with rollback-only lifecycle/revision-link probes, Sales cost sanitization, additive security/performance hardening and zero acceptance residue.**

Next action: **PB-7 is closed. Continue separately scoped Project work such as Proposal/Portal packages from execution-time current `main`; do not reopen PB-7 implicitly.**
"""
new_top = """Active branch: `feat/pb8-portal-project-projection`
Production Supabase: `bzjoeernnmvuhzyvbowc`

Current package: **PB-8 Portal Project Projection — IN PROGRESS**

Current status: **PB-1, PB-2, PB-3A, PB-3B, PB-5, PB-6 and PB-7 are completed Project capabilities. PB-4 Project Expenses/Outgoings remains intentionally Finance-owned. PB-8 is implementing a narrow customer-scoped Project projection over canonical Orders, Shipments and Installations without widening internal Finance/Procurement/commission/vendor/audit data.**

Next action: **Complete PB-8 TDD/CI, owner merge, production migration and portal isolation acceptance; then begin PB-9 Historical Excel Import from execution-time current `main`.**
"""
assert old_top in text, 'PROJECT_BASE_PLAN top anchor drifted'
text = text.replace(old_top, new_top, 1)
old_pb8 = """## PB-8 — Portal Project Projection `[ ]`

Only after Admin/DB Project truth is stable:

- narrow sanitized Project projection;
- strict customer/dealer isolation;
- no internal cost/margin/commission/vendor/payment-detail/audit leakage;
- Project → Orders / Shipments / Delivery / Installation / Documents navigation.

Update `modulex-store/STORE_ROADMAP.md` in the same package when this begins.
"""
new_pb8 = """## PB-8 — Portal Project Projection `[~]`

Only after Admin/DB Project truth is stable:

- [~] narrow sanitized Project list/detail projection through the existing Store Portal context;
- [~] strict customer/dealer isolation by canonical portal `customer_id`;
- [~] no internal cost/margin/commission/vendor/payment-detail/audit/internal-note/Sales Rep leakage;
- [~] Project → Orders / Shipments (Delivery) / Installation navigation through canonical linked records;
- [~] Dealer Project pages may navigate to the existing Dealer-visible Documents surface; Customer Portal gains no new document-read boundary.

`modulex-store/STORE_ROADMAP.md` is updated in the same package. Keep PB-8 `[~]` until owner merge, exact production migration, isolation/leakage acceptance, Advisor review and live portal verification complete.
"""
assert old_pb8 in text, 'PROJECT_BASE_PLAN PB-8 anchor drifted'
project.write_text(text.replace(old_pb8, new_pb8, 1))

store = Path('modulex-store/STORE_ROADMAP.md')
text = store.read_text()
text = text.replace('Last reviewed: 2026-09-02', 'Last reviewed: 2026-09-08', 1)
text = text.replace('Main baseline: `ceaa85699120fa3c3ff8b60231fe799199d0a543`', 'Main baseline: `0e7d5a66d7334d25660f4a420d8a5333ebb86051`', 1)
anchor = """## Countertop / Stone / Sink cross-roadmap completion

- [x] Customer and Dealer Portal order projections include the sanitized historical countertop snapshot. Production acceptance passed customer/dealer isolation and commercial-only fields; inventory, cost, margin, vendor, override-audit, raw snapshot, and configuration internals remain excluded.
"""
addition = anchor + """

## Project Base PB-8 cross-roadmap status

- [~] **PB-8 — Portal Project Projection.** Add customer-scoped Project list/detail surfaces for both Customer and Dealer portals using the existing canonical portal context.
  - Projection is intentionally narrow and derives linked Orders, Shipments/Delivery and Installations from canonical records.
  - Internal cost, margin, commission, vendor, payment-detail, audit, internal notes and Sales Rep identity remain excluded.
  - Dealer Project pages may link to the already-approved Dealer Documents surface; PB-8 does not create Customer Portal document access or a second document ownership model.
  - Keep `[~]` until owner merge, production migration, customer/dealer isolation and cross-account negative acceptance, Advisor review, Store CI/build and live portal verification are complete.
"""
assert anchor in text, 'STORE_ROADMAP PB-8 insertion anchor drifted'
store.write_text(text.replace(anchor, addition, 1))
