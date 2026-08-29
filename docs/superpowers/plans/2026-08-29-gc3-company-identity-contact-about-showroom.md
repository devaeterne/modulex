# GC-3 Company Identity, Contact, About & Showroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build structured verified company contact/location data, an Admin Store company workspace, and truthful public Contact/About/Showroom rendering.

**Architecture:** Keep `general_settings` as scalar identity truth, add relational contact/location/hour tables, and expose active structured rows through a dedicated RPC projection. Reuse the existing About CMS and `CompanyProfileSettings` instead of creating duplicate identity/editorial systems.

**Tech Stack:** PostgreSQL/Supabase RLS + RPC, Next.js 16 App Router, React 19, TypeScript, Supabase JS, Node contract/smoke tests.

**Spec:** `docs/superpowers/specs/2026-08-29-gc3-company-identity-contact-about-showroom.md`

## Global Constraints

- Do not auto-seed a showroom from the primary company address.
- Do not invent business hours, map URLs, alternate contact methods, or marketing claims.
- Keep `get_store_public_profile` backward compatible.
- Keep direct anonymous table access revoked; public Store reads structured rows through RPC.
- Browser code must not use service-role/elevated keys.
- Gallery/Projects media population and showroom imagery are outside GC-3.

---

### Task 1: Database schema and public company projection

**Files:**
- Create: `modulex-store/scripts/gc3-company-domain-contract.mjs`
- Create: `modulex-store/supabase/migrations/20260829213000_gc3_company_domain.sql`
- Modify: `modulex-store/package.json`

**Interfaces:**
- Produces tables `company_contact_channels`, `company_locations`, `company_location_hours`.
- Produces RPC `public.get_store_public_company_locations()` returning `{ contactChannels, locations }` JSON.
- Later tasks consume the exact camelCase public projection keys defined by the contract test.

- [ ] **Step 1: Write the failing schema/RPC contract**

