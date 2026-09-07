from pathlib import Path
import re


def one(text, pattern, replacement, label):
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return out

plan_path = Path("docs/PROJECT_BASE_PLAN.md")
plan = plan_path.read_text()
plan = one(plan, r"Last reviewed: .*?\nActive branch: .*?\nProduction Supabase: `bzjoeernnmvuhzyvbowc`\n\nCurrent package: .*?\n\nCurrent status: .*?\n\nNext action: .*?(?=\n\nThis file)", """Last reviewed: 2026-09-07
Active branch: `docs/pb5-pb6-production-closeout`
Production Supabase: `bzjoeernnmvuhzyvbowc`

Current package: **PB-5 + PB-6 production closeout — COMPLETE / PRODUCTION VERIFIED**

Current status: **PB-1, PB-2, PB-3A, PB-3B, PB-5 and PB-6 are completed Project capabilities. PB-4 Project Expenses/Outgoings remains intentionally Finance-owned. PB-5 fulfillment and PB-6 participants/commission are merged and production-accepted with rollback-only mutation probes and permanent Project Base contracts.**

Next action: **PB-5 and PB-6 are closed. Any next Project package must start from execution-time current `main` and the relevant Project plan; do not reopen PB-5/PB-6 implicitly.**""", "plan header")

plan = one(plan, r"## PB-5 — Delivery & Installation Rollup `\[~\]`.*?(?=\n---\n\n## PB-6)", """## PB-5 — Delivery & Installation Rollup `[x]`

Project-level fulfillment visibility derives from canonical Orders, Shipments, Installations and PB-3B procurement quantities; Project does not own a parallel fulfillment ledger.

- [x] multiple Shipments and multiple Installations remain separate canonical records;
- [x] Customer Pickup remains distinct and is excluded from delivery-required counts;
- [x] canonical Installation records remain authoritative for legacy delivery metadata;
- [x] cancelled Orders are excluded from active rollup while remaining history;
- [x] Sales-safe procurement blockers expose quantity/state only, without vendor/cost leakage;
- [x] Admin/Sales read boundary and denied-role behavior verified in production;
- [x] production migration `20260904125157 — customer_project_fulfillment_summary` is applied;
- [x] multi-shipment, partial delivery, Customer Pickup, legacy installation and cancelled-order exclusion verified;
- [x] rollback fixtures used the valid Shipment lifecycle and left zero residue;
- [x] acceptance artifact: `docs/acceptance/pb-5-project-fulfillment.md`.

**Status: COMPLETE / PRODUCTION VERIFIED.**""", "plan PB5")

plan = one(plan, r"## PB-6 — Participants & Commission Ledger `\[ \]`.*?(?=\n---\n\n## PB-7)", """## PB-6 — Participants & Commission Ledger `[x]`

Project owns participant assignment and commission entitlement history; Finance remains canonical for actual payout cash movement.

- [x] configurable participant role taxonomy with Sales Rep projected from canonical Project truth;
- [x] fixed, percentage and gross-profit-percentage commission basis with Project/category/product scope;
- [x] immutable obligations and append-only earned/approved/cancelled/adjustment/offset/reversal history;
- [x] deterministic `event_sequence` ordering removes same-transaction `now()` ambiguity;
- [x] negative entitlement and destructive UPDATE/DELETE rewrites fail closed;
- [x] true Sales-only identity receives no internal commission detail or mutation access;
- [x] payout projection consumes posted Finance links using `project_commission_obligation` attribution;
- [x] same-currency payout rolls up; mixed-currency payout fails closed;
- [x] production migration `20260907191844 — customer_project_commission_event_ordering` is applied;
- [x] rollback matrix verified fixed `$500.00`, sales-% `$663.50`, GP revenue/cost/basis/commission `$6,540.70 / $2,924.00 / $3,616.70 / $361.67`, six same-timestamp events with six distinct sequences, and zero residue;
- [x] fresh Advisors show no PB-5/PB-6-specific blocking finding; unrelated project-wide debt remains separate;
- [x] acceptance artifacts: `docs/acceptance/pb-6-project-participants-commission.md` and `modulex-admin/docs/acceptance/pb-6-commission-event-ordering-hardening.md`.

**Status: COMPLETE / PRODUCTION VERIFIED.**""", "plan PB6")

