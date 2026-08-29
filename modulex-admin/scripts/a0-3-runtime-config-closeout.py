from pathlib import Path
import sys

run_id = sys.argv[1]
baseline = "7b19a5cf417092c6088aff91747e4c1da7c0019f"
path = Path("ADMIN_ROADMAP.md")
text = path.read_text()

text = text.replace(
    "Main baseline: `6cbd27198d930cb129b912fa4faece3bf967e292`",
    f"Main baseline: `{baseline}`",
    1,
)

old_a03 = """## A0.3 Runtime/config cleanup

- [ ] Align package metadata/name with Modulex Admin rather than template identity.
- [ ] Review `.env.example` and runtime environment requirements.
- [ ] Review Vercel production configuration and Admin subdomain assumptions.
- [ ] Ensure no client bundle can receive Supabase service-role/secret credentials.
"""

new_a03 = f"""## A0.3 Runtime/config cleanup

- [x] Align package metadata/name with Modulex Admin rather than template identity.
  - `package.json` and the root package entries in `package-lock.json` now use `modulex-admin`; dependency versions and the lock graph remain unchanged.
- [x] Review `.env.example` and runtime environment requirements.
  - `.env*` is ignored by default with an explicit `!.env.example` exception, and the tracked example remains value-free while documenting browser-safe, server-only, and local/CI smoke variables.
  - `docs/ADMIN_RUNTIME_CONFIG.md` is the runtime/environment ownership contract and `npm run smoke:runtime-config` guards it.
- [x] Review Vercel production configuration and Admin subdomain assumptions.
  - Verified deployment metadata identifies Vercel project `modulex`, root directory `modulex-admin`, production branch `main`, and a `READY` production deployment. Hostname/custom-domain aliases remain Vercel configuration-owned and are not hardcoded in source.
  - The connected project/domain-detail endpoint did not expose the custom-domain alias during this package, so no unverified hostname is recorded as canonical; `NEXT_PUBLIC_SITE_URL` is the deployment-owned Admin origin.
- [x] Ensure no client bundle can receive Supabase service-role/secret credentials.
  - The browser client remains limited to `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the elevated client remains `server-only`, prefers `SUPABASE_SECRET_KEY`, and retains `SUPABASE_SERVICE_ROLE_KEY` only as a legacy fallback.
  - The runtime-config contract fails if privileged key/password/DB variables are introduced with `NEXT_PUBLIC_`, if the browser client references elevated Supabase keys, or if the elevated client loses its server-only boundary.
  - TDD evidence: Actions run `33255658800` failed on the legacy package identity before implementation; targeted GREEN run `33255818899` passed the runtime-config contract with the minimized lockfile identity delta.
  - Full deterministic verification: Actions run `{run_id}` passed runtime-config, production-surface, RBAC, secondary CMS Admin, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check. Credential-bound API/DB live smoke was not rerun because this package changes no schema, RLS, RPC, API, or production data behavior.
"""

if old_a03 not in text:
    raise SystemExit("A0.3 roadmap block not found")
text = text.replace(old_a03, new_a03, 1)

old_next = """Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.

A0.1 production-surface cleanup and retained-surface residue audit are implementation-complete and verified, and **A0.2 Navigation & RBAC truth is implementation-complete and fully verified, including PR #106 warehouse list mutation hardening**. Next primary Admin work:

1. Execute A0.3 runtime/config cleanup: package identity, `.env.example` contract, Vercel Admin-domain assumptions, and client/server secret boundaries.
2. Re-run the relevant Admin verification chain after the A0.3 package and keep this roadmap current.
3. Close Phase A0 only after A0.3 satisfies its runtime/config exit criteria.
"""

new_next = """Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup** until the verified A0.3 package is merged and production deployment is accepted.

A0.1 production-surface cleanup, A0.2 Navigation & RBAC truth, and A0.3 runtime/config cleanup are implementation-complete and verified. Next primary Admin work:

1. Merge/deploy the verified A0.3 package and confirm the resulting Admin production deployment is `READY` from the merged `main` SHA.
2. After production acceptance, close Phase A0 and advance primary Admin work to **Phase A1 — Customer, Order & Fulfillment Operations**.
3. Start A1 with the bounded A1.1 customer-master review: list/search/filter scalability, customer detail action hierarchy, status/account/portal validation, address/default-address behavior, and audit visibility.
"""

if old_next not in text:
    raise SystemExit("Next Action block not found")
text = text.replace(old_next, new_next, 1)

path.write_text(text)
