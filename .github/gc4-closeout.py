from pathlib import Path

BASELINE = "406bd374a4b4a7738a1a785709f3b277d21e4410"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} marker not found")
    return text.replace(old, new, 1)


store = Path("modulex-store/STORE_ROADMAP.md")
text = store.read_text()
text = replace_once(
    text,
    "Main baseline: `c0adbfbb431973a3acb4a94902341ac64b11c1de`",
    f"Main baseline: `{BASELINE}`",
    "Store baseline",
)
text = replace_once(
    text,
    "- [ ] GC-4 — Contact / Project Consultation Form migration.",
    "- [x] GC-4 — Contact / Project Consultation Form migration.\n  - Production acceptance: `docs/granite-center/GC4_PRODUCTION_ACCEPTANCE.md`.",
    "Store GC-4",
)
text = replace_once(
    text,
    "1. Start **GC-4 — Contact / Project Consultation Form migration** from the current `main`, preserving the native `/api/leads` security/attribution path and adding only business-approved fields/options.\n2. Keep Gallery/Projects `[~]`; GC-5 still owns curated project/media association and final public Gallery acceptance.\n3. GC-3 is closed. Do not seed unconfirmed showroom locations, hours, directions, or showroom media as a shortcut during GC-4.",
    "1. Start **GC-5 — Projects / Gallery migration** from the latest `main`; keep the existing Phase 2.1 Gallery/Projects `[~]` dependency explicit until curated production project/media acceptance closes it.\n2. GC-4 is production-accepted. Form option values remain intentionally empty until business-approved values are configured in Admin; do not seed guessed project types or consultation intents.\n3. Preserve GC-4's native `/api/leads`, attribution/privacy boundaries, dealer-document isolation, and public-wrapper/private-definer RPC architecture while GC-5 proceeds.",
    "Store next action",
)
store.write_text(text)

granite = Path("modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md")
text = granite.read_text()
marker = "GC-3 production acceptance: `modulex-store/docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md`"
if marker in text and "GC-4 production acceptance:" not in text:
    text = text.replace(
        marker,
        marker + "\nGC-4 production acceptance: `modulex-store/docs/granite-center/GC4_PRODUCTION_ACCEPTANCE.md`",
        1,
    )
text = replace_once(
    text,
    """## GC-4 — Contact / Project Consultation

Goal: replace parent form behavior with configurable first-party Oakwell lead capture.

- `[ ]` define approved business-configurable form options;
- `[ ]` extend DB/API only for approved new fields;
- `[ ]` add Admin management/visibility where needed;
- `[ ]` keep validation/security behavior code-owned;
- `[ ]` verify spam/privacy/attribution flow;
- `[ ]` keep customer file upload deferred unless a new explicit decision approves it.""",
    """## GC-4 — Contact / Project Consultation

Goal: replace parent form behavior with configurable first-party Oakwell lead capture.

- `[x]` define the Admin-managed business-configurable option domain without seeding unapproved option values;
- `[x]` extend DB/API only for approved project-consultation fields while preserving backward-compatible general inquiries;
- `[x]` add Admin management/visibility through `/store/leads/form-options` and the Project Consultation lead-detail panel;
- `[x]` keep validation/security behavior code-owned and preserve the public SECURITY INVOKER → private SECURITY DEFINER submission boundary;
- `[x]` verify privacy/marketing separation, attribution persistence, option validation, and dealer/project-field isolation;
- `[x]` keep customer file upload deferred; dealer supporting-document behavior remains unchanged.

**Exit gate:** `[x]` GC-4 is production-accepted. Migration `gc4_contact_project_consultation` is applied, Store/Admin production builds are READY on main `406bd374a4b4a7738a1a785709f3b277d21e4410`, live `/contact` exposes General Inquiry / Project Consultation, and the empty public option projection fails closed until business-approved option values are configured. Evidence: `docs/granite-center/GC4_PRODUCTION_ACCEPTANCE.md`.""",
    "Granite GC-4 block",
)
text = replace_once(
    text,
    """1. Start **GC-4 — Contact / Project Consultation** from the latest `main`.
2. Preserve the existing native `/api/leads` path, same-origin/spam/privacy protections, UTM/referrer attribution, and separate marketing consent.
3. Add only business-approved consultation fields/options; mutable business choices must be Admin/data-managed, while validation/security behavior remains code-owned.
4. Keep customer file upload deferred unless separately approved; dealer supporting-document infrastructure remains private and separately scoped.
5. Keep Gallery/Projects `[~]`; GC-5 owns curated project/media association and final Gallery acceptance.""",
    """1. Start **GC-5 — Projects / Gallery migration** from the latest `main`.
2. Use the existing `store_projects` + `store_project_media` foundation and GC-2 media/provenance domain; do not publish parent projects until cabinet relevance, attribution, and media review are approved.
3. Keep Phase 2.1 Gallery/Projects `[~]` until GC-5 supplies at least one approved published project/media set and live Gallery acceptance passes.
4. GC-4 is closed. Do not seed project-type or consultation-intent values unless the business approves them; the Store intentionally hides empty configurable selects.
5. Preserve customer-upload deferral, dealer document isolation, and all GC-4 lead security/attribution boundaries.""",
    "Granite next action",
)
granite.write_text(text)

