from pathlib import Path

baseline = "f6d7f9673dc874b5c254e47c750ff1bd4793c7c3"

route = Path("src/app/api/admin/dealer-portal/route.ts")
route_text = route.read_text()
old_import = 'import { sendDealerPortalInvite } from "@/lib/email/dealer-portal";\n'
new_import = old_import + 'import { getStoreActivationUrl } from "@/lib/runtime/store-origin";\n'
if new_import not in route_text:
    if old_import not in route_text:
        raise SystemExit("dealer portal import anchor not found")
    route_text = route_text.replace(old_import, new_import, 1)
old_fn = 'function storeActivationUrl() { const base=(process.env.NEXT_PUBLIC_STORE_URL||process.env.STORE_SITE_URL||"https://oakwell-phi.vercel.app").replace(/\\/$/,""); return `${base}/account/activate`; }'
new_fn = 'function storeActivationUrl() { return getStoreActivationUrl(); }'
if old_fn in route_text:
    route_text = route_text.replace(old_fn, new_fn, 1)
elif new_fn not in route_text:
    raise SystemExit("dealer portal Store activation function anchor not found")
route.write_text(route_text)

roadmap = Path("ADMIN_ROADMAP.md")
text = roadmap.read_text()
import re
text, count = re.subn(r"Main baseline: `[^`]+`", f"Main baseline: `{baseline}`", text, count=1)
if count != 1:
    raise SystemExit("roadmap baseline not found")

anchor = "  - Full deterministic verification: Actions run `33255912909` passed runtime-config, production-surface, RBAC, secondary CMS Admin, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check. Credential-bound API/DB live smoke was not rerun because this package changes no schema, RLS, RPC, API, or production data behavior.\n"
followup = anchor + "- [~] Close post-merge Codex runtime/config findings before Phase A0 exit.\n  - PR #113 merged as `f6d7f9673dc874b5c254e47c750ff1bd4793c7c3`; Vercel deployment `dpl_5jbrwJDsdJv3FtXuMhfsstX7DY6k` is production `READY` from that exact merge SHA.\n  - Post-merge Codex review found a P1 gap in source-wide privileged `NEXT_PUBLIC_*` detection and a P2 gap in Store activation-origin configuration/fallback handling.\n  - Follow-up scope: strict source-wide browser-safe env allowlist, configuration-owned `STORE_SITE_URL` / `NEXT_PUBLIC_STORE_URL`, removal of the legacy `oakwell-phi.vercel.app` fallback, and fresh deterministic verification.\n  - TDD RED: Actions run `33256670583` proved the previous runtime contract did not reject an injected `NEXT_PUBLIC_DATABASE_URL` source reference.\n"
if "Close post-merge Codex runtime/config findings" not in text:
    if anchor not in text:
        raise SystemExit("roadmap A0.3 evidence anchor not found")
    text = text.replace(anchor, followup, 1)

old_next = """Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup** until the verified A0.3 package is merged and production deployment is accepted.

A0.1 production-surface cleanup, A0.2 Navigation & RBAC truth, and A0.3 runtime/config cleanup are implementation-complete and verified. Next primary Admin work:

1. Merge/deploy the verified A0.3 package and confirm the resulting Admin production deployment is `READY` from the merged `main` SHA.
2. After production acceptance, close Phase A0 and advance primary Admin work to **Phase A1 — Customer, Order & Fulfillment Operations**.
3. Start A1 with the bounded A1.1 customer-master review: list/search/filter scalability, customer detail action hierarchy, status/account/portal validation, address/default-address behavior, and audit visibility.
"""
new_next = """Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup** until the post-merge A0.3 Codex follow-up is merged and production-accepted.

PR #113 is merged and its Admin Vercel deployment is `READY`, but post-merge Codex review identified one P1 and one P2 runtime/config gap that must be closed before the phase exit. Next primary Admin work:

1. Complete and verify the bounded A0.3 Codex follow-up: source-wide `NEXT_PUBLIC_*` allowlist and configuration-owned Store activation origin with no preview-host fallback.
2. Merge/deploy that follow-up and confirm the resulting Admin production deployment is `READY` from the merged `main` SHA.
3. Then close Phase A0, advance to **Phase A1 — Customer, Order & Fulfillment Operations**, and start the bounded A1.1 customer-master review.
"""
if old_next in text:
    text = text.replace(old_next, new_next, 1)
elif new_next not in text:
    raise SystemExit("roadmap Next Action anchor not found")
roadmap.write_text(text)
