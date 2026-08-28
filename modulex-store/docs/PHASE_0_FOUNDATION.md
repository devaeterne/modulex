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

## Completed in foundation package 2

- [x] Removed the artificial route preloader from the root application flow
- [x] Removed Locomotive Scroll from the root application flow
- [x] Removed the obsolete Zustand scroll store
- [x] Replaced navbar scroll tracking with passive native scrolling + `requestAnimationFrame`
- [x] Added native smooth scrolling with `prefers-reduced-motion` support
- [x] Removed the ThemeToggle `useSearchParams` client-render bailout
- [x] Added an optimized `next/image` hero poster
- [x] Prevented mobile/reduced-motion users from loading the panorama runtime
- [x] Deferred desktop panorama loading until after initial rendering
- [x] Added Organization and WebSite JSON-LD infrastructure
- [x] Audited the live Supabase product/customer/order/pricing schema
- [x] Audited current RLS policies for future public/portal access

## Supabase findings

The existing Modulex database already contains useful B2B foundations:

- `products` with `base_product_code`, `color_code`, `color_name`, brand/category relations and product metadata
- `price_groups` and `product_prices`
- `customers.price_group_id`
- `customers.portal_enabled`
- `customer_portal_users`
- `customer_orders` and `customer_order_items`

### Security boundary

Current RLS policies correctly restrict the master product, pricing, customer and order tables to authenticated internal roles. There is no anonymous/public product policy yet.

Store architecture must therefore introduce a deliberately narrow public catalog surface. `product_prices` must never become anonymously readable. Portal access must be scoped to the authenticated portal user's own customer record and orders rather than granting generic `authenticated` access.

### Store schema gaps to solve before catalog migration

The master `products` table currently does not contain dedicated Store presentation fields such as:

- public SEO slug
- publication state / publish scheduling
- primary marketing image and gallery ordering
- SEO title / description / Open Graph image
- marketing copy separate from operational product description
- downloadable catalog/datasheet relationships
- featured/collection placement

These fields should not be silently packed into the existing generic `metadata` JSON. Store-specific content should have an explicit CMS/presentation model managed by Modulex Admin and linked to the master product record.

The requested dealer price visibility policy is also not yet represented by a dedicated global/customer-level setting. It will be introduced later as an explicit policy rather than inferred from `price_group_id`.

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
- Duplicate/unused theme assets under `public/assets`
- Legacy audio files

### Performance work already completed

- Locomotive Scroll removed from the root runtime
- Zustand scroll state removed
- Route preloader removed
- Pannellum/WebGL no longer initializes during the initial mobile experience
- Hero fallback migrated to `next/image`

## Remaining Phase 0 work

1. Add Supabase SSR/browser client utilities using pinned `@supabase/ssr` + `@supabase/supabase-js` packages once the lockfile can be regenerated and verified.
2. Establish concrete public product/CMS data-access implementations after the Store presentation schema is approved.
3. Add Breadcrumb and Product structured data when real dynamic routes are introduced; Product JSON-LD must not expose fake prices/offers.
4. Replace raw `<img>` usage incrementally with `next/image` on routes that will survive the template migration.
5. Audit and remove unused global CSS/assets after visual verification on Vercel.
6. Remove dead `locomotive-scroll` dependency after regenerating `package-lock.json`.
7. Create Lighthouse/PageSpeed checkpoints for Home, Products, Product Detail and Dealer Application.
8. Verify production canonical URL, sitemap and robots output once the Vercel/domain URL is available.

## Product rule

Oakwell Store is a product presentation and B2B portal website, not an ecommerce checkout application. Public pricing is disabled. Dealer/customer pricing, if introduced, is policy-controlled by the admin platform.
