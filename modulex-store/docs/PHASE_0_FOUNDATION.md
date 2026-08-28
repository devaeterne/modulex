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

## Completed in foundation package 3 — data foundation

- [x] Confirmed 462 SKU rows map to 154 base products across NB / NT / WH variants
- [x] Added explicit Store presentation tables for product content, media, and color options
- [x] Seeded 154 unpublished base-product content records
- [x] Added read-only public catalog/product/company RPCs
- [x] Kept prices, costs, inventory, reservations, customers, and orders outside the public contract
- [x] Revoked anonymous direct table access to Store presentation tables
- [x] Added native server-side public RPC data-access utilities
- [x] Versioned and applied the Store catalog Supabase migrations

## Completed in foundation package 4 — product catalog transition

- [x] Added server-rendered `/products` catalog route backed by the Store DAL
- [x] Added server-rendered `/products/[slug]` product detail route
- [x] Added product search by product code / SKU through the existing public RPC
- [x] Added batch reads so the 100-row RPC safety cap does not truncate the 154-product catalog
- [x] Added dynamic product metadata and canonical URLs
- [x] Added BreadcrumbList structured data on product detail pages
- [x] Added published product URLs to the sitemap
- [x] Added optimized Supabase Storage image support through `next/image`
- [x] Replaced `/shop` and `/shop/[slug]` with permanent redirects to `/products`
- [x] Removed the dummy ecommerce product dataset
- [x] Removed price, sale price, quantity, cart, shipping, wishlist, and fake review UI from the product experience
- [x] Updated Navbar and Home hero product links to `/products`
- [x] Kept the public Store DAL server-only and request-deduplicated product-detail reads

## Supabase findings

The existing Modulex database already contains useful B2B foundations:

- `products` with `base_product_code`, `color_code`, `color_name`, brand/category relations and product metadata
- `price_groups` and `product_prices`
- `customers.price_group_id`
- `customers.portal_enabled`
- `customer_portal_users`
- `customer_orders` and `customer_order_items`

### Security boundary

Master product, pricing, customer, and order tables remain internal. Anonymous Store access is limited to explicit read-only public RPC projections. `product_prices` is not anonymously readable. Portal access must later be scoped to the authenticated portal user's own customer record and orders rather than granting generic `authenticated` access.

### Store presentation model

Store-specific content is kept outside the operational `products.metadata` JSON and managed through explicit presentation tables. This separates marketing/SEO/media concerns from operational SKU data.

The requested dealer price visibility policy is not yet represented by a dedicated global/customer-level setting. It will be introduced later as an explicit policy rather than inferred from `price_group_id`.

## Legacy/theme inventory

The current theme still contains functionality and content that must not become production behavior by accident.

### Replace with dynamic data

- Home page services/content blocks
- Fake project statistics
- Fake testimonials
- Fake blog posts
- Placeholder contact information
- Placeholder social links
- Placeholder CTA telephone number
- Temporary EmailJS transport

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
- Product catalog imagery uses `next/image`

## Remaining Phase 0 work

1. Add Modulex Admin management screens for Store product content, media, publish state, SEO fields, and color presentation.
2. Add Supabase SSR/browser auth utilities when portal/auth work begins and package lock regeneration can be verified.
3. Add Product structured data after published catalog content contains sufficient real product information; do not expose fake prices/offers.
4. Replace remaining raw `<img>` usage incrementally with `next/image` on routes that will survive the template migration.
5. Audit and remove unused global CSS/assets after visual verification on Vercel.
6. Remove dead `locomotive-scroll` dependency after regenerating `package-lock.json`.
7. Create Lighthouse/PageSpeed checkpoints for Home, Products, Product Detail and Dealer Application.
8. Verify production canonical URL, sitemap and robots output against the manual Vercel deployment and final domain.
9. Replace remaining theme placeholders with Admin-managed Oakwell content and company settings.

## Product rule

Oakwell Store is a product presentation and B2B portal website, not an ecommerce checkout application. Public pricing is disabled. Dealer/customer pricing, if introduced, is policy-controlled by the admin platform.
