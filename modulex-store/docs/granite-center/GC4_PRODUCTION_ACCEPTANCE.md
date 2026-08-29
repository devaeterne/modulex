# GC-4 Production Acceptance — Contact / Project Consultation

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
