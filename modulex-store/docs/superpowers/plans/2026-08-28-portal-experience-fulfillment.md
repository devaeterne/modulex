# P1.5 Portal Experience & Fulfillment Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-quality Oakwell Customer/Dealer portal with one Store theme system, customer-isolated read-only fulfillment visibility, and Dealer-only catalog pricing, documents, and account visibility.

**Architecture:** Keep the P1.4 Auth/portal-context boundary authoritative and add narrow private SQL functions with authenticated public wrappers that always derive customer ownership from `auth.uid()`. Build one shared Oakwell `PortalAuthShell` and `PortalShell` in the Store, reuse shared presentation components for Customer and Dealer, and keep Dealer-only commercial/document behavior behind explicit server-side gates. Apply database work through migrations and prove ownership/grant/field filtering with rollback smoke tests before production fixtures are removed.

**Tech Stack:** Next.js 16.1.6 App Router, React 19.2.x, TypeScript 5.x, Supabase Auth/SSR/Postgres/Storage, Node `.mjs` contract tests, existing Store CSS/Bootstrap-compatible markup, Admin Tailwind UI.

**Spec:** `modulex-store/docs/superpowers/specs/2026-08-28-portal-experience-fulfillment-visibility-design.md`

## Global Constraints

- Authentication uses trusted Auth `app_metadata.account_type` values `customer_portal` and `dealer_portal` only.
- Portal customer ownership is derived from `auth.uid()` through the existing Store portal context; no public portal RPC accepts `customer_id` as an authorization selector.
- Customer portal access still requires `customers.portal_enabled`, active customer state, active portal-user state, and matching account/customer type.
- Store must not contain Supabase service-role/secret credentials.
- Customer portal remains non-priced in P1.5.
- Dealer pricing is enabled only for an assigned `customers.price_group_id` whose group is active, `available_for_orders = true`, and `internal_only = false`.
- Missing Dealer tier price never falls back silently to List Price.
- Official invoices/e-invoices, payments, credit/account statements, and legal/accounting promises are out of scope.
- Existing `customer_documents` rows remain external-hidden by default; Dealer visibility must be explicit.
- Public wrappers revoke `PUBLIC`/`anon` execution and grant only `authenticated` where required.
- Foreign resource IDs return neutral unavailable/not-found results.
- No production test data may remain after rollback smoke verification.
- Do not merge PRs or trigger Vercel deployment automatically.

---

## File Structure and Responsibility Map

### Store shared portal UI

- Create `modulex-store/src/components/portal/PortalAuthShell.tsx` — shared Oakwell auth-page chrome.
- Create `modulex-store/src/components/portal/PortalShell.tsx` — protected Customer/Dealer workspace chrome.
- Create `modulex-store/src/components/portal/PortalNavigation.tsx` — responsive role-aware navigation.
- Create `modulex-store/src/components/portal/PortalPageHeader.tsx` — consistent page headings/actions.
- Create `modulex-store/src/components/portal/PortalStatusBadge.tsx` — text + color lifecycle status.
- Create `modulex-store/src/components/portal/PortalEmptyState.tsx` — shared empty/unavailable state.
- Create `modulex-store/src/components/portal/PortalTimeline.tsx` — shipment/installation lifecycle timeline.
- Create `modulex-store/src/app/portal.css` — scoped Oakwell portal/auth visual system using existing Store variables.
- Modify `modulex-store/src/components/ThemeToggle.tsx` — one `theme` persistence key plus one-time `oakwell-theme` migration.

### Store auth/portal route presentation

- Modify Account login/forgot/reset/activate pages/forms under `modulex-store/src/app/account` to use `PortalAuthShell`.
- Modify legacy Dealer auth pages/forms under `modulex-store/src/app/dealer` to use the same shell.
- Modify `modulex-store/src/app/account/(portal)/layout.tsx` and `modulex-store/src/app/dealer/(portal)/layout.tsx` to use `PortalShell`.
- Modify existing Account/Dealer Order pages and `PortalOrderList.tsx` / `PortalOrderDetail.tsx` to use the shared portal presentation primitives.

### Fulfillment data and UI

- Create migration `modulex-store/supabase/migrations/20260828XXXXXX_store_portal_fulfillment_visibility.sql` with dashboard, shipment and installation private/public RPC pairs.
- Create `modulex-store/src/lib/portal/fulfillment.ts` — typed Store RPC helpers.
- Create `modulex-store/src/components/portal/PortalShipmentList.tsx`.
- Create `modulex-store/src/components/portal/PortalShipmentDetail.tsx`.
- Create `modulex-store/src/components/portal/PortalInstallationList.tsx`.
- Create `modulex-store/src/components/portal/PortalInstallationDetail.tsx`.
- Create Customer and Dealer `/shipments` and `/installations` list/detail routes.
- Modify Customer and Dealer Overview pages to consume a shared dashboard-summary RPC.

### Dealer catalog/pricing

- Create migration `modulex-store/supabase/migrations/20260828XXXXXX_store_dealer_catalog_pricing.sql` with Dealer pricing gate, protected catalog and Dealer order-detail functions.
- Create `modulex-store/src/lib/portal/dealer.ts` — Dealer catalog/pricing/account/document typed helpers.
- Create `modulex-store/src/components/portal/DealerCatalog.tsx`.
- Create Dealer `/catalog` route.
- Extend `PortalOrderDetail.tsx` with an explicit optional priced shape used only by Dealer pages.

### Dealer documents/account

- Create migration `modulex-store/supabase/migrations/20260828XXXXXX_store_dealer_documents_account.sql` adding `customer_documents.portal_visible`, private bucket setup/policies, Dealer document/account functions.
- Create `modulex-store/src/app/dealer/(portal)/documents/page.tsx`.
- Create `modulex-store/src/app/dealer/(portal)/documents/[id]/download/route.ts` — authenticated short-lived signed URL flow.
- Create `modulex-store/src/app/dealer/(portal)/account/page.tsx`.
- Modify `modulex-admin/src/components/customers/CustomerCard.tsx` to upload/manage Dealer-visible customer documents explicitly.
- Modify `modulex-admin/src/lib/customers/types.ts` if the `CustomerDocument` type needs the new boolean/storage fields.

### Tests

- Create `modulex-store/scripts/portal-experience-contract.mjs` — UI/theme/route/static security contract.
- Create `modulex-store/tests/smoke/store-portal-fulfillment.smoke.sql`.
- Create `modulex-store/tests/smoke/store-dealer-pricing.smoke.sql`.
- Create `modulex-store/tests/smoke/store-dealer-documents.smoke.sql`.
- Create/extend Admin contract `modulex-admin/scripts/store-portal-admin-contract.mjs` for document visibility and pricing authority.
- Modify Store/Admin `package.json` smoke scripts to include new contracts without dropping existing suites.

