from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


roadmap = "ADMIN_ROADMAP.md"
replace_once(
    roadmap,
    "Main baseline: `16ba530f91a7229c25cef5df626e609b5ba63ffe`",
    "Main baseline: `f248d04864c9e55111d416f99a1cced4ee4f02f3`",
)
replace_once(
    roadmap,
    """- [x] Verify direct URL access behavior for unauthorized roles.\n  - Warehouse/zone/location create/edit routes require `warehouse.manage`; `warehouse` and `shipping` retain read-only warehouse-structure access and are denied mutation URLs.\n  - Personnel Departments/Positions direct routes now match their sidebar `personnel.manage` requirement.\n""",
    """- [x] Verify direct URL access behavior for unauthorized roles.\n  - Warehouse/zone/location create/edit routes require `warehouse.manage`; `warehouse` and `shipping` retain read-only warehouse-structure access and are denied mutation URLs.\n  - Personnel Departments/Positions direct routes now match their sidebar `personnel.manage` requirement.\n- [x] Gate warehouse-structure list-page mutation controls and handlers with `warehouse.manage`.\n  - Post-merge Codex review on PR #103 identified a P1 gap: `/warehouses`, `/zones`, and `/locations` correctly remained readable through `warehouse.view`, but their list components still exposed mutation controls/handlers to read-only roles.\n  - Add/Edit, activate/deactivate, delete, and double-click edit behavior now fail closed unless the active profile has `warehouse.manage`; read-only navigation such as Warehouses → Zones and Zones → Locations remains available.\n  - TDD evidence: run `33251261334` failed 12/13 on the missing list-page mutation guard before the fix; targeted GREEN run `33251331146` passed 13/13 RBAC checks after the fix.\n  - Full verification run `33251372987` passed RBAC, production-surface, secondary CMS, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint (0 errors / 35 existing warnings), Next.js production build, and diff-check.\n""",
)
replace_once(
    roadmap,
    "  - A0.2 route-permission parity and negative direct-URL cases passed in full verification run `33249988130`; data authorization remains independently enforced by RLS/RPC/API contracts.",
    "  - A0.2 route-permission parity, negative direct-URL cases, and warehouse-structure list mutation UI guards passed in full verification runs `33249988130` and `33251372987`; data authorization remains independently enforced by RLS/RPC/API contracts.",
)

matrix = "docs/ADMIN_RBAC_MATRIX.md"
replace_once(
    matrix,
    "Baseline: `16ba530f91a7229c25cef5df626e609b5ba63ffe`",
    "Baseline: `f248d04864c9e55111d416f99a1cced4ee4f02f3`",
)
replace_once(
    matrix,
    """1. **Navigation visibility** — `src/layout/AppSidebar.tsx` filters entries with `hasPermission()`.\n2. **Direct-route visibility** — `src/app/(admin)/layout.tsx` calls `canAccessPath()` and renders Access Denied when the authenticated role does not satisfy the path permission.\n3. **Data authorization** — Supabase RLS/RPC boundaries and protected Admin API handlers remain authoritative for reads/writes. Route visibility must never be treated as a replacement for data authorization.\n\n`scripts/rbac-smoke.mjs` asserts that every sidebar path resolves to the same permission through `requiredPermissionForPath()`. It also covers profile access, intentional aliases, and negative mutation-route cases.\n""",
    """1. **Navigation visibility** — `src/layout/AppSidebar.tsx` filters entries with `hasPermission()`.\n2. **Direct-route visibility** — `src/app/(admin)/layout.tsx` calls `canAccessPath()` and renders Access Denied when the authenticated role does not satisfy the path permission.\n3. **In-page mutation visibility** — list routes that are intentionally readable by operational roles must separately gate mutation affordances and handlers with the corresponding manage permission. Warehouse structure lists use `warehouse.manage`.\n4. **Data authorization** — Supabase RLS/RPC boundaries and protected Admin API handlers remain authoritative for reads/writes. UI visibility must never be treated as a replacement for data authorization.\n\n`scripts/rbac-smoke.mjs` asserts that every sidebar path resolves to the same permission through `requiredPermissionForPath()`. It also covers profile access, intentional aliases, negative mutation-route cases, and warehouse-structure list mutation UI guards.\n""",
)
replace_once(
    matrix,
    "The `warehouse` and `shipping` roles can therefore view warehouse structure but cannot open create/edit warehouse, zone or location routes.",
    "The `warehouse` and `shipping` roles can therefore view warehouse structure but cannot open create/edit warehouse, zone or location routes. On the readable `/warehouses`, `/zones`, and `/locations` list pages, Add/Edit, activate/deactivate, delete, and double-click edit behavior is also gated by `warehouse.manage`; non-mutating drill-down links remain available.",
)
replace_once(
    matrix,
    """- warehouse/shipping roles gain warehouse-structure mutation routes,\n- the legacy payment-method alias diverges from `finance.manage`, or\n""",
    """- warehouse/shipping roles gain warehouse-structure mutation routes,\n- warehouse-structure list pages expose or invoke mutation behavior without `warehouse.manage`,\n- the legacy payment-method alias diverges from `finance.manage`, or\n""",
)

Path("scripts/apply-warehouse-mutation-guard.py").unlink()
Path("../.github/workflows/a0-2-warehouse-mutation-guard.yml").unlink()
print("warehouse RBAC roadmap closeout applied and temporary CI files removed")
