# GC-3 Production Acceptance — Company Identity, Contact, About & Showroom

Date: 2026-08-29

**GC-3: complete / production-accepted.**

## Scope accepted

- Structured `company_contact_channels`, `company_locations`, and `company_location_hours` domains with Admin-only write boundaries.
- Narrow public projection `get_store_public_company_locations()` for active structured rows.
- Admin `/store/company` under `store.manage`, reusing the canonical company-profile editor for scalar identity.
- Public Contact preserves canonical profile contact data and optionally augments it from the active structured projection.
- About remains on the existing published About CMS plus verified company-profile contract.
- Public `/showroom` renders only explicitly published showroom locations and has a truthful empty state when none are published.
- Showroom is present in public Navbar/Footer navigation.

## Truth and security acceptance

GC-3 does not infer or auto-seed a showroom from the primary company address. It does not invent hours, directions/map URLs, alternate channels, or showroom media. Anonymous direct table access remains revoked; public reads use the dedicated projection. Admin writes remain authenticated/RLS-controlled and browser code receives no service-role/elevated key.

Production DB/advisor evidence was captured with implementation PR #132 after migration `20260829192009_gc3_company_domain`:

- `company_contact_channels = 0`
- `company_locations = 0`
- `company_location_hours = 0`
- public projection: `{ "contactChannels": [], "locations": [] }`
- no new GC-3 security warning or missing-FK-index warning was introduced

Those empty counts are evidence of the no-seed migration state, not a requirement that operators keep the domains empty after business-approved content is entered.

## Verification evidence

Implementation PR #132 merged as `2eaabcb9d87278f6b9bf78c586f34cb35f131fd5`. Acceptance was rechecked on current production baseline `c0adbfbb431973a3acb4a94902341ac64b11c1de`, which contains that merge.

- GitHub Actions `33271713693`: **success**
  - Store deterministic smoke contracts: success
  - Store lint: success
  - Admin deterministic smoke contracts, including `smoke:gc3-company-admin`: success
  - Admin lint: success
  - diff whitespace check: success
- Vercel Admin production deployment `dpl_9WnAgdgBfmcZCFvYfLC5cqzPFMn5`: **READY** from `c0adbfbb431973a3acb4a94902341ac64b11c1de`.
- Vercel Store production deployment `dpl_EUiv9aeznJhwYG4Zz1oPBPytVDSd`: **READY** from `c0adbfbb431973a3acb4a94902341ac64b11c1de`.
- Live `/about`: 200, indexable, CMS-backed About content with verified company contact data.
- Live `/contact`: 200, indexable, canonical company contact cards plus the native first-party inquiry form.
- Live `/showroom`: 200, indexable, Navbar/Footer links present, and the truthful `No showroom locations are currently published.` state with Contact CTA.

The closeout CI intentionally reran the deterministic smoke/lint surface. Credential-bound Admin API/DB and Store API live suites were not duplicated inside this documentation closeout run; the production DB/RLS/advisor evidence already belongs to PR #132, and the current production routes/deployments were checked directly. No schema, RLS, RPC, production data, or runtime code is mutated by this closeout.

## Deferred ownership

- GC-4 owns Project Consultation / Contact form migration and only business-approved new fields/options.
- GC-5 owns curated project/media association and final Gallery acceptance.
- Showroom hours, directions, location rows, and media remain unpublished until explicitly business-approved and entered through the controlled domains.

## Closeout

GC-3 is closed. The next Granite package is **GC-4 — Contact / Project Consultation**.