---

# P1.5A — Oakwell Portal UI Foundation

### Task 1: Add a failing P1.5 presentation contract

**Files:**
- Create: `modulex-store/scripts/portal-experience-contract.mjs`
- Modify: `modulex-store/package.json`

**Interfaces:**
- Consumes: existing Account/Dealer route files, `ThemeToggle.tsx`, existing portal components.
- Produces: `npm run smoke:portal-experience` as the focused P1.5 static contract.

- [ ] **Step 1: Write the failing contract**

Create a Node contract that reads source files and asserts the new shared structure before it exists:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

assert.equal(exists("src/components/portal/PortalAuthShell.tsx"), true);
assert.equal(exists("src/components/portal/PortalShell.tsx"), true);
assert.equal(exists("src/components/portal/PortalNavigation.tsx"), true);
assert.equal(exists("src/app/portal.css"), true);

const themeToggle = read("src/components/ThemeToggle.tsx");
assert.match(themeToggle, /localStorage\.setItem\(["']theme["']/);
assert.doesNotMatch(themeToggle, /localStorage\.setItem\(["']oakwell-theme["']/);

for (const file of [
  "src/app/account/(auth)/login/page.tsx",
  "src/app/account/(auth)/forgot-password/page.tsx",
  "src/app/account/(auth)/reset-password/page.tsx",
  "src/app/account/activate/page.tsx",
  "src/app/dealer/(auth)/login/page.tsx",
  "src/app/dealer/(auth)/forgot-password/page.tsx",
  "src/app/dealer/(auth)/reset-password/page.tsx",
  "src/app/dealer/activate/page.tsx",
]) {
  assert.match(read(file), /PortalAuthShell/);
}

assert.match(read("src/app/account/(portal)/layout.tsx"), /PortalShell/);
assert.match(read("src/app/dealer/(portal)/layout.tsx"), /PortalShell/);

console.log("P1.5 portal experience contract PASS");
```

Add the focused script and append it to Store smoke:

```json
{
  "scripts": {
    "smoke:portal-experience": "node scripts/portal-experience-contract.mjs",
    "smoke": "npm run smoke:client && npm run smoke:api && npm run smoke:dealer-activation && npm run smoke:dealer-auth && npm run smoke:store-portal && npm run smoke:portal-experience"
  }
}
```

- [ ] **Step 2: Run the focused contract and record RED**

Run:

```bash
cd modulex-store
npm run smoke:portal-experience
```

Expected: FAIL because `PortalAuthShell.tsx` / `PortalShell.tsx` do not yet exist.

- [ ] **Step 3: Commit the RED contract**

```bash
git add modulex-store/scripts/portal-experience-contract.mjs modulex-store/package.json
git commit -m "test: define p1.5 portal experience contract"
```

### Task 2: Unify Store theme persistence and build shared portal/auth primitives

**Files:**
- Create: `modulex-store/src/app/portal.css`
- Create: `modulex-store/src/components/portal/PortalAuthShell.tsx`
- Create: `modulex-store/src/components/portal/PortalShell.tsx`
- Create: `modulex-store/src/components/portal/PortalNavigation.tsx`
- Create: `modulex-store/src/components/portal/PortalPageHeader.tsx`
- Create: `modulex-store/src/components/portal/PortalStatusBadge.tsx`
- Create: `modulex-store/src/components/portal/PortalEmptyState.tsx`
- Create: `modulex-store/src/components/portal/PortalTimeline.tsx`
- Modify: `modulex-store/src/components/ThemeToggle.tsx`
- Modify: Store root layout only if required to import `portal.css` once.

**Interfaces:**
- Consumes: Store `ThemeToggle`, existing global CSS variables and Oakwell logo assets.
- Produces:
  - `PortalAuthShell({ title, subtitle, children, footer? })`
  - `PortalShell({ kind, companyName, portalRole, signOutAction, children })`
  - `PortalNavigation({ kind })`
  - `PortalStatusBadge({ status })`
  - `PortalTimeline({ steps })`

- [ ] **Step 1: Add a one-key theme regression assertion**

Extend `portal-experience-contract.mjs` to require only the canonical write key and permit a legacy read:

```js
assert.match(themeToggle, /localStorage\.getItem\(["']oakwell-theme["']/);
assert.match(themeToggle, /localStorage\.setItem\(["']theme["']/);
assert.doesNotMatch(themeToggle, /localStorage\.setItem\(["']oakwell-theme["']/);
```

- [ ] **Step 2: Implement one-time theme migration**

Use this state transition in `ThemeToggle.tsx`:

```ts
const canonical = window.localStorage.getItem("theme");
const legacy = window.localStorage.getItem("oakwell-theme");
const preferred = canonical ?? legacy;
const dark = preferred
  ? preferred === "dark"
  : window.matchMedia("(prefers-color-scheme: dark)").matches;

document.body.classList.toggle("dark", dark);
window.localStorage.setItem("theme", dark ? "dark" : "light");
if (legacy !== null) window.localStorage.removeItem("oakwell-theme");
```

All later toggles write only `theme`.

- [ ] **Step 3: Implement the shared auth shell**

Use the existing Store brand components/assets and ThemeToggle. The component API must remain presentation-only:

```tsx
type PortalAuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function PortalAuthShell({ title, subtitle, children, footer }: PortalAuthShellProps) {
  return (
    <main className="portal-auth-shell">
      <header className="portal-auth-shell__topbar">
        <a href="/" className="portal-brand" aria-label="Oakwell Cabinetry home">Oakwell Cabinetry</a>
        <ThemeToggle />
      </header>
      <section className="portal-auth-card" aria-labelledby="portal-auth-title">
        <h1 id="portal-auth-title">{title}</h1>
        {subtitle ? <p className="portal-muted">{subtitle}</p> : null}
        {children}
        {footer ? <div className="portal-auth-card__footer">{footer}</div> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Implement protected shell and navigation**

Navigation arrays are explicit and role-aware:

```ts
export const customerPortalNav = [
  ["Overview", "/account"],
  ["Orders", "/account/orders"],
  ["Shipments", "/account/shipments"],
  ["Installations", "/account/installations"],
] as const;

export const dealerPortalNav = [
  ["Overview", "/dealer"],
  ["Catalog", "/dealer/catalog"],
  ["Orders", "/dealer/orders"],
  ["Shipments", "/dealer/shipments"],
  ["Installations", "/dealer/installations"],
  ["Documents", "/dealer/documents"],
  ["Account", "/dealer/account"],
] as const;
```

`PortalNavigation` uses `usePathname()` and sets `aria-current="page"` for the active destination. `PortalShell` renders company name, portal role, ThemeToggle, navigation and the existing server sign-out action.

- [ ] **Step 5: Add scoped Oakwell portal CSS**

Define portal tokens from existing Store variables rather than hard-coded Bootstrap utility surfaces:

```css
.portal-shell,
.portal-auth-shell {
  color: var(--text-color);
  background: var(--body-bg);
}

.portal-panel {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 18px;
}

.portal-focusable:focus-visible,
.portal-nav-link:focus-visible,
.portal-button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
  outline-offset: 2px;
}
```

Use responsive rules so protected navigation becomes compact/mobile-friendly without horizontal page overflow.

- [ ] **Step 6: Run focused lint/contract**

```bash
cd modulex-store
npm run smoke:portal-experience
npx eslint src/components/ThemeToggle.tsx src/components/portal/PortalAuthShell.tsx src/components/portal/PortalShell.tsx src/components/portal/PortalNavigation.tsx src/components/portal/PortalPageHeader.tsx src/components/portal/PortalStatusBadge.tsx src/components/portal/PortalEmptyState.tsx src/components/portal/PortalTimeline.tsx
```

Expected: contract still fails only on routes not yet migrated; lint passes.

- [ ] **Step 7: Commit shared UI foundation**

```bash
git add modulex-store/src/app/portal.css modulex-store/src/components/ThemeToggle.tsx modulex-store/src/components/portal
git commit -m "feat: add shared Oakwell portal shell"
```

### Task 3: Migrate every Account/Dealer auth route to PortalAuthShell

**Files:**
- Modify Account login/forgot/reset/activate page/form files.
- Modify Dealer login/forgot/reset/activate page/form files.

**Interfaces:**
- Consumes: `PortalAuthShell` from Task 2.
- Produces: visually consistent auth flows without changing existing P1.3/P1.4 authentication actions.

- [ ] **Step 1: Preserve existing authentication contracts**

Before editing, run:

```bash
cd modulex-store
npm run smoke:dealer-activation
npm run smoke:dealer-auth
npm run smoke:store-portal
```

Expected: PASS.

- [ ] **Step 2: Wrap each auth page in PortalAuthShell**

Each route must keep its current server/client authentication logic and replace only page chrome. Example:

```tsx
return (
  <PortalAuthShell
    title="Sign in to your account"
    subtitle="Use the email address connected to your Oakwell account."
    footer={<Link href="/">Back to Oakwell Cabinetry</Link>}
  >
    <AccountLoginForm />
  </PortalAuthShell>
);
```

Legacy Dealer routes keep compatibility URLs but use the same visual shell; do not add a Dealer/Customer selector.

- [ ] **Step 3: Normalize form classes/alerts**

Keep action payloads unchanged and apply shared classes/semantics:

```tsx
{error ? <div role="alert" className="portal-alert portal-alert--error">{error}</div> : null}
<input className="portal-input" ... />
<button className="portal-button portal-button--primary" ...>Sign in</button>
```

- [ ] **Step 4: Run auth regressions and focused contract**

```bash
npm run smoke:dealer-activation
npm run smoke:dealer-auth
npm run smoke:store-portal
npm run smoke:portal-experience
```

Expected: auth regressions PASS; presentation contract now fails only on protected shell/order restyle assertions, if any remain.

- [ ] **Step 5: Commit auth migration**

```bash
git add modulex-store/src/app/account modulex-store/src/app/dealer
git commit -m "feat: unify portal authentication experience"
```

### Task 4: Replace Customer/Dealer protected layouts and restyle existing Orders

**Files:**
- Modify: `modulex-store/src/app/account/(portal)/layout.tsx`
- Modify: `modulex-store/src/app/dealer/(portal)/layout.tsx`
- Modify: `modulex-store/src/app/account/(portal)/page.tsx`
- Modify: `modulex-store/src/app/dealer/(portal)/page.tsx`
- Modify existing Customer/Dealer order list/detail route files.
- Modify: `modulex-store/src/components/portal/PortalOrderList.tsx`
- Modify: `modulex-store/src/components/portal/PortalOrderDetail.tsx`

**Interfaces:**
- Consumes: existing `requireCustomerPortalContext()`, Dealer portal guard, sign-out actions, `getPortalOrders`, `getPortalOrder`, shared PortalShell components.
- Produces: P1.4 data behavior with P1.5 visual shell.

- [ ] **Step 1: Add protected-shell/order assertions**

Extend contract:

```js
for (const file of [
  "src/app/account/(portal)/layout.tsx",
  "src/app/dealer/(portal)/layout.tsx",
]) {
  const source = read(file);
  assert.match(source, /PortalShell/);
  assert.doesNotMatch(source, /bg-light|bg-white/);
}

for (const file of [
  "src/components/portal/PortalOrderList.tsx",
  "src/components/portal/PortalOrderDetail.tsx",
]) {
  assert.match(read(file), /portal-/);
}
```

- [ ] **Step 2: Convert both layouts to PortalShell**

Customer:

```tsx
const context = await requireCustomerPortalContext();
return (
  <PortalShell kind="customer" companyName={context.customer_name} portalRole={context.portal_role} signOutAction={signOut}>
    {children}
  </PortalShell>
);
```

Dealer uses `kind="dealer"` and its existing Dealer guard. Do not duplicate nav markup in layouts.

- [ ] **Step 3: Restyle Orders without adding Customer money**

The shared order components continue to consume the P1.4 non-priced types. Customer markup must never access `unit_price`, `subtotal`, `tax_amount`, `total_amount`, `grand_total`, `payment_commission`, cost, margin or internal notes.

- [ ] **Step 4: Run P1.5A verification**

```bash
cd modulex-store
npm run smoke:portal-experience
npm run smoke
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit P1.5A**

```bash
git add modulex-store/src/app/account modulex-store/src/app/dealer modulex-store/src/components/portal

git commit -m "feat: apply Oakwell portal experience"
```

---

# P1.5B — Fulfillment Visibility

### Task 5: Add RED database smoke for customer-isolated shipments/installations

**Files:**
- Create: `modulex-store/tests/smoke/store-portal-fulfillment.smoke.sql`
- Extend: `modulex-store/scripts/portal-experience-contract.mjs` with required RPC names.

**Interfaces:**
- Consumes: P1.4 portal context functions, `customer_shipments`, `customer_shipment_items`, `customer_installations`.
- Produces: rollback smoke proving field allowlists and cross-customer denial.

- [ ] **Step 1: Write transaction-scoped fixture setup**

The smoke creates two active customers, two portal identities, an order per customer, a shipment + shipment item per customer, and an installation per customer, then always ends in `rollback`.

Use explicit fixture markers such as `P15-FULFILL-A` and `P15-FULFILL-B` so residue can be queried after the run.

- [ ] **Step 2: Assert RPC contracts before implementation**

Static contract requires:

```js
const migration = read("supabase/migrations/20260828XXXXXX_store_portal_fulfillment_visibility.sql");
for (const fn of [
  "get_store_portal_dashboard_summary",
  "get_store_portal_shipments",
  "get_store_portal_shipment",
  "get_store_portal_installations",
  "get_store_portal_installation",
]) assert.match(migration, new RegExp(fn));
```

- [ ] **Step 3: Run RED**

Execute the SQL smoke against a safe test/dev database when available, or through the established temporary Actions harness used in previous phases. Expected: FAIL because RPCs do not exist yet.

- [ ] **Step 4: Commit RED smoke**

```bash
git add modulex-store/tests/smoke/store-portal-fulfillment.smoke.sql modulex-store/scripts/portal-experience-contract.mjs
git commit -m "test: define portal fulfillment isolation"
```

### Task 6: Add fulfillment RPC migration with strict allowlists

**Files:**
- Create: `modulex-store/supabase/migrations/20260828XXXXXX_store_portal_fulfillment_visibility.sql`

**Interfaces:**
- Consumes: `private.get_store_portal_context()`.
- Produces authenticated functions:
  - `public.get_store_portal_dashboard_summary()` -> `jsonb`
  - `public.get_store_portal_shipments(p_limit integer default 25, p_offset integer default 0)` -> `jsonb`
  - `public.get_store_portal_shipment(p_shipment_id uuid)` -> `jsonb`
  - `public.get_store_portal_installations(p_limit integer default 25, p_offset integer default 0)` -> `jsonb`
  - `public.get_store_portal_installation(p_installation_id uuid)` -> `jsonb`

- [ ] **Step 1: Implement private customer-id resolution helper usage**

Every private function starts from the existing context:

```sql
select * into v_context
from private.get_store_portal_context();

if not coalesce((v_context ->> 'ok')::boolean, false) then
  return jsonb_build_object('ok', false, 'reason', 'access_unavailable');
end if;

v_customer_id := (v_context ->> 'customer_id')::uuid;
```

Use the exact return shape of the existing context implementation when coding; do not accept `p_customer_id`.

- [ ] **Step 2: Implement shipment list/detail allowlists**

Shipment detail JSON includes only:

```sql
jsonb_build_object(
  'id', s.id,
  'shipment_number', s.shipment_number,
  'order_id', s.order_id,
  'order_number', o.order_number,
  'status', s.status,
  'customer_reference', s.customer_reference,
  'shipping_address', s.shipping_address_snapshot,
  'carrier', s.carrier,
  'service_level', s.service_level,
  'tracking_number', s.tracking_number,
  'picking_started_at', s.picking_started_at,
  'packed_at', s.packed_at,
  'shipped_at', s.shipped_at,
  'delivered_at', s.delivered_at,
  'cancelled_at', s.cancelled_at,
  'items', coalesce(v_items, '[]'::jsonb)
)
```

Item JSON includes only `id`, `line_no`, `sku_snapshot`, `product_name_snapshot`, `ordered_quantity_snapshot`, `shipment_quantity`.

Never emit shipment `internal_notes`, source warehouse/location IDs, stock-deduction timestamps or actor IDs.

Foreign IDs resolve to:

```sql
jsonb_build_object('ok', false, 'reason', 'shipment_unavailable')
```

- [ ] **Step 3: Implement installation list/detail allowlists**

Installation JSON includes only the spec-approved fields and joins order/shipment numbers for display. Do not return `assigned_to`, `internal_notes`, `created_by`, `updated_by`.

Foreign IDs return:

```sql
jsonb_build_object('ok', false, 'reason', 'installation_unavailable')
```

- [ ] **Step 4: Implement dashboard summary**

Return a compact JSON object scoped to the derived customer:

```json
{
  "ok": true,
  "orders": { "recent": [], "open_count": 0 },
  "shipments": { "recent": [], "active_count": 0 },
  "installations": { "recent": [], "active_count": 0 }
}
```

Recent arrays use the same allowlisted shapes as their list RPCs, with small fixed limits.

- [ ] **Step 5: Harden public wrappers/grants**

For each public wrapper:

```sql
revoke all on function public.get_store_portal_dashboard_summary() from public;
revoke all on function public.get_store_portal_dashboard_summary() from anon;
grant execute on function public.get_store_portal_dashboard_summary() to authenticated;
```

Repeat for exact signatures of all list/detail wrappers. Keep privileged logic private and search-path hardened.

- [ ] **Step 6: Run SQL smoke and residue check**

Expected assertions:

- Customer A can list/detail A shipment/install.
- Customer A cannot see B list items.
- Customer A foreign detail returns neutral unavailable.
- JSON does not contain `internal_notes`, `source_warehouse_id`, `source_location_id`, `stock_deducted_at`, `assigned_to`, actor IDs.
- suspended portal user loses access.
- anon has no execute.
- rollback leaves fixture counts at zero.

- [ ] **Step 7: Commit migration**

```bash
git add modulex-store/supabase/migrations/20260828XXXXXX_store_portal_fulfillment_visibility.sql modulex-store/tests/smoke/store-portal-fulfillment.smoke.sql
git commit -m "feat: add portal fulfillment visibility rpc"
```

### Task 7: Add typed fulfillment helpers and shared UI

**Files:**
- Create: `modulex-store/src/lib/portal/fulfillment.ts`
- Create: `modulex-store/src/components/portal/PortalShipmentList.tsx`
- Create: `modulex-store/src/components/portal/PortalShipmentDetail.tsx`
- Create: `modulex-store/src/components/portal/PortalInstallationList.tsx`
- Create: `modulex-store/src/components/portal/PortalInstallationDetail.tsx`

**Interfaces:**
- Produces:

```ts
export type PortalShipmentSummary = {
  id: string;
  shipment_number: string;
  order_id: string;
  order_number: string;
  status: string;
  customer_reference: string | null;
  carrier: string | null;
  service_level: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
};

export async function getPortalShipments(limit = 25, offset = 0): Promise<PortalShipmentSummary[]>;
export async function getPortalShipment(id: string): Promise<PortalShipmentDetailData | null>;
export async function getPortalInstallations(limit = 25, offset = 0): Promise<PortalInstallationSummary[]>;
export async function getPortalInstallation(id: string): Promise<PortalInstallationDetailData | null>;
export async function getPortalDashboardSummary(): Promise<PortalDashboardSummary>;
```

- [ ] **Step 1: Add static field-deny assertions**

Contract scans `fulfillment.ts` and new components for forbidden keys:

```js
for (const forbidden of [
  "internal_notes",
  "source_warehouse_id",
  "source_location_id",
  "stock_deducted_at",
  "assigned_to",
]) assert.doesNotMatch(read("src/lib/portal/fulfillment.ts"), new RegExp(forbidden));
```

- [ ] **Step 2: Implement RPC helpers**

Use the existing server Supabase client pattern from `orders.ts`; parse `ok/reason` and return `null` for neutral detail unavailable states instead of exposing raw ownership errors.

- [ ] **Step 3: Implement responsive list/detail components**

Use `PortalStatusBadge`, `PortalEmptyState` and `PortalTimeline`. Shipment timeline labels are `Draft`, `Picking`, `Packed`, `Shipped`, `Delivered`, with `Cancelled` terminal exception. Installation labels are `Scheduled`, `Confirmed`, `In progress`, `Completed`, with `Cancelled` terminal exception.

- [ ] **Step 4: Run focused lint**

```bash
npx eslint src/lib/portal/fulfillment.ts src/components/portal/PortalShipmentList.tsx src/components/portal/PortalShipmentDetail.tsx src/components/portal/PortalInstallationList.tsx src/components/portal/PortalInstallationDetail.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit shared fulfillment UI**

```bash
git add modulex-store/src/lib/portal/fulfillment.ts modulex-store/src/components/portal
git commit -m "feat: add portal fulfillment components"
```

### Task 8: Add Customer + Dealer fulfillment routes and dashboard summaries

**Files:**
- Create Customer shipment/install list/detail pages.
- Create Dealer shipment/install list/detail pages.
- Modify Account Overview page.
- Modify Dealer Overview page.

**Interfaces:**
- Consumes Task 7 helpers/components and existing protected route-group layouts.
- Produces all P1.5B routes from the spec.

- [ ] **Step 1: Add route-existence assertions**

Contract requires all eight list/detail page files and the two Overview pages to call `getPortalDashboardSummary`.

- [ ] **Step 2: Implement Customer routes**

Each Customer page calls `requireCustomerPortalContext()` indirectly through the protected layout and server RPC helper; no route accepts customer ownership from query/body.

Detail example:

```tsx
const shipment = await getPortalShipment(params.id);
if (!shipment) return <PortalEmptyState title="Shipment unavailable" />;
return <PortalShipmentDetail shipment={shipment} />;
```

- [ ] **Step 3: Implement Dealer routes using the same components**

Do not duplicate data types or SQL. Dealer pages use the shared fulfillment RPCs because ownership is already derived from the shared portal context.

- [ ] **Step 4: Replace Overview recent-order-only cards with dashboard summary**

Customer Overview renders Orders + Shipments + Installations with no money. Dealer Overview renders the same operational blocks; Dealer pricing availability is added later in P1.5C.

- [ ] **Step 5: Run P1.5B verification**

```bash
npm run smoke:portal-experience
npm run smoke
npm run build
```

Run the fulfillment rollback smoke against the target Supabase environment and verify zero residue.

- [ ] **Step 6: Commit P1.5B**

```bash
git add modulex-store/src/app/account modulex-store/src/app/dealer modulex-store/scripts/portal-experience-contract.mjs
git commit -m "feat: expose portal fulfillment status"
```

---

# P1.5C — Dealer Expansion

### Task 9: Add RED Dealer pricing isolation smoke

**Files:**
- Create: `modulex-store/tests/smoke/store-dealer-pricing.smoke.sql`
- Extend: `modulex-store/scripts/portal-experience-contract.mjs`

**Interfaces:**
- Consumes: published Store catalog model, customer price-group assignment, `product_prices`, shared portal context.
- Produces tests for Dealer-only catalog and priced-order boundaries.

- [ ] **Step 1: Create Dealer/Customer fixture matrix**

The smoke must cover:

1. Dealer A + active order-eligible non-internal group + matching current currency price.
2. Dealer B owning different data.
3. Customer portal identity attempting Dealer RPCs.
4. Dealer with no group.
5. Dealer with inactive group.
6. Dealer with `internal_only = true` group.
7. Dealer with `available_for_orders = false` group.
8. Dealer with eligible group but no product price in assigned tier.

All fixture changes run in a transaction and rollback.

- [ ] **Step 2: Assert desired RPC names**

Require migration functions:

```js
for (const fn of [
  "get_store_dealer_catalog_products",
  "get_store_dealer_product_by_slug",
  "get_store_dealer_order",
  "get_store_dealer_pricing_context",
]) assert.match(migration, new RegExp(fn));
```

- [ ] **Step 3: Run RED and commit**

Expected: FAIL because Dealer functions do not exist.

```bash
git add modulex-store/tests/smoke/store-dealer-pricing.smoke.sql modulex-store/scripts/portal-experience-contract.mjs
git commit -m "test: define dealer pricing isolation"
```

### Task 10: Implement Dealer pricing gate, protected catalog and priced order RPCs

**Files:**
- Create: `modulex-store/supabase/migrations/20260828XXXXXX_store_dealer_catalog_pricing.sql`

**Interfaces:**
- Produces:
  - `private.get_store_dealer_pricing_context()` / authenticated wrapper.
  - `public.get_store_dealer_catalog_products(p_query text default null, p_color_code text default null, p_limit integer default 48, p_offset integer default 0)`.
  - `public.get_store_dealer_product_by_slug(p_slug text)`.
  - `public.get_store_dealer_order(p_order_id uuid)`.

- [ ] **Step 1: Implement one pricing gate**

Return a context with no user-selectable group:

```sql
select jsonb_build_object(
  'ok', true,
  'pricing_enabled', true,
  'price_group_id', pg.id,
  'price_group_name', pg.name,
  'currency_code', c.currency_code
)
from public.customers c
join public.price_groups pg on pg.id = c.price_group_id
where c.id = v_customer_id
  and v_portal_kind = 'dealer'
  and pg.is_active
  and pg.available_for_orders
  and not pg.internal_only;
```

When any condition fails, return `pricing_enabled=false` and omit price-group identifiers from externally unnecessary payloads.

- [ ] **Step 2: Implement protected catalog using published Store content boundary**

Reuse the same product/content join rules as `get_store_catalog_products`: `store_product_content.is_published = true` + active variants only. For each variant, look up a current active `product_prices` row with:

```sql
pp.product_id = p.id
and pp.price_group_id = v_price_group_id
and pp.currency_code = v_currency_code
and pp.is_active = true
and pp.valid_from <= now()
and (pp.valid_to is null or pp.valid_to > now())
```

If pricing is disabled, omit monetary keys from JSON construction entirely. If pricing is enabled but no exact assigned-tier price exists, emit an explicit non-monetary availability marker such as `priceAvailable: false`; do not query or return List Price as fallback.

- [ ] **Step 3: Implement Dealer order detail**

First verify the order belongs to the derived Dealer customer. If pricing is enabled, add only:

- `currency_code`
- line `unit_price`, `discount_percent`, `discount_amount`, `line_subtotal`, `line_total`
- order `subtotal`, `discount_amount`, `tax_rate`, `tax_amount`, `total_amount`

Never emit `grand_total` if it includes payment commission in the current model unless it is proven equivalent to the approved order amount; prefer `total_amount` from the spec. Never emit payment commission fields, cost/margin/profit, internal notes, approval/risk metadata.

If pricing is disabled, construct the same non-monetary response shape as existing `get_store_portal_order` rather than returning money with null/CSS-hidden values.

- [ ] **Step 4: Harden grants and execute smoke**

Customer portal calls to Dealer functions must fail/return access unavailable; anon execute must be revoked. The matrix from Task 9 must PASS, including no monetary JSON keys for closed gate and no List Price fallback.

- [ ] **Step 5: Commit Dealer pricing migration**

```bash
git add modulex-store/supabase/migrations/20260828XXXXXX_store_dealer_catalog_pricing.sql modulex-store/tests/smoke/store-dealer-pricing.smoke.sql
git commit -m "feat: add protected dealer catalog pricing"
```

### Task 11: Build Dealer Catalog and conditionally priced Order UI

**Files:**
- Create: `modulex-store/src/lib/portal/dealer.ts`
- Create: `modulex-store/src/components/portal/DealerCatalog.tsx`
- Create: `modulex-store/src/app/dealer/(portal)/catalog/page.tsx`
- Modify Dealer order list/detail routes.
- Modify: `modulex-store/src/components/portal/PortalOrderDetail.tsx`
- Modify Dealer Overview page.

**Interfaces:**
- Produces:

```ts
export type DealerPricingContext = {
  pricing_enabled: boolean;
  price_group_name?: string;
  currency_code?: string;
};

export async function getDealerPricingContext(): Promise<DealerPricingContext>;
export async function getDealerCatalogProducts(...): Promise<DealerCatalogProduct[]>;
export async function getDealerProductBySlug(slug: string): Promise<DealerCatalogProductDetail | null>;
export async function getDealerOrder(id: string): Promise<DealerPortalOrderDetail | null>;
```

- [ ] **Step 1: Add forbidden-field assertions**

Contract scans Dealer types/components for `current_cost`, `cost`, `margin`, `profit`, `payment_commission`, `internal_notes` and fails on any exported Dealer payload field.

- [ ] **Step 2: Implement Dealer helpers**

Use server Supabase client only. No caller passes `customer_id`, `price_group_id`, or `currency_code` to determine access/pricing.

- [ ] **Step 3: Implement Catalog UI**

Catalog remains useful when prices are disabled:

```tsx
{product.priceAvailable && product.price
  ? <span className="portal-price">{formatCurrency(product.price, product.currencyCode)}</span>
  : <span className="portal-muted">Contact sales for pricing</span>}
```

When the overall gate is closed, explain that pricing is not available for this account without exposing internal reasons/group flags.

- [ ] **Step 4: Extend PortalOrderDetail with optional Dealer commercial block**

Use a discriminated/optional prop so Customer pages cannot accidentally gain Dealer money:

```ts
type PortalOrderDetailProps =
  | { kind: "customer"; order: PortalOrderDetailData }
  | { kind: "dealer"; order: DealerPortalOrderDetail };
```

Only the Dealer branch renders order amounts when monetary keys are present.

- [ ] **Step 5: Add pricing state to Dealer Overview**

Show a compact `Pricing available` / `Contact sales for pricing` state and Catalog quick link. Do not expose internal group flags.

- [ ] **Step 6: Run focused/full Store verification**

```bash
npm run smoke:portal-experience
npm run smoke
npm run build
```

- [ ] **Step 7: Commit Dealer catalog UI**

```bash
git add modulex-store/src/lib/portal/dealer.ts modulex-store/src/components/portal modulex-store/src/app/dealer
git commit -m "feat: add dealer catalog experience"
```

### Task 12: Add RED document visibility/storage smoke

**Files:**
- Create: `modulex-store/tests/smoke/store-dealer-documents.smoke.sql`
- Extend Admin/Store contracts.

**Interfaces:**
- Produces proof that existing rows are hidden by default and only explicit Dealer-owned visible rows are externally accessible.

- [ ] **Step 1: Write database assertions**

Smoke requires:

```sql
select portal_visible from public.customer_documents where ...;
-- expected false for rows inserted without explicit value
```

Create Dealer A visible doc, Dealer A hidden doc, Dealer B visible doc. Assert Dealer A list returns only A-visible, Customer portal cannot use Dealer document function, foreign detail/download authorization is neutral, anon denied.

- [ ] **Step 2: Add Storage-policy assertions**

Validate `customer-documents` bucket is private and direct anonymous access is impossible. Validate policy/function authorization depends on customer ownership + `is_active` + `portal_visible` + matching bucket/path metadata.

- [ ] **Step 3: Run RED and commit**

Expected: FAIL because column/bucket/functions do not exist.

```bash
git add modulex-store/tests/smoke/store-dealer-documents.smoke.sql
git commit -m "test: define dealer document visibility"
```

### Task 13: Implement explicit Dealer document visibility, private Storage and account RPC

**Files:**
- Create: `modulex-store/supabase/migrations/20260828XXXXXX_store_dealer_documents_account.sql`

**Interfaces:**
- Produces:
  - `customer_documents.portal_visible boolean not null default false`
  - private bucket `customer-documents`
  - `public.get_store_dealer_documents()`
  - `public.get_store_dealer_document(p_document_id uuid)` or authorization helper used by download route
  - `public.get_store_dealer_account()`

- [ ] **Step 1: Add safe document column**

```sql
alter table public.customer_documents
  add column if not exists portal_visible boolean not null default false;
```

Do not backfill existing rows to true.

- [ ] **Step 2: Create private Storage bucket**

Insert/update bucket configuration as private with a bounded file-size limit and document MIME allowlist aligned with Admin upload requirements. Do not create a public bucket.

- [ ] **Step 3: Implement Dealer document list/detail authorization**

List returns only:

- `id`
- `document_type`
- `file_name`
- `mime_type`
- `file_size_bytes`
- `description`
- `created_at`

Do not return raw `storage_path`/bucket to the page unless the server download route needs them internally. Detail authorization derives Dealer customer and returns neutral unavailable on foreign/hidden/inactive docs.

- [ ] **Step 4: Implement read-only Dealer account RPC**

Return only:

```json
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "website": "...",
  "country_code": "US",
  "currency_code": "USD",
  "customer_since": "...",
  "price_group_name": "... only when pricing gate open ...",
  "addresses": []
}
```

Address entries include only active address/contact/default fields from the spec. Never expose sales rep IDs, credit hold/reason, discount notes, internal activity or admin controls.

- [ ] **Step 5: Harden Storage/RPC permissions and run smoke**

Expected: document smoke PASS, anon denied, Customer denied, foreign Dealer neutral, existing docs default hidden, rollback residue zero.

- [ ] **Step 6: Commit DB/document boundary**

```bash
git add modulex-store/supabase/migrations/20260828XXXXXX_store_dealer_documents_account.sql modulex-store/tests/smoke/store-dealer-documents.smoke.sql
git commit -m "feat: secure dealer documents and account data"
```

### Task 14: Add Admin customer-document upload/visibility controls

**Files:**
- Modify: `modulex-admin/src/components/customers/CustomerCard.tsx`
- Modify: `modulex-admin/src/lib/customers/types.ts`
- Modify: `modulex-admin/scripts/store-portal-admin-contract.mjs`

**Interfaces:**
- Consumes: private `customer-documents` Storage bucket, `customer_documents.portal_visible`.
- Produces explicit Admin upload and visibility management for customer documents.

- [ ] **Step 1: Extend Admin contract first**

Require CustomerCard source to reference:

```js
assert.match(customerCard, /customer-documents/);
assert.match(customerCard, /portal_visible/);
assert.match(customerCard, /storage_bucket/);
assert.match(customerCard, /storage_path/);
```

Also assert no upload path sets `portal_visible: true` implicitly.

- [ ] **Step 2: Extend CustomerDocument type**

```ts
export type CustomerDocument = {
  id: string;
  customer_id: string;
  document_type: string | null;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  description: string | null;
  is_active: boolean;
  portal_visible: boolean;
  created_at: string;
};
```

Match existing type conventions in the file and retain any currently defined fields.

- [ ] **Step 3: Implement explicit upload**

Admin-only upload flow:

```ts
const objectPath = `${customerId}/${crypto.randomUUID()}-${safeFileName}`;
const { error: uploadError } = await supabase.storage
  .from("customer-documents")
  .upload(objectPath, file, { upsert: false, contentType: file.type });

const { error: rowError } = await supabase.from("customer_documents").insert({
  customer_id: customerId,
  document_type: documentType || null,
  file_name: file.name,
  storage_bucket: "customer-documents",
  storage_path: objectPath,
  mime_type: file.type || null,
  file_size_bytes: file.size,
  description: description || null,
  portal_visible: false,
});
```

On metadata insert failure, remove the just-uploaded object so no orphan remains.

- [ ] **Step 4: Add explicit Dealer-visible toggle**

Only existing `canManagePortal` roles (`super_admin`, `admin`) can toggle it. Copy must make external effect clear, e.g. `Visible to Dealer Portal`. Customer portal visibility is not implied.

- [ ] **Step 5: Run Admin focused/full regressions**

```bash
cd modulex-admin
npm run smoke:store-portal-admin
npm run smoke:dealer-portal-admin
npx eslint src/components/customers/CustomerCard.tsx src/lib/customers/types.ts scripts/store-portal-admin-contract.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Admin document management**

```bash
git add modulex-admin/src/components/customers/CustomerCard.tsx modulex-admin/src/lib/customers/types.ts modulex-admin/scripts/store-portal-admin-contract.mjs
git commit -m "feat: manage dealer-visible customer documents"
```

### Task 15: Build Dealer Documents download flow and read-only Account page

**Files:**
- Create: `modulex-store/src/app/dealer/(portal)/documents/page.tsx`
- Create: `modulex-store/src/app/dealer/(portal)/documents/[id]/download/route.ts`
- Create: `modulex-store/src/app/dealer/(portal)/account/page.tsx`
- Modify: `modulex-store/src/lib/portal/dealer.ts`

**Interfaces:**
- Consumes Dealer document/account RPCs and server Supabase SSR client.
- Produces protected Dealer UI and short-lived signed document delivery.

- [ ] **Step 1: Add route/static assertions**

Contract requires Dealer Documents and Account routes and verifies the download route does not contain service-role environment names:

```js
const downloadRoute = read("src/app/dealer/(portal)/documents/[id]/download/route.ts");
assert.doesNotMatch(downloadRoute, /SERVICE_ROLE|SUPABASE_SECRET/);
assert.match(downloadRoute, /requireDealer|readStorePortalSession|get_store_dealer_document/);
assert.match(downloadRoute, /createSignedUrl/);
```

Adapt the auth-helper regex to the exact existing helper used in implementation.

- [ ] **Step 2: Add Dealer document/account helpers**

```ts
export async function getDealerDocuments(): Promise<DealerDocumentSummary[]>;
export async function getDealerDocument(id: string): Promise<DealerDocumentAuthorization | null>;
export async function getDealerAccount(): Promise<DealerAccountData | null>;
```

The page-facing document summary excludes storage paths.

- [ ] **Step 3: Implement authenticated signed download route**

Flow:

1. Require valid Dealer portal session/context.
2. Ask DB authorization function for the document.
3. If unavailable, return 404/redirect to neutral unavailable state.
4. Call the normal authenticated Supabase Storage client `createSignedUrl(storage_path, 60)` against `customer-documents`.
5. Redirect to the short-lived signed URL.

No browser/client component receives long-lived Storage credentials.

- [ ] **Step 4: Implement Documents page**

Render file name, type, description, size/date and Download action. Do not expose raw bucket/path.

- [ ] **Step 5: Implement read-only Account page**

Render company/contact/currency/customer-since and active addresses. Price-group name appears only if returned by the authorized account RPC. No edit forms/buttons.

- [ ] **Step 6: Run Store verification and commit**

```bash
cd modulex-store
npm run smoke:portal-experience
npm run smoke
npm run build
```

```bash
git add modulex-store/src/app/dealer modulex-store/src/lib/portal/dealer.ts modulex-store/scripts/portal-experience-contract.mjs
git commit -m "feat: add dealer documents and account views"
```

---

### Task 16: Apply migrations safely and run production rollback smoke

**Files:**
- No new application file required unless smoke fixes reveal an issue.

**Interfaces:**
- Consumes all three P1.5 migrations/smokes.
- Produces verified production schema with zero fixture residue.

- [ ] **Step 1: Verify migration order**

Ensure timestamps/order are:

1. fulfillment visibility
2. Dealer catalog/pricing
3. Dealer documents/account

Use final real timestamp filenames before applying; update static contract references to those exact names.

- [ ] **Step 2: Apply migrations with Supabase migration API**

Apply each migration once with clear snake_case migration names. Do not execute DDL through ad-hoc SQL.

- [ ] **Step 3: Verify grants from production catalog**

Query `information_schema.routine_privileges` / `has_function_privilege` so every new Store portal public function has:

- `authenticated_execute = true`
- `anon_execute = false`
- no unintended `PUBLIC` execute

- [ ] **Step 4: Run fulfillment rollback smoke on production**

Execute inside one transaction and rollback. Then query fixture markers; expected counts all zero.

- [ ] **Step 5: Run Dealer pricing rollback smoke on production**

Verify exact-tier pricing, closed-gate key omission, non-dealer denial, no fallback, foreign order isolation. Roll back and verify zero residue.

- [ ] **Step 6: Run Dealer document rollback smoke on production**

Verify default-hidden, Dealer-only visible, foreign denial and private bucket behavior. Roll back DB fixtures and delete any Storage object created solely for smoke before completion.

- [ ] **Step 7: Run Supabase Security + Performance Advisors**

Record new P1.5-specific findings separately from existing project backlog. Do not claim existing unrelated warnings were fixed.

### Task 17: Final regression, self-review, ready PR

**Files:**
- Modify tests/contracts only if verification exposes a real gap.
- PR metadata only after clean verification.

**Interfaces:**
- Produces a ready, non-draft PR; user remains responsible for merge/deploy.

- [ ] **Step 1: Run complete Store verification**

```bash
cd modulex-store
npm ci
npm run smoke
npm run lint
npm run build
```

Expected: PASS. If full lint contains pre-existing unrelated failures, run and report both full lint result and scoped changed-file lint; never silently omit the failure.

- [ ] **Step 2: Run complete Admin verification**

```bash
cd modulex-admin
npm ci
npm run smoke
npm run lint
npm run build
```

Expected: PASS, with the same explicit handling for genuinely pre-existing unrelated lint failures.

- [ ] **Step 3: Security boundary source review**

Search changed Store files and migrations for forbidden exposure:

```bash
rg -n "service_role|SUPABASE_SECRET|current_cost|margin|profit|payment_commission|internal_notes" modulex-store/src modulex-store/supabase/migrations
```

Review each hit. `internal_notes` may appear only in negative tests/migration exclusion logic, never a portal output builder/type/component. `payment_commission` may appear only in negative assertions or existing untouched context, never new Dealer output.

- [ ] **Step 4: Confirm invoice boundary**

Search portal navigation/routes/components for `invoice`, `payment`, `credit statement`, `e-invoice`; expected no new Customer/Dealer feature/navigation exposing those concepts.

- [ ] **Step 5: Compare branch to current `main`**

Confirm branch is not behind. If main advanced, sync main and rerun affected verification before PR.

- [ ] **Step 6: Create ready PR**

PR must be `draft=false` and include:

- P1.5A/B/C scope summary
- migration names and production-application status
- rollback-smoke evidence + zero residue
- Store/Admin build/smoke/lint evidence
- Supabase advisor result separated into new findings vs pre-existing backlog
- explicit Customer no-pricing boundary
- explicit invoice/e-invoice out-of-scope boundary
- explicit no Store service role
- note that Vercel deployment was not triggered

Do not merge the PR.

---

## Self-Review Checklist

### Spec coverage

- Theme unification: Tasks 1–4.
- Shared Account/Dealer auth shell: Tasks 2–3.
- Protected Customer/Dealer shell/navigation and responsive/accessibility primitives: Tasks 2–4.
- Customer Orders retained non-priced: Task 4 and final security review.
- Customer + Dealer Shipments: Tasks 5–8.
- Customer + Dealer Installations: Tasks 5–8.
- Dashboard fulfillment summary: Tasks 6 and 8.
- Dealer Catalog with exact assigned-tier pricing gate: Tasks 9–11.
- Dealer priced order detail with forbidden financial/internal exclusions: Tasks 9–11.
- Dealer Documents explicit visibility/private Storage: Tasks 12–15.
- Dealer read-only Account/Addresses: Tasks 13 and 15.
- Invoice/e-invoice exclusion: Global constraints + Task 17.
- Customer/dealer isolation, anon denial, neutral foreign IDs: Tasks 5–6, 9–10, 12–13, 16.
- Production rollback/no residue/advisors: Task 16.
- Store/Admin full regression and ready PR: Task 17.

### Placeholder scan

This plan intentionally uses `20260828XXXXXX` only as a filename scheduling marker before implementation; Task 16 requires replacing every marker with the final real timestamp filename before any migration is applied. There are no behavioral `TBD`/`TODO` placeholders or unspecified validation/error-handling steps.

### Type/interface consistency

- Fulfillment pages consume `getPortalShipments`, `getPortalShipment`, `getPortalInstallations`, `getPortalInstallation`, `getPortalDashboardSummary` from `src/lib/portal/fulfillment.ts`.
- Dealer pages consume `getDealerPricingContext`, `getDealerCatalogProducts`, `getDealerProductBySlug`, `getDealerOrder`, `getDealerDocuments`, `getDealerDocument`, `getDealerAccount` from `src/lib/portal/dealer.ts`.
- Customer Order rendering remains on the existing non-priced `PortalOrderDetailData`; Dealer Order rendering uses a distinct Dealer type and `kind="dealer"` branch.
- Shared `PortalShell` consumes the already-authorized context passed by protected route-group layouts; it does not perform authorization itself.