admin = Path("modulex-admin/ADMIN_ROADMAP.md")
text = admin.read_text()
text = replace_once(
    text,
    "Main baseline: `8cce1b0c065e66c3939a96704b05aa6c96f2b3d8`",
    f"Main baseline: `{BASELINE}`",
    "Admin baseline",
)
text = replace_once(
    text,
    "Current cross-roadmap package: **Granite Center → Oakwell GC-3 company identity, Contact, About & Showroom is production-accepted and complete. GC-4 — Contact / Project Consultation is the next Granite package; Admin primary work remains Phase A1 and the current Admin next action remains A1.2C**",
    "Current cross-roadmap package: **Granite Center → Oakwell GC-4 Contact / Project Consultation is production-accepted and complete. GC-5 — Projects / Gallery is the next Granite package; Admin primary Phase A1 work remains independently owned by its current roadmap next action.**",
    "Admin cross-roadmap",
)
admin.write_text(text)

acceptance = Path("modulex-store/docs/granite-center/GC4_PRODUCTION_ACCEPTANCE.md")
acceptance.write_text("""# GC-4 Production Acceptance — Contact / Project Consultation

Date: 2026-08-29
Status: **PRODUCTION ACCEPTED**

## Delivered scope

GC-4 keeps `/contact` and the native `/api/leads` path, keeps `lead_type = contact`, and adds `request_kind = general_inquiry | project_consultation`. Project consultation supports optional project address, city, postal code, preferred consultation date, and Admin-managed project-type / consultation-intent keys. Existing `message` remains the notes field.

Customer project uploads remain out of scope. Dealer supporting-document behavior remains separate and unchanged.

## Repository / deployment evidence

- Design spec: `docs/superpowers/specs/2026-08-29-gc4-contact-project-consultation-design.md`.
- Implementation plan: `docs/superpowers/plans/2026-08-29-gc4-contact-project-consultation.md`.
- Implementation PR: **#138 — `feat: deliver GC-4 contact project consultation`**.
- PR #138 merged as `bbe14c48fefbf08a08f9627cefa6ee3c3b7a0526`.
- Production verification baseline: main `406bd374a4b4a7738a1a785709f3b277d21e4410`, which contains the GC-4 merge.
- Store production deployment `dpl_7qoDSFfLVzFKuqTvSstMmN9sE4My` is READY from that main SHA. The build compiled successfully, passed TypeScript, generated `/contact` and `/api/leads`, and completed deployment.
- Admin production deployment `dpl_CP331iPmZH2KdnJw1YURTfJjFX8i` is READY from the same main SHA. The build route manifest contains `/store/leads`, `/store/leads/[id]`, and `/store/leads/form-options`.

## Supabase acceptance

Production project: `bzjoeernnmvuhzyvbowc`.

Migration `20260829205718_gc4_contact_project_consultation` is applied.

Fresh verification after migration confirmed:

- `store_leads.request_kind` exists;
- `store_lead_form_options` exists with **0 rows** — no unapproved business option values were seeded;
- `public.submit_store_lead(jsonb)` is **SECURITY INVOKER**;
- `store_api_private.submit_store_lead(jsonb)` is **SECURITY DEFINER**;
- `anon` can execute the public submit wrapper;
- `authenticated` cannot execute the public submit wrapper;
- `anon` has no direct `SELECT` on `store_lead_form_options`;
- the sole form-options RLS policy targets `authenticated` and requires `super_admin` or `admin`;
- the public options RPC returns an empty result while no active options are configured, so Store rendering fails closed.

Transaction-scoped submission verification created and rolled back both a General Inquiry and a Project Consultation. The values confirmed request kind, privacy acknowledgement, independent marketing consent, source/UTM attribution, and project location/preferred-date fields. Separate rejection assertions confirmed that an unapproved project option key is rejected and dealer applications cannot carry project-consultation fields.

## Live Store acceptance

The production Store deployment returns HTTP 200 for `/contact` and renders `Contact or Project Consultation`, `How can we help?`, `General Inquiry`, `Project Consultation`, the existing privacy acknowledgement, and the separate marketing-consent checkbox.

Because the production option table is intentionally empty, no project-type / consultation-intent options are invented or rendered.

## Advisor review

Supabase security advisor was rerun after migration. It reported no GC-4-specific exposed SECURITY DEFINER warning. Existing warnings for older public Store content/project RPCs and leaked-password protection remain outside GC-4 scope.

Performance advisor reported an informational missing covering index for `store_lead_form_options.updated_by` plus the newly created public-order index as unused immediately after creation. These are not GC-4 correctness/security blockers; the FK index can be handled in the normal performance-hardening backlog if desired.

## Scope boundaries retained

- No Wufoo or Contact Form 7 dependency.
- No customer project upload.
- No seeded project type, consultation intent, service area, installation promise, SLA, promotion, or appointment guarantee.
- No direct anonymous form-options table access.
- No browser elevated/service key.
- Dealer document token hashing/private supporting-document flow remains isolated.
- UTM / landing-page / referrer attribution and privacy-vs-marketing separation remain intact.

## Closeout

GC-4 is production-accepted. The next Granite package is **GC-5 — Projects / Gallery migration**. GC-5 retains ownership of curated project/media association and final Gallery production acceptance.
""")
