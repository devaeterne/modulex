from pathlib import Path

ADMIN = Path("modulex-admin/ADMIN_ROADMAP.md")
STORE = Path("modulex-store/STORE_ROADMAP.md")
MERGE_SHA = "adfd9210740c77a4196a4938caa6a41a2f71556e"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


admin = ADMIN.read_text()
admin = replace_once(
    admin,
    "Main baseline: `fbfa1613970c83117f023d89fec60ac80a6fed97`",
    f"Main baseline: `{MERGE_SHA}`",
    "admin baseline",
)

evidence = "  - Full A0 verification run `33248339553` passed the production-surface contract, lint, deterministic Admin contracts, and production build.\n"
admin = replace_once(
    admin,
    evidence,
    evidence
    + "  - PR #101 merged to `main` as `adfd9210740c77a4196a4938caa6a41a2f71556e` and Vercel Admin production deployment `dpl_VfZRggevcjmgp25axPY493c1NyC4` is `READY`.\n",
    "A0.1 production evidence",
)

old_a02 = """## A0.2 Navigation and RBAC truth

- [ ] Inventory all Admin navigation entries and map each to required roles/permissions.
- [ ] Verify hidden navigation is also enforced at route/data level; hidden UI alone is not authorization.
- [ ] Remove duplicated or conflicting navigation destinations.
- [ ] Verify direct URL access behavior for unauthorized roles.
- [ ] Document role expectations for `super_admin`, `admin`, `sales`, and any operational roles currently in production.
"""
new_a02 = """## A0.2 Navigation and RBAC truth

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
"""
admin = replace_once(admin, old_a02, new_a02, "A0.2 block")

old_next = """# Next Action

Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.

The first A0 production-surface cleanup package is implemented and verified. Next:

1. Complete the navigation-to-role/permission inventory for current production roles.
2. Verify unauthorized direct URL behavior for every retained business surface; hidden navigation alone is not authorization.
3. Audit dashboard widgets, fake/sample values, placeholder links/text, dead buttons, and development-only controls.
4. Continue A0 runtime/config cleanup: package identity, environment contract, Vercel Admin-domain assumptions, and client/server secret boundaries.
5. Re-run the relevant Admin verification chain after each package and keep this roadmap current.

**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete, and Phase 2.1C About is production-accepted. Gallery/Projects remains intentionally fail-closed until approved real Gallery/Project content is published and live-accepted. Package D returns to Admin A4.1 after that Gallery acceptance for configurable ordinary navigation/footer links while Account and Contact remain code-owned."""
new_next = """# Next Action

Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.

A0.1 production-surface cleanup is merged and live. **A0.2 — Navigation and RBAC truth is now the active package.**

1. Build the authoritative navigation → permission → role inventory from the existing sidebar and permission matrix.
2. Fix direct-route parity gaps already identified for `/profile`, Store CMS manage-only routes, and warehouse/location mutation routes.
3. Preserve intentional aliases such as `/customers/payment-methods` only as redirects; remove or prevent conflicting navigation destinations.
4. Expand deterministic RBAC smoke coverage with positive and negative direct-URL cases for every current production role.
5. Document final role expectations and only then mark A0.2 complete; dashboard/sample-data and runtime/config cleanup remain the following A0 packages.

**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete, and Phase 2.1C About is production-accepted. Gallery/Projects remains intentionally fail-closed until approved real Gallery/Project content is published and live-accepted. Package D returns to Admin A4.1 after that Gallery acceptance for configurable ordinary navigation/footer links while Account and Contact remain code-owned."""
admin = replace_once(admin, old_next, new_next, "admin Next Action")
ADMIN.write_text(admin)

store = STORE.read_text()
store = replace_once(
    store,
    "Main baseline: `fbfa1613970c83117f023d89fec60ac80a6fed97`",
    f"Main baseline: `{MERGE_SHA}`",
    "store baseline",
)
dependency = "**Completed dependency chain:** Phase 2.0 closed → Phase 2.1A production data/RPC foundation complete → Phase 2.1B Admin Pages/Projects CMS complete → Phase 2.1C About production-accepted; Gallery/Projects content acceptance pending."
store = replace_once(
    store,
    dependency,
    dependency
    + "\n\n**Admin coordination:** Admin A0.1 PR #101 is merged and production `READY` on `adfd9210740c77a4196a4938caa6a41a2f71556e`. A0.2 navigation/RBAC parity hardening is now active; this does not change the Gallery real-content blocker or the Package D ordering above.",
    "store coordination",
)
STORE.write_text(store)

print("roadmap A0.2 sync complete")
