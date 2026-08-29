from pathlib import Path
import sys

run_id = sys.argv[1]
baseline = "6cbd27198d930cb129b912fa4faece3bf967e292"

roadmap_path = Path("ADMIN_ROADMAP.md")
surface_path = Path("docs/ADMIN_PRODUCTION_SURFACE.md")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise RuntimeError(f"Could not patch {label}")


roadmap = roadmap_path.read_text()
roadmap = replace_once(
    roadmap,
    "Main baseline: `45458e1f1402614b5e4a408394706df4c4aa757d`",
    f"Main baseline: `{baseline}`",
    "roadmap baseline",
)
roadmap = replace_once(
    roadmap,
    "  - Removed `/alerts`, `/avatars`, `/badge`, `/buttons`, `/images`, `/modals`, `/videos`, `/bar-chart`, `/line-chart`, `/form-elements`, `/basic-tables`, `/blank`, `/calendar`, and `/api-test`.",
    "  - Removed `/alerts`, `/avatars`, `/badge`, `/buttons`, `/images`, `/modals`, `/videos`, `/bar-chart`, `/line-chart`, `/form-elements`, `/basic-tables`, `/blank`, `/calendar`, `/api-test`, and the explicit TailAdmin `/error-404` route.",
    "removed demo route list",
)

audit_old = "- [ ] Audit placeholder links, sample text, fake metrics, dead buttons, and development-only controls across Admin."
audit_new = f"""- [x] Audit placeholder links, sample text, fake metrics, dead buttons, and development-only controls across Admin.
  - Retained production shell/auth/profile/settings/roles surfaces were reviewed in this bounded A0.1 pass; no additional fake dashboard metrics or dead actions were found in scope. Personnel, Finance, Approvals, and Training remain explicit A6 classification work rather than being silently removed here.
  - Removed the explicit `/error-404` TailAdmin template route, rebranded the global Next.js 404 as Modulex Admin, and removed the `info@dasoft.me` sign-in prefill in favor of an empty production login field.
  - `smoke:production-surface` now prevents the explicit template 404 route, TailAdmin branding in the global 404, and the known developer-account prefill from returning.
  - TDD evidence: Actions run `33254287380` failed on the still-present explicit TailAdmin 404 route before implementation; targeted GREEN run `33254350807` passed after the bounded fixes.
  - Full package verification: Actions run `{run_id}` passed production-surface, RBAC, secondary CMS, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check."""
if audit_old in roadmap:
    roadmap = roadmap.replace(audit_old, audit_new, 1)
elif "- [x] Audit placeholder links, sample text, fake metrics, dead buttons, and development-only controls across Admin." not in roadmap:
    raise RuntimeError("Could not patch retained-surface audit")

roadmap = replace_once(
    roadmap,
    "  - `scripts/admin-production-surface-contract.mjs` blocks the known demo route files and `/api-test` navigation while explicitly protecting the intentional `/profile` surface.",
    "  - `scripts/admin-production-surface-contract.mjs` blocks the known demo route files and `/api-test` navigation, protects the intentional `/profile` surface, and guards the production 404/login shell against known template/developer residue.",
    "production surface contract summary",
)
roadmap = replace_once(
    roadmap,
    "  - Production-surface contract plus the fresh production build guard the removed route set.",
    "  - Production-surface contract plus the production build guard the removed route set, Modulex-branded global 404, and empty production sign-in state.",
    "A0 exit residue guard",
)

next_old = """A0.1 production-surface cleanup is live and **A0.2 Navigation & RBAC truth is implementation-complete and fully verified, including PR #106 warehouse list mutation hardening**. Next primary Admin work:

1. Audit dashboard widgets for template/sample/fake data; replace with real operational data or remove the widget.
2. Audit placeholder links/text, fake metrics, dead buttons, and development-only controls across retained Admin surfaces.
3. Execute A0.3 runtime/config cleanup: package identity, `.env.example` contract, Vercel Admin-domain assumptions, and client/server secret boundaries.
4. Re-run the relevant Admin verification chain after each package and keep this roadmap current.
5. Close Phase A0 only after the remaining dashboard/surface audit and runtime/config tasks satisfy their exit criteria."""
next_new = """A0.1 production-surface cleanup and retained-surface residue audit are implementation-complete and verified, and **A0.2 Navigation & RBAC truth is implementation-complete and fully verified, including PR #106 warehouse list mutation hardening**. Next primary Admin work:

1. Execute A0.3 runtime/config cleanup: package identity, `.env.example` contract, Vercel Admin-domain assumptions, and client/server secret boundaries.
2. Re-run the relevant Admin verification chain after the A0.3 package and keep this roadmap current.
3. Close Phase A0 only after A0.3 satisfies its runtime/config exit criteria."""
roadmap = replace_once(roadmap, next_old, next_new, "roadmap next action")
roadmap_path.write_text(roadmap)

surface = surface_path.read_text()
surface = replace_once(
    surface,
    "Baseline branch: `phase-a0/admin-dashboard-production-truth`",
    f"Baseline main: `{baseline}`",
    "surface baseline",
)
surface = replace_once(
    surface,
    "- `/api-test`\n",
    "- `/api-test`\n- `/error-404` — explicit TailAdmin template route; global `not-found.tsx` is the single intentional 404 surface\n",
    "surface removed route list",
)
surface = replace_once(
    surface,
    "`npm run smoke:production-surface` fails when a known TailAdmin/demo route file is reintroduced or when `/api-test` is added back to navigation. The contract also asserts that the intentional `/profile` surface remains present, the operational dashboard continues to source KPIs/recent movements from the production RPC boundary, and dashboard Quick Actions resolve the active profile and filter through `canAccessPath()`.",
    "`npm run smoke:production-surface` fails when a known TailAdmin/demo route file is reintroduced or when `/api-test` is added back to navigation. The contract also asserts that the intentional `/profile` surface remains present, the operational dashboard continues to source KPIs/recent movements from the production RPC boundary, dashboard Quick Actions resolve the active profile and filter through `canAccessPath()`, the global 404 does not expose TailAdmin branding, and production Sign In does not preload the known developer account.",
    "surface guardrails",
)
surface = replace_once(
    surface,
    "- Audit placeholder links/text, dead buttons, and development-only controls across the remaining retained Admin surfaces.\n- Complete runtime/package/environment cleanup tasks listed in `ADMIN_ROADMAP.md`.",
    "- Complete runtime/package/environment cleanup tasks listed in `ADMIN_ROADMAP.md` (A0.3).",
    "surface remaining work",
)
surface_path.write_text(surface)
