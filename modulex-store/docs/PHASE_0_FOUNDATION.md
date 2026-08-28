# Phase 0 — Store Foundation

This document tracks the technical foundation work required before Oakwell Cabinetry content, products, dealer applications, and customer/dealer portal features are implemented.

## Target

- Next.js runtime on Vercel (not static export)
- Server Components by default
- Supabase-backed dynamic content and product data
- Strong technical SEO foundation
- Core Web Vitals / PageSpeed-first implementation
- Admin-managed content instead of theme placeholders

## Completed in foundation package 1

- [x] Removed `output: "export"`
- [x] Removed `images.unoptimized`
- [x] Enabled AVIF/WebP image optimization
- [x] Disabled `X-Powered-By`
- [x] Added compression configuration
- [x] Added central site configuration
- [x] Added root metadata defaults and title template
- [x] Added Open Graph defaults
- [x] Added Twitter card defaults
- [x] Added Googlebot metadata defaults
- [x] Added `robots.ts`
- [x] Added initial `sitemap.ts`
- [x] Added `.env.example`

## Legacy/theme inventory

The current theme contains functionality and content that must not become production behavior by accident.

### Replace with dynamic data

- `src/data/products.ts` — placeholder products and prices
- Home page services/content blocks
- Fake project statistics
- Fake testimonials
- Fake blog posts
- Placeholder contact information
- Placeholder social links
- Placeholder CTA telephone number
- EmailJS placeholder configuration

### Remove from product experience

- Public prices
- Sale prices
- Quantity selector
- Add to cart
- Shipping messaging
- Fake ratings/reviews
- Ecommerce-oriented product behavior

### Performance review required

- Global Bootstrap CSS
- Bootstrap Icons font/CSS
- Large legacy `style.css`
- Legacy dark mode stylesheet
- Locomotive Scroll
- Zustand scroll state
- Route preloader delays
- Pannellum/WebGL panorama initialization in the first viewport
- Duplicate/unused theme assets under `public/assets`
- Legacy audio files

## Next foundation package

1. Remove artificial route preloader delay.
2. Replace global Locomotive Scroll dependency with native scrolling where possible.
3. Audit and remove unused global CSS/assets without changing the approved visual direction.
4. Add Supabase SSR/browser client utilities using `@supabase/ssr` and publishable keys.
5. Establish data-access boundaries for products and CMS content.
6. Add structured-data helpers (Organization, WebSite, Breadcrumb, Product where appropriate).
7. Replace raw `<img>` usage incrementally with `next/image` and correct `sizes`/priority behavior.
8. Create PageSpeed/Lighthouse verification checkpoints for key routes.

## Product rule

Oakwell Store is a product presentation and B2B portal website, not an ecommerce checkout application. Public pricing is disabled. Dealer/customer pricing, if introduced, is policy-controlled by the admin platform.