plan = one(plan, r"# 5\. Current Snapshot.*?(?=\n---\n\n# 6\. Tracking Protocol)", """# 5. Current Snapshot

As of 2026-09-07:

- PB-1, PB-2, PB-3A, PB-3B, PB-5 and PB-6: merged / production-accepted.
- PB-4: intentionally Finance-owned; no Project-owned outgoing-money ledger.
- PB-5 migration: `20260904125157 — customer_project_fulfillment_summary`; RBAC and fulfillment scenario acceptance passed with zero residue.
- PB-6 ordering migration: `20260907191844 — customer_project_commission_event_ordering`; commission math, deterministic lifecycle, immutable history, Sales-only denial, Finance payout attribution and mixed-currency fail-closed acceptance passed with zero residue.
- Store/Portal internal Project exposure remains unchanged by PB-5/PB-6.
- PB-5/PB-6 are closed and must not be reopened implicitly.""", "plan snapshot")
plan_path.write_text(plan)

roadmap_path = Path("modulex-admin/ADMIN_ROADMAP.md")
roadmap = roadmap_path.read_text()
roadmap = one(roadmap, r"Current parallel Project package: \*\*.*?\*\*", "Current parallel Project package: **Project Base PB-5 Delivery & Installation Rollup and PB-6 Participants & Commission Ledger are complete and production-verified; there is no active PB-5/PB-6 delivery package.**", "roadmap header")
roadmap = one(roadmap, r"## Project Base — PB-5 Delivery & Installation Rollup.*?(?=\n## Product Master UX v2)", """## Project Base — PB-5 / PB-6 production closeout

- [x] **PB-1 — Project Core + Order Integration.** Production-accepted canonical Customer → Project → Orders foundation.
- [x] **PB-2 — Project Financial Rollup.** Production-accepted canonical sales/cost/profitability rollup.
- [x] **PB-3A — Customer Payment Ledger.** Production-accepted receivables/payment/allocation truth.
- [x] **PB-3B — Procurement.** Production-accepted Project procurement projection over canonical Vendor/Inventory domains.
- [!] **PB-4 — Project Expenses / Outgoings.** Intentionally Finance-owned; no parallel Project cash ledger.
- [x] **PB-5 — Delivery & Installation Rollup.** Migration `20260904125157 — customer_project_fulfillment_summary` is applied; Admin/Sales RBAC, multi-shipment, partial delivery, Customer Pickup, canonical Installation, cancelled-history and rollback residue checks passed.
- [x] **PB-6 — Participants & Commission Ledger.** Ordering migration `20260907191844 — customer_project_commission_event_ordering` is applied. Fixed/percentage/gross-profit commissions, append-only lifecycle, deterministic identity ordering, Sales-only denial, Finance payout attribution and mixed-currency fail-closed behavior passed production acceptance.
  - six events in one transaction: one timestamp / six distinct sequences;
  - fixed `$500.00`, sales-% `$663.50`, GP basis `$3,616.70`, GP commission `$361.67`;
  - obligation/event rewrites and negative entitlement remain fail-closed;
  - rollback acceptance left zero temporary cost/account/commission/Finance residue;
  - fresh Advisors retain unrelated project-wide debt but no PB-5/PB-6-specific blocker.
  - evidence: `docs/acceptance/pb-5-project-fulfillment.md`, `docs/acceptance/pb-6-project-participants-commission.md`, `modulex-admin/docs/acceptance/pb-6-commission-event-ordering-hardening.md`.
""", "roadmap project section")
roadmap_path.write_text(roadmap)

