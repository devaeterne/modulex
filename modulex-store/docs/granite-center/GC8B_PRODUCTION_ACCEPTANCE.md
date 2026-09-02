# GC-8B Production Acceptance — Accessibility + Performance

Status: **COMPLETE / migration QA accepted**  
Date: **2026-09-02**

## Scope

GC-8B closes the Granite Center → Oakwell migration QA package for:

- public/portal accessibility semantics;
- keyboard/focus behavior guarded by deterministic contracts;
- mobile-safe public/auth surfaces;
- production Lighthouse baseline/tuning evidence;
- LCP/CLS review;
- sitemap/indexing verification;
- final Store lint/build/smoke/live health.

This closeout does **not** claim that the broader Store Phase 2.6 performance/accessibility backlog is finished. In particular, the current homepage lab LCP remains above the usual 2.5 s “good” threshold, and the Lighthouse accessibility score is 94 rather than 100. Those remain optimization/audit work, not blockers for completing the Granite migration QA package.

Vendor Catalog is outside this workstream.

## Delivery lineage

- GC-8B implementation PR **#172** merged as `34d7174f069a107a319c07270133a5125ef6a680`.
- Production Store deployment inspected during closeout was `READY` on commit `709279a92119f664a780a1663a305f9f16c5771a`.
- The production commit is a direct descendant of the GC-8B merge commit, so the accessibility/performance implementation is present in the running Store.
- This closeout branch was created from execution-time `main` `ceaa85699120fa3c3ff8b60231fe799199d0a543` after Admin VAL-2/VAL-4 closeout #259 merged. No Vendor Catalog files are changed here.

## Accessibility and keyboard contract

The permanent `smoke:gc8b-accessibility` contract verifies the migration-critical keyboard/accessibility behavior:

- a closed legacy lightbox is removed from the focus/accessibility tree;
- open lightboxes expose dialog semantics and accessible names;
- Escape closes the global lightbox;
- the CMS project lightbox retains its opener, enters the dialog deterministically, traps Tab focus, and restores opener focus;
- mobile navigation exposes state/current-page semantics, closes with Escape, and returns focus to the burger trigger;
- duplicate dark-mode branding is decorative to assistive technology;
- public project cover/media rows fail closed when required alt text is missing;
- lead form error/success feedback is announced and primary form labels remain associated;
- decorative inline icons remain hidden from assistive technology;
- panorama iframe content keeps an accessible title.

During closeout, the roadmap’s reduced-motion requirement was rechecked directly against the actual global app stylesheet. `src/app/globals.css` already contains a global `@media (prefers-reduced-motion: reduce)` safeguard that disables smooth scrolling and collapses repeated animations/transitions. The GC-8B contract was extended to guard that existing behavior permanently. No runtime CSS change was necessary.

The first closeout contract commit intentionally pointed the new assertion at the legacy stylesheet and produced a RED `smoke:gc8b-accessibility` failure in Actions run `33680644594`. Source inspection established that the real global safeguard already lives in `src/app/globals.css`; the corrected regression guard then passed in GC-8B Actions run `33680809587`.

This acceptance is based on deterministic keyboard/focus contracts plus live production DOM/route inspection. It does not claim a separate physical device-farm certification.

## Production surface verification

The following live Store surfaces returned HTTP 200 during closeout and exposed the expected Oakwell structures:

- `/` — public Home;
- `/products` — public catalog;
- `/products/2db30` — real published Product Detail;
- `/contact` — labelled public lead form;
- `/account` → Account Login;
- `/dealer` → Dealer Login.

Live inspection also confirmed:

- Account and Dealer auth pages emit `noindex, nofollow`;
- account/dealer email/password fields retain explicit labels, required state and autocomplete semantics;
- Contact fields retain explicit labels/IDs and required state;
- primary navigation exposes labelled controls and current-page semantics in the deployed markup;
- the duplicate dark logo is decorative;
- Product Detail media carries non-empty alt text;
- Store uses local Next font assets rather than Google Fonts CSS.