Create `modulex-store/scripts/gc3-company-domain-contract.mjs` that reads the GC-3 migration and asserts exact security/model markers:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase/migrations/20260829213000_gc3_company_domain.sql");
assert.equal(fs.existsSync(migrationPath), true, "GC-3 migration must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

for (const table of ["company_contact_channels", "company_locations", "company_location_hours"]) {
  assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`, "i"));
}
assert.match(sql, /get_store_public_company_locations\(\)/i);
assert.match(sql, /revoke all on function public\.get_store_public_company_locations\(\) from public/i);
assert.match(sql, /grant execute on function public\.get_store_public_company_locations\(\) to anon, authenticated/i);
assert.doesNotMatch(sql, /insert\s+into\s+public\.company_locations/i, "migration must not seed a location/showroom");
console.log("GC-3 company domain contract passed");
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd modulex-store && node scripts/gc3-company-domain-contract.mjs
```

Expected: FAIL because `20260829213000_gc3_company_domain.sql` does not exist.

- [ ] **Step 3: Implement the migration**

Create the migration with:

```sql
create table if not exists public.company_contact_channels (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null check (channel_type in ('email','phone','website','other')),
  label text not null check (length(btrim(label)) > 0),
  value text not null check (length(btrim(value)) > 0),
  href text,
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_locations (
  id uuid primary key default gen_random_uuid(),
  location_type text not null check (location_type in ('office','showroom','warehouse','other')),
  name text not null check (length(btrim(name)) > 0),
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  map_url text,
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_location_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.company_locations(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  note text,
  unique (location_id, day_of_week),
  check (is_closed or (opens_at is not null and closes_at is not null))
);
```

Then enable RLS on all three tables, add admin-only CRUD policies using the existing `profiles.role in ('super_admin','admin')` authorization pattern, revoke `anon` direct table access, and create deterministic indexes for `is_active, sort_order` and `location_id, day_of_week`.

Create `get_store_public_company_locations()` as a SQL/PLpgSQL function returning JSON with camelCase keys. It must filter `is_active = true`, order channels/locations by `sort_order`, attach ordered hours to each active location, revoke function execute from `PUBLIC`, and explicitly grant execute to `anon, authenticated`.

- [ ] **Step 4: Add package script and run GREEN**

Add:

```json
"smoke:gc3-company-domain": "node scripts/gc3-company-domain-contract.mjs"
```

Run:

```bash
cd modulex-store && npm run smoke:gc3-company-domain
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modulex-store/scripts/gc3-company-domain-contract.mjs modulex-store/supabase/migrations/20260829213000_gc3_company_domain.sql modulex-store/package.json
git commit -m "feat: add GC-3 company domain schema"
```

---

### Task 2: Admin Store company workspace

**Files:**
- Create: `modulex-admin/scripts/gc3-company-admin-contract.mjs`
- Create: `modulex-admin/src/app/(admin)/store/company/page.tsx`
- Create: `modulex-admin/src/components/store/StoreCompanyManager.tsx`
- Create: `modulex-admin/src/lib/store/company.ts`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Consumes `general_settings`, `company_contact_channels`, `company_locations`, `company_location_hours`.
- Reuses `CompanyProfileSettings` for identity.
- Produces Admin route `/store/company` protected in navigation by `store.manage`.

- [ ] **Step 1: Write the failing Admin contract**

Create a Node contract that reads the route, manager, sidebar, package file and asserts:

```js
assert.match(sidebar, /name:\s*"Company"[\s\S]*path:\s*"\/store\/company"[\s\S]*permission:\s*"store\.manage"/);
assert.match(page, /StoreCompanyManager/);
assert.match(manager, /CompanyProfileSettings/);
assert.match(manager, /company_contact_channels/);
assert.match(manager, /company_locations/);
assert.match(manager, /company_location_hours/);
assert.match(manager, /is_active/);
```

- [ ] **Step 2: Run RED**

```bash
cd modulex-admin && node scripts/gc3-company-admin-contract.mjs
```

Expected: FAIL because `/store/company` and manager do not exist.

- [ ] **Step 3: Add typed Admin domain helpers**

In `src/lib/store/company.ts`, define:

```ts
export type CompanyContactChannelType = "email" | "phone" | "website" | "other";
export type CompanyLocationType = "office" | "showroom" | "warehouse" | "other";
export type CompanyLocationHour = {
  id: string;
  location_id: string;
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
  note: string | null;
};
```

Also define full row types for channels and locations and small normalizers that trim optional strings and uppercase country codes.

- [ ] **Step 4: Implement `StoreCompanyManager`**

The client manager must:

- reuse `<CompanyProfileSettings />` for scalar identity;
- fetch current profile and set `canEdit` only for `super_admin`/`admin`;
- query channels ordered by `sort_order,label`;
- query locations ordered by `sort_order,name`;
- query hours ordered by `day_of_week`;
- create/update/delete channel rows;
- create/update/delete location rows;
- upsert/delete weekly hours per location;
- validate emails/phones/http URLs with existing helpers before writes;
- never silently activate a new row; defaults remain inactive;
- show an explicit “Inactive — not public” state for unpublished rows.

Use direct authenticated Supabase client access only; do not introduce service-role keys.

- [ ] **Step 5: Add route and sidebar**

Create `src/app/(admin)/store/company/page.tsx` with metadata and `<PageBreadcrumb pageTitle="Store Company" />` plus `<StoreCompanyManager />`.

Add this Store submenu entry near Site Content/Pages:

```ts
{ name: "Company", path: "/store/company", permission: "store.manage", exact: true },
```

- [ ] **Step 6: Add package script and run GREEN**

Add:

```json
"smoke:gc3-company-admin": "node scripts/gc3-company-admin-contract.mjs"
```

Run:

```bash
cd modulex-admin && npm run smoke:gc3-company-admin
```

Expected: PASS.

- [ ] **Step 7: Run focused existing RBAC contracts**

```bash
cd modulex-admin && npm run smoke:rbac && npm run smoke:production-surface
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modulex-admin/scripts/gc3-company-admin-contract.mjs modulex-admin/src/app/\(admin\)/store/company/page.tsx modulex-admin/src/components/store/StoreCompanyManager.tsx modulex-admin/src/lib/store/company.ts modulex-admin/src/layout/AppSidebar.tsx modulex-admin/package.json
git commit -m "feat: add GC-3 company admin workspace"
```

---

### Task 3: Public Store structured company rendering

**Files:**
- Create: `modulex-store/scripts/gc3-company-public-contract.mjs`
- Create: `modulex-store/src/app/showroom/page.tsx`
- Modify: `modulex-store/src/lib/store/company/queries.ts`
- Modify: `modulex-store/src/app/contact/page.tsx`
- Modify: `modulex-store/src/app/about/page.tsx`
- Modify: `modulex-store/package.json`

**Interfaces:**
- Consumes RPC `get_store_public_company_locations()`.
- Produces `getStorePublicCompanyLocations()` with typed camelCase DTOs.
- `/contact` and `/showroom` use the DTO; `/about` continues existing About CMS + profile behavior.

- [ ] **Step 1: Write failing public contract**

Create a Node contract that asserts:

```js
assert.match(queries, /getStorePublicCompanyLocations/);
assert.match(queries, /get_store_public_company_locations/);
assert.match(contact, /getStorePublicCompanyLocations/);
assert.match(showroom, /locationType\s*===\s*"showroom"/);
assert.match(showroom, /No showroom locations are currently published/);
assert.match(showroom, /href="\/contact"/);
assert.doesNotMatch(showroom, /img\(\d+\)\.jpg|showroom.*\.jpg/i);
assert.match(about, /getStorePublicPage\("about"\)/);
```

- [ ] **Step 2: Run RED**

```bash
cd modulex-store && node scripts/gc3-company-public-contract.mjs
```

Expected: FAIL because the structured query and `/showroom` route do not exist.

- [ ] **Step 3: Add public DTO/query**

Extend `src/lib/store/company/queries.ts` with:

```ts
export type StorePublicCompanyHour = {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
  note: string | null;
};

export type StorePublicCompanyLocation = {
  id: string;
  locationType: "office" | "showroom" | "warehouse" | "other";
  name: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  countryCode: string | null;
  mapUrl: string | null;
  hours: StorePublicCompanyHour[];
};

export type StorePublicCompanyStructure = {
  contactChannels: Array<{ id: string; channelType: "email" | "phone" | "website" | "other"; label: string; value: string; href: string | null }>;
  locations: StorePublicCompanyLocation[];
};
```

Implement `getStorePublicCompanyLocations()` via `callPublicRpc(..., { revalidate: 900 })`.

- [ ] **Step 4: Integrate Contact**

Fetch the scalar profile and structured projection in parallel with `Promise.allSettled` so one source failing does not erase the other. Preserve existing primary email/phone/address cards and lead form. Add active projected channels and locations only when returned by the RPC. Render supplied `href` only for safe `mailto:`, `tel:`, `http://`, or `https://` schemes; otherwise render display text without a link.

- [ ] **Step 5: Add Showroom route**

Create `/showroom` with metadata/canonical `/showroom`. Filter:

```ts
const showrooms = (structure?.locations ?? []).filter(
  (location) => location.locationType === "showroom"
);
```

For each showroom render name, available address lines, optional email/phone, optional HTTP(S) map link, and supplied hours. If `showrooms.length === 0`, render exactly:

```tsx
<p>No showroom locations are currently published.</p>
<Link href="/contact" className="btn-primary">Contact Oakwell Cabinetry</Link>
```

Do not render or reference legacy showroom imagery.

- [ ] **Step 6: Preserve About architecture**

Keep About editorial content coming from `getStorePublicPage("about")` and verified identity from `getStorePublicCompanyProfile()`. Only refactor shared safe helpers if required; do not move About prose into the new company domain.

- [ ] **Step 7: Add package script and run GREEN**

Add:

```json
"smoke:gc3-company-public": "node scripts/gc3-company-public-contract.mjs"
```

Run:

```bash
cd modulex-store && npm run smoke:gc3-company-public
```

Expected: PASS.

- [ ] **Step 8: Run focused existing Store contracts**

```bash
cd modulex-store && npm run smoke:public-production && npm run smoke:secondary-cms-contract && npm run smoke:store-public-content
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add modulex-store/scripts/gc3-company-public-contract.mjs modulex-store/src/app/showroom/page.tsx modulex-store/src/lib/store/company/queries.ts modulex-store/src/app/contact/page.tsx modulex-store/src/app/about/page.tsx modulex-store/package.json
git commit -m "feat: render GC-3 company contact and showrooms"
```

---

### Task 4: Roadmap, regression verification, and PR readiness

**Files:**
- Modify: `modulex-store/STORE_ROADMAP.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md` only if it contains the shared GC-3 status marker.

**Interfaces:**
- Consumes all Task 1–3 deliverables.
- Produces the GC-3 completion record and final verification evidence.

- [ ] **Step 1: Run full contract/smoke suites**

```bash
cd modulex-store && npm test
cd ../modulex-admin && npm test
```

Expected: all contracts pass.

- [ ] **Step 2: Run lint and production builds**

```bash
cd modulex-store && npm run lint && npm run build
cd ../modulex-admin && npm run lint && npm run build
```

Expected: zero TypeScript/build errors and no new lint failures.

- [ ] **Step 3: Verify production database after applying the migration**

Query exact counts and RPC behavior:

```sql
select count(*) from public.company_contact_channels;
select count(*) from public.company_locations;
select count(*) from public.company_location_hours;
select public.get_store_public_company_locations();
```

Expected immediately after migration unless verified rows are deliberately entered: zero rows in all new tables and `{ "contactChannels": [], "locations": [] }` from the public projection. This proves GC-3 did not manufacture showroom facts.

- [ ] **Step 4: Run Supabase security/performance advisors**

Confirm no new RLS/security or missing-index warnings are introduced by the three GC-3 tables/function.

- [ ] **Step 5: Update roadmap**

Mark GC-3 complete only after Tasks 1–4 verification is green. Keep Gallery/Projects media-dependent work deferred to its existing later GC phase.

- [ ] **Step 6: Commit roadmap evidence**

```bash
git add modulex-store/STORE_ROADMAP.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: close GC-3 company identity phase"
```

- [ ] **Step 7: Open non-draft PR**

PR title:

```text
feat: complete GC-3 company identity and showroom
```

PR body must summarize schema/RLS/RPC, Admin workspace, public Contact/About/Showroom behavior, truth/no-seed guarantees, and exact RED/GREEN/full-suite verification evidence.
