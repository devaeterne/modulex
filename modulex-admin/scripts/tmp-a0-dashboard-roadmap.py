from pathlib import Path
import os

ROADMAP = Path("ADMIN_ROADMAP.md")
BASELINE = "45458e1f1402614b5e4a408394706df4c4aa757d"
STATUS = os.environ.get("A0_DASHBOARD_STATUS", "in_progress")

text = ROADMAP.read_text()
text = text.replace(
    "Main baseline: `f248d04864c9e55111d416f99a1cced4ee4f02f3`",
    f"Main baseline: `{BASELINE}`",
    1,
)

plain = "- [ ] Audit dashboard widgets for template/sample data.\n  - Replace invented/demo values with real operational data or remove the widget."
in_progress = "- [~] Audit dashboard widgets for template/sample data.\n  - Existing Modulex dashboard KPIs and recent stock movements are sourced from production RPCs (`get_dashboard_kpis`, `get_recent_inventory_movements`); no invented metric values were found.\n  - Active package: make dashboard Quick Actions permission-aware through the existing direct-route authorization truth."
complete = "- [x] Audit dashboard widgets for template/sample data.\n  - Existing Modulex dashboard KPIs and recent stock movements are sourced from production RPCs (`get_dashboard_kpis`, `get_recent_inventory_movements`); no invented metric values were found.\n  - Dashboard Quick Actions now resolve the active profile and reuse `canAccessPath()` so unauthorized/dead shortcuts fail closed while KPI loading remains independent.\n  - TDD evidence: Actions run `33253263982` failed on the missing profile/route guard before implementation; targeted GREEN run `33253331280` passed the expanded production-surface contract.\n  - Full package verification: `FULL_RUN_ID` passed production-surface, RBAC, secondary CMS, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, production build, and diff-check."

if STATUS == "in_progress":
    if plain in text:
        text = text.replace(plain, in_progress, 1)
    elif in_progress not in text and complete not in text:
        raise RuntimeError("dashboard roadmap task block not found")
elif STATUS == "complete":
    if in_progress in text:
        text = text.replace(in_progress, complete, 1)
    elif complete not in text:
        raise RuntimeError("in-progress dashboard roadmap task block not found")
else:
    raise RuntimeError(f"unsupported A0_DASHBOARD_STATUS: {STATUS}")

ROADMAP.write_text(text)