pb5_path = Path("docs/acceptance/pb-5-project-fulfillment.md")
pb5 = pb5_path.read_text()
if "Status: COMPLETE / PRODUCTION VERIFIED" not in pb5:
    pb5 = pb5.replace("Production Supabase: `bzjoeernnmvuhzyvbowc`\n", "Production Supabase: `bzjoeernnmvuhzyvbowc`\nStatus: COMPLETE / PRODUCTION VERIFIED\n", 1)
pb5 = one(pb5, r"## Supabase Advisor review.*$", """## Production closeout — 2026-09-07

This supersedes the pre-merge production-boundary notes above.

- PR #296 is merged and production migration history contains `20260904125157 — customer_project_fulfillment_summary`.
- Admin and Sales reads succeeded; a denied identity returned SQLSTATE `42501`.
- Real production truth verified multiple Shipments, canonical Installation truth and cancelled-order inactive history.
- Rollback fixtures verified Customer Pickup and partial delivery using valid Shipment transitions.
- All acceptance mutations rolled back with zero residue.
- Fresh Advisors show no PB-5-specific blocking finding; unrelated project-wide findings remain separate.

**PB-5 status: COMPLETE / PRODUCTION VERIFIED.**
""", "PB5 closeout")
pb5_path.write_text(pb5)

pb6_path = Path("docs/acceptance/pb-6-project-participants-commission.md")
pb6 = pb6_path.read_text()
pb6 = one(pb6, r"Status: .*?\n", "Status: COMPLETE / PRODUCTION VERIFIED\n", "PB6 status")
pb6 = one(pb6, r"## Production boundary.*$", """## Production closeout — 2026-09-07

PB-6 core/hardening/percentage/gross-profit migrations are installed. PR #352 supplied the final deterministic event-ordering hardening.

- production ordering migration: `20260907191844 — customer_project_commission_event_ordering`;
- `event_sequence` is `GENERATED ALWAYS AS IDENTITY`, historical values are non-null, and 15 targeted hardening indexes are present;
- current-status and event-history projections use `event_sequence DESC`; PUBLIC/anon execute remains denied and authenticated execute remains allowed;
- rollback acceptance verified fixed `$500.00`, sales basis `$6,635.00` → `$663.50`, GP revenue/cost/basis/commission `$6,540.70 / $2,924.00 / $3,616.70 / $361.67`;
- `earned → approved → adjustment → approved → offset → reversal` passed with one shared timestamp and six distinct sequences;
- negative entitlement, true Sales-only denial and immutable UPDATE/DELETE guards passed;
- canonical posted Finance payout attribution rolled up same-currency and failed closed for mixed currency;
- all temporary costs/accounts/obligations/events/Finance rows rolled back with zero residue;
- fresh Advisors show no PB-5/PB-6-specific blocker; unrelated debt remains separate.

**PB-6 status: COMPLETE / PRODUCTION VERIFIED.**
""", "PB6 closeout")
pb6_path.write_text(pb6)

hard_path = Path("modulex-admin/docs/acceptance/pb-6-commission-event-ordering-hardening.md")
hard = hard_path.read_text()
hard = one(hard, r"Status: .*?\n", "Status: COMPLETE / PRODUCTION VERIFIED\n", "ordering status")
hard = one(hard, r"## Production boundary.*$", """## Production closeout — 2026-09-07

PR #352 merged before production apply. Production history contains `20260907191844 — customer_project_commission_event_ordering`.

- identity-backed `event_sequence`, no null historical value;
- 15 expected ordering/FK hardening indexes present;
- event projection PUBLIC/anon denied, authenticated allowed; private current-status helper PUBLIC denied;
- status and event projection both use `event_sequence DESC`;
- full rollback acceptance passed deterministic same-timestamp ordering, commission calculations, negative guard, immutable history, true Sales-only denial, canonical Finance payout attribution, mixed-currency fail-closed behavior and zero residue;
- fresh Advisors show no PB-6-specific blocker; broader project findings remain separate.

**PB-6 ordering hardening status: COMPLETE / PRODUCTION VERIFIED.**
""", "ordering closeout")
hard_path.write_text(hard)