Vercel runtime inspection found **no Store runtime errors in the inspected 24-hour window**.

## Lighthouse evidence

### Earlier GC-8B baseline/tuning evidence

The original GC-8B package recorded a mobile Home baseline before the major asset/font cleanup of approximately:

| Metric | Earlier baseline |
| --- | ---: |
| Performance | 70 |
| Accessibility | 94 |
| SEO | 100 |
| LCP | 4.887 s |
| CLS | 0.000 |
| TBT | 188 ms |
| Render-blocking estimate | ~2.26 s |

After the GC-8B implementation, a later production run `33625223030` recorded Performance 81, Accessibility 94, SEO 100, LCP 3.236 s, CLS 0.000, TBT 381 ms and render-blocking estimate ~80 ms.

### Fresh closeout production run

GC-8B Actions run **`33680809587`** completed successfully on 2026-09-02 and captured a fresh production mobile Home Lighthouse sample:

| Metric | Fresh closeout |
| --- | ---: |
| Performance | **93** |
| Accessibility | **94** |
| SEO | **100** |
| LCP | **2.950 s** |
| CLS | **0.000** |
| TBT | **39 ms** |
| FCP | 1.1 s |
| Speed Index | 4.0 s |
| Server response | 20 ms |
| Main-thread work | 1.1 s |
| Bootup | 0.4 s |
| Render-blocking estimate | ~220 ms |
| Unused JS estimate | 28 KiB |
| Unused CSS estimate | 52 KiB |

The package materially improves the migration baseline, especially render-blocking, main-thread work and LCP. Lighthouse is a lab sample and can vary between runs; these numbers are not represented as field Core Web Vitals.

### Residual performance status

- **CLS is clean at 0.000** in the sampled production run.
- **LCP 2.950 s remains “needs improvement”** relative to the common <=2.5 s good threshold.
- Accessibility remains **94**, so broader contrast/semantic auditing remains valid Phase 2.6 work.
- Unused JS/CSS estimates remain non-zero.

Therefore GC-8B migration acceptance may close, while the general Store Phase 2.6 “key pages meet agreed Core Web Vitals targets” exit gate remains open.

## Asset/font tuning verified

The GC-8B permanent performance contract and optimized-build checks verify:

- Bootstrap Icons font/class dependency is no longer part of the Store rendering path;
- bootstrap-icons stylesheet leakage is blocked;
- Google Fonts stylesheet loading is removed;
- Outfit and Playfair are delivered through Next font handling/local assets;
- legacy literal font-family regressions are blocked;
- production build output is scanned for the removed font/icon delivery paths.

## Sitemap and indexing

Live production verification confirmed:

- `/robots.txt` returns HTTP 200;
- `/api/`, `/account/`, and `/dealer/` are disallowed in robots;
- `/sitemap.xml` returns HTTP 200;
- sitemap includes production public routes such as Home, About, Products, Contact, Dealers Apply, Gallery, Cabinet Process and the published product detail;
- Account/Dealer portal/auth routes are absent from the sitemap.

## Final CI

GC-8B Actions run **`33680809587`** is GREEN.

`store-verification` passed:

- `smoke:gc8b-accessibility`;
- `smoke:gc8b-performance`;
- GC-8A regression;
- gallery/theme/GC-5 regression;
- public production contract;
- portal public-navbar regression;
- showroom SEO regression;
- scoped lint;
- Store production build;
- optimized-build delivery checks.

`production-lighthouse-baseline` also passed and produced the fresh metrics above.

## Result

**GC-8B — COMPLETE / production-accepted for the Granite migration workstream.**

Overall Granite **GC-8 may close** because managed chrome/SEO (GC-8A) and migration accessibility/performance QA (GC-8B) are both production-verified.

The broader Store Phase 2.6 remains intentionally open for residual accessibility/performance engineering, especially multi-page Lighthouse coverage, LCP <=2.5 s work, remaining unused CSS/JS, contrast/focus audit depth, and other frontend cleanup not required to prove the Granite migration itself safe.
