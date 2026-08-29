# GC-3 — Company Identity, Contact, About & Showroom Design Spec

## Status

Approved on 2026-08-29.

## Goal

Complete GC-3 by making verified company identity, contact channels, physical locations/showrooms, and public About/Contact/Showroom rendering first-class structured content without inventing business facts or reopening GC-2/GC-5 media scope.

## Existing System

- `public.general_settings` is the scalar source of truth for the company display/legal identity, logo, primary email/phone/website, and primary company address.
- Admin already manages `general_settings` through `CompanyProfileSettings`.
- Store already consumes `get_store_public_profile` server-side through `getStorePublicCompanyProfile()`.
- `/about` already combines the public company profile with published `store_pages.slug = 'about'` CMS content.
- `/contact` already renders primary company email/phone/address plus the lead form.
- Secondary page CMS remains the source of editorial About copy and SEO. GC-3 must not create a parallel About content system.

## Architectural Decision

Use a structured company domain.

`general_settings` remains the single-row scalar identity source. Repeating or independently publishable business facts use relational tables:

- `company_contact_channels`
- `company_locations`
- `company_location_hours`

The public Store never queries those tables directly. A typed RPC projection exposes active, verified/public-safe rows. Admin may edit the underlying rows through authenticated Supabase access protected by RLS and the existing admin-role authorization pattern.

## Truth and Publishing Rules

1. Company address is not automatically a showroom.
2. A migration must not seed a showroom, hours, map URL, WhatsApp number, social link, or alternate contact channel unless the repository or production data already contains an explicitly verified value.
3. Empty data is valid. Public UI hides empty sections instead of generating placeholder claims.
4. Only active rows appear in the public projection.
5. Showroom UI renders only `company_locations.location_type = 'showroom'`.
6. GC-3 does not import project/gallery media and does not use rejected legacy showroom imagery.
7. Existing `general_settings` primary contact data remains valid and continues to render even when the new repeatable tables are empty.

## Database Model

### `company_contact_channels`

Purpose: repeatable, typed company contact methods beyond the scalar primary contact fields.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `channel_type text not null` constrained to `email`, `phone`, `website`, `other`
- `label text not null`
- `value text not null`
- `href text null`
- `sort_order integer not null default 0`
- `is_active boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Validation is intentionally conservative. `value` is stored as display text; `href` is optional so admins can supply `mailto:`, `tel:`, or HTTPS links without the database inventing transformations.

### `company_locations`

Purpose: offices, showrooms, warehouses, or other externally relevant physical locations.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `location_type text not null` constrained to `office`, `showroom`, `warehouse`, `other`
- `name text not null`
- `email text null`
- `phone text null`
- `address_line_1 text null`
- `address_line_2 text null`
- `city text null`
- `state_region text null`
- `postal_code text null`
- `country_code text null`
- `map_url text null`
- `sort_order integer not null default 0`
- `is_active boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

At least a meaningful `name` is required for an admin row, but public presentation additionally requires the row to be active. No location is seeded automatically.

### `company_location_hours`

Purpose: structured weekly hours for a location.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `location_id uuid not null references company_locations(id) on delete cascade`
- `day_of_week smallint not null check (day_of_week between 0 and 6)`
- `opens_at time null`
- `closes_at time null`
- `is_closed boolean not null default false`
- `note text null`
- unique `(location_id, day_of_week)`

A closed day may omit times. GC-3 does not manufacture hours when no verified hours exist.

## Security

- RLS is enabled on all three tables.
- `anon` receives no direct table privileges.
- Authenticated admin editing follows the existing profile-role model and is limited to `super_admin` and `admin`.
- Public reads happen through a dedicated RPC projection; direct anonymous table reads remain revoked.
- RPC function execution is explicitly granted only to `anon` and `authenticated` as required and is not left implicitly executable by `PUBLIC`.
- No service-role key is introduced into browser code.

## Public Projection

Add `get_store_public_company_locations()` returning JSON with two arrays:

```json
{
  "contactChannels": [],
  "locations": []
}
```

Each location contains its structured address fields and an ordered `hours` array. Only active channels and locations are returned. Hours are returned only for active locations. Ordering is deterministic by `sort_order`, then stable labels/names.

The existing `get_store_public_profile` remains unchanged to avoid breaking existing clients.

## Admin Experience

Add `/store/company` as the Store-facing company workspace protected by the same `store.manage` route/sidebar authorization used by other Store CMS surfaces.

The workspace has three sections:

1. **Identity** — reuses `CompanyProfileSettings`; no second identity form or duplicated state.
2. **Contact Channels** — list/create/edit/delete repeatable channels with explicit Active state and sort order.
3. **Locations & Showrooms** — list/create/edit/delete locations, edit weekly hours, and explicitly mark Active.

The UI must communicate that a location is not public until Active. There is no automatic publish-on-save behavior.

## Store Experience

### About

Keep existing `store_pages.slug = 'about'` editorial CMS. Continue using the company profile for verified identity/contact facts. Do not duplicate About prose into company tables.

### Contact

Render:

- existing primary email/phone/address from `general_settings`, when present;
- active structured contact channels;
- active locations;
- existing inquiry form.

Empty structured lists do not remove the existing primary contact path.

### Showroom

Add `/showroom`.

- Render only active locations whose `locationType` is `showroom`.
- Show address/contact/map link only when supplied.
- Show weekly hours only when supplied.
- If there are no active showrooms, render a factual empty-state directing users to Contact rather than claiming a location exists.
- No legacy showroom image is required for GC-3.

## Validation

Admin client validation reuses existing email/phone/http helpers where applicable. Country codes remain two-letter ISO-style values, matching `general_settings`. Map URLs must be HTTP(S) when present. Links are never converted from untrusted arbitrary schemes.

## Testing Strategy

Follow RED → GREEN per deliverable.

- Store contract test first asserts the new RPC migration contract and Store query adapter are absent/incorrect, then passes after implementation.
- Admin contract test first asserts `/store/company`, workspace components, and Store RBAC/sidebar presence, then passes after implementation.
- Store public contract test first asserts Contact and `/showroom` consume the structured company projection and that empty showroom state is truthful, then passes after implementation.
- Existing smoke suites, lint, and build remain required before PR completion.

## Out of Scope

- Gallery/Projects media population
- showroom imagery ingestion
- maps API integration or geocoding
- dealer-locator replacement
- social-media management
- marketing claims or new business copy not supported by verified sources
- changing GC-2 media publication rules

## Acceptance Criteria

GC-3 is complete when:

1. Structured contact/location/hour schema exists with RLS and explicit grants.
2. No showroom or hours are auto-seeded.
3. Admin `/store/company` can manage identity, channels, locations, and hours under Store RBAC.
4. Store has a typed public company-structure query.
5. Contact renders structured public data without losing current primary profile behavior.
6. About remains driven by existing About CMS plus verified identity.
7. `/showroom` renders only active showroom rows and has a truthful no-showroom state.
8. Contract tests demonstrate the new behavior and existing smoke suites/builds are green.
