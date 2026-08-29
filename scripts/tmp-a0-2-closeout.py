from pathlib import Path

ROADMAP = Path("modulex-admin/ADMIN_ROADMAP.md")
text = ROADMAP.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "Main baseline: `adfd9210740c77a4196a4938caa6a41a2f71556e`",
    "Main baseline: `16ba530f91a7229c25cef5df626e609b5ba63ffe`",
    "baseline",
)

old_a02 = '''## A0.2 Navigation and RBAC truth

- [~] Inventory all Admin navigation entries and map each to required roles/permissions.
  - Active bounded package: align sidebar visibility, `requiredPermissionForPath()`, direct-route access, and mutation-route requirements without introducing a new authorization system.
- [~] Verify hidden navigation is also enforced at route/data level; hidden UI alone is not authorization.
  - Known parity gap before implementation: `/profile` is linked for every authenticated role but currently has no explicit route rule, so non-admin roles are denied by the fallback.
  - Store CMS routes shown with `store.manage` must require the same permission on direct URL access.
- [~] Remove duplicated or conflicting navigation destinations.
  - Keep `/customers/payment-methods` only as an intentional legacy redirect to `/settings/payment-methods`; do not expose it as a second navigation destination.
- [~] Verify direct URL access behavior for unauthorized roles.
  - Warehouse/location mutation routes such as `/warehouses/new` and edit mutation surfaces must require `warehouse.manage` rather than inheriting broad `warehouse.view` access.
- [~] Document role expectations for `super_admin`, `admin`, `sales`, `finance`, `hr`, `warehouse`, and `shipping`.
  - Extend deterministic RBAC coverage with navigation/direct-route parity and negative-access cases before marking this package complete.
'''
new_a02 = '''## A0.2 Navigation and RBAC truth

- [x] Inventory all Admin navigation entries and map each to required roles/permissions.
  - `docs/ADMIN_RBAC_MATRIX.md` is the authoritative navigation → permission → role inventory for current production roles.
  - `scripts/rbac-smoke.mjs` now parses sidebar entries and asserts direct-route permission parity.
- [x] Verify hidden navigation is also enforced at route/data level; hidden UI alone is not authorization.
  - `/profile` now has explicit `profile.view` access for every active Admin role.
  - Store CMS manage-only routes (`content`, `marketing`, `colors`, Pages/Projects and mutation details) require `store.manage` on direct URL access.
  - Supabase RLS/RPC/API authorization remains independently authoritative and is not replaced by the UI route guard.
- [x] Remove duplicated or conflicting navigation destinations.
  - `/customers/payment-methods` remains only as an intentional legacy redirect to `/settings/payment-methods` and now shares the canonical `finance.manage` permission.
- [x] Verify direct URL access behavior for unauthorized roles.
  - Warehouse/zone/location create/edit routes require `warehouse.manage`; `warehouse` and `shipping` retain read-only warehouse-structure access and are denied mutation URLs.
  - Personnel Departments/Positions direct routes now match their sidebar `personnel.manage` requirement.
- [x] Document role expectations for `super_admin`, `admin`, `sales`, `finance`, `hr`, `warehouse`, and `shipping`.
  - Role expectations, route families, mutation rules, aliases, and enforcement layers are documented in `docs/ADMIN_RBAC_MATRIX.md`.
  - TDD evidence: run `33249649439` failed on the pre-fix parity gaps; targeted GREEN run `33249708946` passed 12/12 RBAC checks.
  - Full verification run `33249988130` passed RBAC parity, production-surface, secondary CMS, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check.
'''
replace_once(old_a02, new_a02, "A0.2 block")

replace_once(
    "- [ ] Unauthorized direct route access is denied consistently.\n",
    "- [x] Unauthorized direct route access is denied consistently.\n"
    "  - A0.2 route-permission parity and negative direct-URL cases passed in full verification run `33249988130`; data authorization remains independently enforced by RLS/RPC/API contracts.\n",
    "A0 exit direct-route gate",
)

old_next = '''# Next Action

Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.

A0.1 production-surface cleanup is merged and live. **A0.2 — Navigation and RBAC truth is now the active package.**

1. Build the authoritative navigation → permission → role inventory from the existing sidebar and permission matrix.
2. Fix direct-route parity gaps already identified for `/profile`, Store CMS manage-only routes, and warehouse/location mutation routes.
3. Preserve intentional aliases such as `/customers/payment-methods` only as redirects; remove or prevent conflicting navigation destinations.
4. Expand deterministic RBAC smoke coverage with positive and negative direct-URL cases for every current production role.
5. Document final role expectations and only then mark A0.2 complete; dashboard/sample-data and runtime/config cleanup remain the following A0 packages.

**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete, and Phase 2.1C About is production-accepted. Gallery/Projects remains intentionally fail-closed until approved real Gallery/Project content is published and live-accepted. Package D returns to Admin A4.1 after that Gallery acceptance for configurable ordinary navigation/footer links while Account and Contact remain code-owned.'''
new_next = '''# Next Action

Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.

A0.1 production-surface cleanup is live and **A0.2 Navigation & RBAC truth is implementation-complete and fully verified**. Next:

1. Audit dashboard widgets for template/sample/fake data; replace with real operational data or remove the widget.
2. Audit placeholder links/text, fake metrics, dead buttons, and development-only controls across retained Admin surfaces.
3. Execute A0.3 runtime/config cleanup: package identity, `.env.example` contract, Vercel Admin-domain assumptions, and client/server secret boundaries.
4. Re-run the relevant Admin verification chain after each package and keep this roadmap current.
5. Close Phase A0 only after the remaining dashboard/surface audit and runtime/config tasks satisfy their exit criteria.

**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete, and Phase 2.1C About is production-accepted. Gallery/Projects remains intentionally fail-closed until approved real Gallery/Project content is published and live-accepted. Package D returns to Admin A4.1 after that Gallery acceptance for configurable ordinary navigation/footer links while Account and Contact remain code-owned.'''
replace_once(old_next, new_next, "Next Action")

ROADMAP.write_text(text)
