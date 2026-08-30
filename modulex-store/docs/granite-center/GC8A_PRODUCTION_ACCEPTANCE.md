# GC-8A Production Acceptance — Managed Store Chrome + Technical SEO

Date: 2026-08-30
Status: **PRODUCTION ACCEPTED**

## Delivered scope

GC-8A makes ordinary public navigation/footer labels, order and approved destinations data-owned through Admin → Supabase → the narrow published Store projection while keeping route allowlists and fixed Account/Contact behavior code-owned. It also normalizes managed technical SEO, structured data and indexing behavior without making Granite Center a runtime content or media backend.

## Repository / deployment evidence

- Implementation PR: **#169 — `feat(store): deliver GC-8A managed chrome and technical SEO`**.
- PR #169 merged to `main` as `d41f7c19ce81016b6a1a05166d0a4089104bfe52` on 2026-08-30.
- Final PR branch CI was green before merge; Store and Admin GC-8A verification jobs passed.
- Vercel Store project `oakwell` production deployment `dpl_4H8Dat4Ru72Ntozz48kJsgKJK2MQ` is `READY` from the same merge commit. A second production deployment for the same merge commit is also `READY`.
- Production host used for live acceptance: `https://oakwell-phi.vercel.app`.

## Live public chrome acceptance

Production `/` returns HTTP 200 and renders the approved managed chrome projection in order:

- Primary: Home, About, Products, Showroom, Gallery, Dealers.
- Footer Products: Product Catalog, Product Support.
- Footer Company: About Us, Showroom, Contact.

The public Account icon and Contact Us CTA remain code-owned. The server-rendered Store state exposes the exact 11 published `store_chrome_items` rows expected by the GC-8A contract.

Production `/account` and `/dealer` both return HTTP 200 through their login surfaces, retain the public Navbar, keep their portal auth shell, and do not render a duplicate public footer. Their metadata remains `noindex, nofollow`.

## Technical SEO acceptance

Live verification confirmed:

- `/` title is `Oakwell Cabinetry | Cabinet Products & Dealer Support` with no duplicate managed suffix;
- `/about` title is `About Oakwell Cabinetry | Granite & Cabinet Center Brand` with no duplicate suffix and a canonical `/about` URL;
- `/showroom` title is `Oakwell Cabinetry Showroom Information | Virginia`, canonicalizes to `/showroom`, and correctly emits `noindex, follow` while no real showroom location is published;
- Organization JSON-LD identifies `OAKWELL CABINETRY` as the public Organization/Brand and `GRANITE & CABINET CENTER` as `parentOrganization`;
- `/robots.txt` allows the public site, disallows `/api/`, `/account/` and `/dealer/`, and points to the production sitemap;
- `/sitemap.xml` returns HTTP 200 and contains only ready/indexable public routes, including Home, About, Products, Contact, Dealer Apply, Gallery, Cabinet Process and the published product route; Showroom is intentionally absent while it is `noindex`;
- live public media resolves from Oakwell local assets or managed Supabase storage. Granite Center URLs remain attribution/provenance evidence only and are not used as the Store runtime content/media backend.

## Scope boundaries retained

- No arbitrary public navigation href input; destinations remain code allowlisted.
- No browser elevated/service key.
- No portal shell/sidebar replacement.
- No conversion of Granite Center into the public Organization identity.
- No Granite WordPress/runtime media dependency.
- No invented showroom/location data to force indexability.
- GC-8B accessibility/performance tuning remains separate and is not claimed by this closeout.

## Closeout

GC-8A is production-accepted and may be marked `[x]`. Overall GC-8 remains `[~]` until **GC-8B — Accessibility + performance acceptance** completes its accessibility, keyboard/mobile, Lighthouse/Core Web Vitals, LCP/CLS, indexing and final live-verification gates.
