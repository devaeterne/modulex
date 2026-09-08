# Modulex US Date Format Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize every human-facing Modulex calendar date to deterministic `MM.DD.YYYY` while preserving canonical `YYYY-MM-DD` date values, ISO timestamps, existing timezone semantics, authorization, and business rules.

**Architecture:** Admin and Store each receive a small pure date module with identical date-only semantics and timestamp presentation rules. Admin additionally receives a reviewed shared `DateInput` primitive that displays/accepts `MM.DD.YYYY` but emits canonical `YYYY-MM-DD`; feature routes consume the shared primitive/formatters rather than native date inputs or route-local locale formatting. A repository audit/guard inventories current date usage first, provides the exact conversion manifest for the feature migration tasks, and becomes the regression boundary that prevents native/locale-dependent date presentation from returning.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node.js contract scripts, existing Modulex Admin form primitives, existing Admin/Store smoke chains.

**Spec:** `docs/superpowers/specs/2026-09-07-us-date-format-standardization-design.md`

## Global Constraints

- Human-facing date-only display and input is exactly `MM.DD.YYYY`.
- Canonical PostgreSQL/RPC `date` values remain `YYYY-MM-DD`.
- Canonical `timestamp`/`timestamptz` values remain ISO timestamps with existing timezone semantics.
- A database `date` is a calendar date; never parse `YYYY-MM-DD` with `new Date(...)` for display or mutation normalization.
- Timestamp display keeps its meaningful time component; this package changes the rendered date pattern, not the domain timezone.
- No DB migration, column-type change, RLS/grant/RBAC change, projection widening, lifecycle change, or stored-data rewrite is allowed solely for formatting.
- Admin feature UI must use reviewed shared form primitives and pass `smoke:admin-ui-strict` plus Admin UI regression.
- Do not add a new GitHub Actions workflow. Extend existing package smoke/CI ownership only.
- Both Admin and Store roadmaps remain `[~]` until merge/deploy and representative production acceptance are complete.

---

### Task 1: Build the deterministic repository date-usage inventory and regression scanner

**Files:**
- Create: `scripts/us-date-format-audit.mjs`
- Create: `docs/acceptance/us-date-format-audit.json`
- Test: `scripts/us-date-format-audit.mjs` self-test mode

**Interfaces:**
- Produces CLI: `node scripts/us-date-format-audit.mjs --write`
- Produces CLI: `node scripts/us-date-format-audit.mjs --check`
- Produces manifest schema:
  ```json
  {
    "generated_at": "<ISO timestamp>",
    "admin": { "findings": [] },
    "store": { "findings": [] }
  }
  ```
- Each finding contains `{ "path", "line", "category", "snippet" }` where `category` is one of `native-date-input`, `locale-date-display`, `intl-date-display`, `manual-date-construction`, `date-placeholder`.
- Tasks 4 and 5 consume this manifest; no date-bearing feature path may be skipped merely because GitHub code search indexing is incomplete.

- [ ] **Step 1: Write scanner self-tests before scanner implementation**

Add an internal `--self-test` fixture to `scripts/us-date-format-audit.mjs` that asserts these strings are classified correctly:

```js
const cases = [
  ['<Input type="date" />', 'native-date-input'],
  ['<input type="date" />', 'native-date-input'],
  ['value.toLocaleDateString()', 'locale-date-display'],
  ['new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })', 'intl-date-display'],
  ['new Date(value).toLocaleString()', 'manual-date-construction'],
  ['placeholder="dd.mm.yyyy"', 'date-placeholder'],
  ['placeholder="yyyy-mm-dd"', 'date-placeholder'],
];
```

The self-test must also assert machine/internal exclusions are not reported: SQL/migrations, generated `.next`, `node_modules`, lockfiles, test fixtures whose purpose is canonical ISO data, and the approved shared date utility files introduced in Tasks 2–3.

- [ ] **Step 2: Run the self-test and verify RED**

Run from repo root:

```bash
node scripts/us-date-format-audit.mjs --self-test
```

Expected before implementation: non-zero exit because classifier/scanner behavior is not implemented.

- [ ] **Step 3: Implement recursive source scanning**

Scan only human-facing source roots:

```js
const roots = [
  'modulex-admin/src',
  'modulex-store/src',
];
```

Walk `.ts`, `.tsx`, `.js`, `.jsx` files; preserve 1-based line numbers. Classify patterns conservatively. `new Date(...)` is an audit finding, not automatically a final failure, because timestamp code may legitimately construct a `Date`; Tasks 4–5 must classify each such finding as date-only presentation, timestamp presentation, or non-presentation logic before it can be removed from the unresolved manifest.

- [ ] **Step 4: Run self-test GREEN and write baseline manifest**

```bash
node scripts/us-date-format-audit.mjs --self-test
node scripts/us-date-format-audit.mjs --write
```

Expected: self-test PASS and `docs/acceptance/us-date-format-audit.json` contains exact Admin/Store feature findings from current branch source.

- [ ] **Step 5: Commit inventory tooling**

```bash
git add scripts/us-date-format-audit.mjs docs/acceptance/us-date-format-audit.json
git commit -m "test: inventory Modulex date presentation usage"
```

---

### Task 2: Add deterministic date-only and timestamp formatters to Admin and Store

**Files:**
- Create: `modulex-admin/src/lib/dates/usDate.ts`
- Create: `modulex-store/src/lib/dates/usDate.ts`
- Create: `modulex-admin/scripts/us-date-format-contract.mjs`
- Create: `modulex-store/scripts/us-date-format-contract.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `modulex-store/package.json`

**Interfaces:**
- Both app modules export the same public contract:

```ts
export type DateInputParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function formatDateOnly(value: string | null | undefined): string;
export function formatDateInput(value: string | null | undefined): string;
export function parseDateInput(value: string): DateInputParseResult;
export function formatDateTime(
  value: string | Date | null | undefined,
  options?: { timeStyle?: 'short' | 'medium'; timeZone?: string }
): string;
```

- `formatDateOnly`/`formatDateInput` never instantiate a `Date` from a canonical date-only string.
- `formatDateTime` parses a timestamp/moment and returns `MM.DD.YYYY` plus the time string. Omitting `timeZone` preserves the runtime's existing local timezone behavior.

- [ ] **Step 1: Write failing contract vectors in both app scripts**

Each contract must assert at least:

```js
[
  ['formatDateOnly', '2026-01-05', '01.05.2026'],
  ['formatDateInput', '2026-09-07', '09.07.2026'],
  ['parseDateInput', '12.31.2026', '2026-12-31'],
  ['parseDateInput', '02.29.2028', '2028-02-29'],
]
```

And rejection cases:

```js
['02.29.2027', '02.30.2026', '13.01.2026', '1.2.2026', '2026-09-07', '']
```

For optional empty input, the parser must return `{ ok: false, error: 'Enter a date as MM.DD.YYYY.' }`; optional-null handling remains the caller's explicit mutation decision.

Timestamp contract must assert that `2026-09-07T15:30:00Z` produces a string whose date portion matches `\d{2}\.\d{2}\.\d{4}` and whose time portion is present. When the test passes an explicit `timeZone: 'UTC'`, the date must be `09.07.2026`.

- [ ] **Step 2: Wire contract commands and verify RED**

Add package scripts:

```json
"smoke:us-date-format": "node scripts/us-date-format-contract.mjs"
```

Run:

```bash
cd modulex-admin && npm run smoke:us-date-format
cd ../modulex-store && npm run smoke:us-date-format
```

Expected: both fail because the utility modules do not yet exist.

- [ ] **Step 3: Implement strict date-only validation without timezone conversion**

Use explicit regex + calendar arithmetic, not JavaScript's permissive date parser:

```ts
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isCalendarDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}
```

`formatDateOnly('2026-09-07')` must validate components and return `09.07.2026`; malformed canonical input returns `—` for display helpers rather than guessing.

- [ ] **Step 4: Implement timestamp formatting with deterministic dotted date portion**

Use `Intl.DateTimeFormat(...).formatToParts()` to obtain month/day/year in the timestamp's existing runtime timezone, reconstruct only the date portion with dots, and format the time independently. Do not slice a timestamp into a date-only string.

- [ ] **Step 5: Run both contracts GREEN**

```bash
cd modulex-admin && npm run smoke:us-date-format
cd ../modulex-store && npm run smoke:us-date-format
```

Expected: PASS for both apps with identical date-only vectors.

- [ ] **Step 6: Commit shared formatter layer**

```bash
git add modulex-admin/src/lib/dates/usDate.ts modulex-admin/scripts/us-date-format-contract.mjs modulex-admin/package.json \
        modulex-store/src/lib/dates/usDate.ts modulex-store/scripts/us-date-format-contract.mjs modulex-store/package.json
git commit -m "feat: add deterministic US date format contract"
```

---

### Task 3: Add the canonical Admin date-only input primitive

**Files:**
- Create: `modulex-admin/src/components/form/DateInput.tsx`
- Modify: `modulex-admin/src/components/form/date-picker.tsx`
- Create: `modulex-admin/scripts/admin-date-input-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**

```ts
type DateInputProps = {
  id: string;
  value: string; // canonical YYYY-MM-DD or empty string
  onChange: (canonicalValue: string) => void;
  placeholder?: string; // defaults to MM.DD.YYYY
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  hint?: string;
  ariaLabel?: string;
};
```

- Visible input is text using the existing shared `Input` primitive, `inputMode="numeric"`, default placeholder `MM.DD.YYYY`.
- Component keeps a display buffer (`MM.DD.YYYY`) separate from canonical parent state.
- A valid complete value calls `onChange('YYYY-MM-DD')`.
- Empty input calls `onChange('')`.
- An invalid/incomplete non-empty value never emits a fabricated canonical date and exposes an error/hint on blur.
- Existing `date-picker.tsx` remains backward-compatible for any current consumers, but its visible single-date format becomes `m.d.Y`; it may not show `Y-m-d` to users.

- [ ] **Step 1: Write failing structural/behavior contract**

`admin-date-input-contract.mjs` must require:

- `DateInput.tsx` imports `formatDateInput` and `parseDateInput`.
- It renders shared `Input`, not a feature-local native `<input>`.
- Default placeholder is `MM.DD.YYYY`.
- It does not render `type="date"`.
- It only emits canonical parsed values or `''`.
- `date-picker.tsx` does not use visible `dateFormat: "Y-m-d"`; its single-date display is dotted U.S. format.

- [ ] **Step 2: Wire contract and verify RED**

Add:

```json
"smoke:admin-date-input": "node scripts/admin-date-input-contract.mjs"
```

Run:

```bash
cd modulex-admin && npm run smoke:admin-date-input
```

Expected: FAIL because `DateInput.tsx` is missing.

- [ ] **Step 3: Implement `DateInput` as a controlled shared form primitive**

Use `Input` and the Task 2 parser/formatter. Do not place visual Tailwind ownership in feature routes. On canonical prop changes, synchronize the visible buffer with `formatDateInput(value)`; while the user is actively typing, preserve the typed buffer until blur/valid completion.

- [ ] **Step 4: Standardize the existing Flatpickr shared picker**

For single-date mode, its visible textual date must be `m.d.Y`. Preserve time/range/multiple behavior and existing callback contract; this task must not force feature migrations onto a different mutation API.

- [ ] **Step 5: Run shared input + Admin UI strict contracts**

```bash
cd modulex-admin
npm run smoke:admin-date-input
npm run smoke:admin-ui-strict:self-test
```

Expected: PASS.

- [ ] **Step 6: Commit shared input primitive**

```bash
git add modulex-admin/src/components/form/DateInput.tsx modulex-admin/src/components/form/date-picker.tsx \
        modulex-admin/scripts/admin-date-input-contract.mjs modulex-admin/package.json
git commit -m "feat: add shared MM.DD.YYYY date input"
```

---

### Task 4: Convert every Admin human-facing date path from the generated manifest

**Files:**
- Modify: every `modulex-admin/src/**` path listed in `docs/acceptance/us-date-format-audit.json` after Task 1 classification as human-facing date input/display.
- Modify: `docs/acceptance/us-date-format-audit.json`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Test: existing domain contracts for each touched Admin domain plus `modulex-admin/scripts/us-date-format-contract.mjs` and `modulex-admin/scripts/admin-date-input-contract.mjs`

**Interfaces:**
- Date-only editable fields use `DateInput` and keep local/domain state canonical (`YYYY-MM-DD` or `''`).
- Date-only display uses `formatDateOnly`.
- Timestamp display uses `formatDateTime`; existing time visibility is retained.
- `new Date(canonicalDateOnly)` is prohibited for date-only values.
- Mutation/RPC payload field names and canonical value types remain unchanged.

- [ ] **Step 1: Classify every Admin finding before editing**

For each Admin manifest row, add `semantic` as exactly one of:

```json
"date-only-input"
"date-only-display"
"timestamp-display"
"non-presentation"
```

For `non-presentation`, add a short `reason` explaining why the use is internal date arithmetic, timestamp construction, or machine serialization. No unresolved row may be deleted silently.

- [ ] **Step 2: Create a RED Admin audit gate**

Run:

```bash
node scripts/us-date-format-audit.mjs --check --scope admin
```

Expected before migrations: FAIL listing native date inputs and locale-dependent human date formatting still present in Admin feature source.

- [ ] **Step 3: Migrate date-only inputs domain by domain**

Start with Project/Customer/Order/Fulfillment paths because they contain business-critical date mutations. For each manifest row:

```tsx
<DateInput
  id="..."
  value={canonicalDateValue}
  onChange={setCanonicalDateValue}
  required={...}
/>
```

Then convert remaining Admin domains represented by the manifest: Inventory/Product/Vendor, HR/Personnel, Calendar, Finance, CMS/settings, reports, notifications, or other currently present sources. Do not invent a domain if the manifest contains no date field there.

- [ ] **Step 4: Migrate Admin date-only displays**

Replace route-local `Intl.DateTimeFormat`, `toLocaleDateString`, string splitting, or `new Date(YYYY-MM-DD)` display with:

```ts
formatDateOnly(value)
```

Example acceptance: Project target date `2026-09-07` renders `09.07.2026` in table/detail views without timezone shift.

- [ ] **Step 5: Migrate Admin timestamp displays without losing time**

Replace human-facing timestamp date formatting with:

```ts
formatDateTime(value, { timeStyle: 'short' })
```

or `timeStyle: 'medium'` where the existing UI already showed seconds. Preserve explicit existing `timeZone` behavior where a surface had one; do not add a new timezone policy.

- [ ] **Step 6: Re-run impacted domain contracts after each domain group**

Use the existing package scripts already owning those files. Minimum cross-domain gates after all Admin conversions:

```bash
cd modulex-admin
npm run smoke:us-date-format
npm run smoke:admin-date-input
npm run smoke:admin-ui-strict
npm run smoke:admin-ui-regression
npm run smoke:production-surface
npm run smoke:rbac
```

Expected: PASS. If a domain-specific contract fails because copy/format assertions changed, update only the assertion that represents human-facing date format; do not weaken business behavior checks.

- [ ] **Step 7: Re-run Admin audit until zero unresolved human-facing violations**

```bash
cd ..
node scripts/us-date-format-audit.mjs --write
node scripts/us-date-format-audit.mjs --check --scope admin
```

Expected: PASS. `non-presentation` findings remain documented/allowlisted with reasons rather than hidden.

- [ ] **Step 8: Mark Admin roadmap package active**

Add an `[~]` cross-surface date-standardization entry stating that UI uses `MM.DD.YYYY`, DB/RPC remains canonical ISO/date, no migration is introduced, and production acceptance is still pending.

- [ ] **Step 9: Commit Admin migration**

```bash
git add modulex-admin/src modulex-admin/ADMIN_ROADMAP.md docs/acceptance/us-date-format-audit.json
git commit -m "feat(admin): standardize user-facing dates"
```

---

### Task 5: Convert Store, Customer Portal, and Dealer Portal date paths

**Files:**
- Modify: every `modulex-store/src/**` path listed in `docs/acceptance/us-date-format-audit.json` after classification as human-facing date input/display.
- Modify: `docs/acceptance/us-date-format-audit.json`
- Modify: `modulex-store/STORE_ROADMAP.md`
- Test: existing Store portal/public contracts plus `modulex-store/scripts/us-date-format-contract.mjs`

**Interfaces:**
- Public Store date-only content uses `formatDateOnly`.
- Customer/Dealer Portal business calendar dates use `formatDateOnly`.
- Portal order/shipment/installation/history timestamps use `formatDateTime` and retain time where previously shown.
- Store data fetching, auth, public projections, Customer/Dealer isolation and noindex behavior are unchanged.

- [ ] **Step 1: Classify every Store finding using the same four semantic values as Task 4**

Do not treat server-side timestamps, cache timestamps, sitemap timestamps, cookie/session expirations, or machine metadata as user-facing solely because they contain `Date` code. Human-rendered values must be converted; machine/internal values remain documented `non-presentation` findings.

- [ ] **Step 2: Verify Store audit RED**

```bash
node scripts/us-date-format-audit.mjs --check --scope store
```

Expected before migration: FAIL when current public/portal human-facing locale-dependent date presentation remains.

- [ ] **Step 3: Convert public and portal date-only displays**

Use:

```ts
formatDateOnly(value)
```

No public/portal projection or database field is changed.

- [ ] **Step 4: Convert Customer/Dealer timestamp displays**

Use:

```ts
formatDateTime(value, { timeStyle: 'short' })
```

or `medium` only where seconds were previously meaningful. Preserve the existing timezone semantics of each route.

- [ ] **Step 5: Convert any editable Store/portal date-only inputs found by the manifest**

If the manifest contains editable date-only inputs in Store/portal, implement a Store shared controlled input under `modulex-store/src/components/...` only if such an input actually exists. It must consume the Task 2 parser and emit canonical `YYYY-MM-DD`; do not add an unused Store date-input component when no editable date exists.

- [ ] **Step 6: Run Store contracts and audit GREEN**

```bash
cd modulex-store
npm run smoke:us-date-format
npm run smoke
cd ..
node scripts/us-date-format-audit.mjs --write
node scripts/us-date-format-audit.mjs --check --scope store
```

Expected: PASS with no unresolved human-facing date-format violations.

- [ ] **Step 7: Mark Store roadmap package active**

Add `[~]` cross-surface date-standardization entry matching the Admin decision and explicitly stating that public/portal access-control and data projections are unchanged.

- [ ] **Step 8: Commit Store/portal migration**

```bash
git add modulex-store/src modulex-store/STORE_ROADMAP.md docs/acceptance/us-date-format-audit.json
git commit -m "feat(store): standardize user-facing dates"
```

---

### Task 6: Turn the scanner into a permanent regression gate owned by existing CI

**Files:**
- Modify: `scripts/us-date-format-audit.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `modulex-store/package.json`
- Modify: existing `.github/workflows/admin-ui-foundation.yml` only if the existing Admin smoke chain does not already invoke the new package script transitively.
- Modify: existing Store core workflow only if the existing Store smoke chain does not already invoke the new package script transitively.
- Test: `scripts/us-date-format-audit.mjs --self-test`

**Interfaces:**
- `--check --scope admin|store|all` exits non-zero for:
  - native `type="date"` in human-facing feature source outside reviewed shared primitive ownership;
  - route-local human-facing `toLocaleDateString`/date-bearing `toLocaleString`;
  - route-local date-bearing `Intl.DateTimeFormat` outside shared date utilities;
  - blocked date placeholders such as `dd.mm.yyyy` or `yyyy-mm-dd` in human-facing input copy.
- Legitimate timestamp construction/internal date arithmetic remains allowlisted only with manifest reason.

- [ ] **Step 1: Add RED regression fixtures for prohibited reintroduction**

Self-test must confirm each prohibited pattern causes check failure when placed in a synthetic feature file and that the shared utility paths are allowed.

- [ ] **Step 2: Add package scripts without creating a new workflow**

Admin:

```json
"smoke:date-format-audit": "node ../scripts/us-date-format-audit.mjs --check --scope admin"
```

Store:

```json
"smoke:date-format-audit": "node ../scripts/us-date-format-audit.mjs --check --scope store"
```

Append each to the existing appropriate smoke chain so normal PR CI owns regression coverage. If the existing workflow runs package `npm run smoke`, no workflow YAML edit is necessary.

- [ ] **Step 3: Run regression self-test and package gates**

```bash
node scripts/us-date-format-audit.mjs --self-test
cd modulex-admin && npm run smoke:date-format-audit
cd ../modulex-store && npm run smoke:date-format-audit
```

Expected: PASS.

- [ ] **Step 4: If workflow YAML changed, run CI architecture contract**

```bash
cd ../modulex-admin && npm run smoke:ci-workflow-architecture
```

Expected: PASS. Skip this command when workflow files were untouched.

- [ ] **Step 5: Commit permanent regression guard**

```bash
git add scripts/us-date-format-audit.mjs modulex-admin/package.json modulex-store/package.json .github/workflows
git commit -m "test: guard Modulex US date presentation standard"
```

---

### Task 7: Run full cross-surface verification and prepare owner review

**Files:**
- Modify: `docs/acceptance/us-date-format-audit.json` only if final regeneration changes it.
- Modify: `modulex-admin/ADMIN_ROADMAP.md` and `modulex-store/STORE_ROADMAP.md` only to record final pre-deploy verification evidence; keep status `[~]` until deployed acceptance.

**Interfaces:**
- No schema/RPC migration is expected. Supabase Security/Performance Advisors are therefore not required for this formatting-only package unless implementation unexpectedly changes schema, RLS, grants, functions, RPCs, or material query behavior.

- [ ] **Step 1: Rebase/merge current `main` before the final gate**

Because Modulex has parallel workstreams, incorporate execution-time current `main` and resolve only genuine date-standardization conflicts. Re-run targeted contracts after conflict resolution.

- [ ] **Step 2: Run final Admin verification**

```bash
cd modulex-admin
npm run smoke:us-date-format
npm run smoke:admin-date-input
npm run smoke:admin-ui-strict
npm run smoke:admin-ui-regression
npm run smoke:production-surface
npm run smoke:rbac
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0. Existing warnings may remain only if the repo's current accepted baseline treats them as non-errors; no new date-package lint/build error is acceptable.

- [ ] **Step 3: Run final Store verification**

```bash
cd ../modulex-store
npm run smoke:us-date-format
npm run smoke
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Run final repository audit**

```bash
cd ..
node scripts/us-date-format-audit.mjs --write
node scripts/us-date-format-audit.mjs --check --scope all
```

Expected: zero unresolved human-facing violations; all retained internal/machine findings carry explicit reasons.

- [ ] **Step 5: Update both roadmaps with pre-deploy evidence**

Record exact final-head contract/build evidence and leave the package `[~]` with one remaining gate: representative deployed Admin + Customer Portal + Dealer Portal acceptance.

- [ ] **Step 6: Commit final verification artifacts**

```bash
git add docs/acceptance/us-date-format-audit.json modulex-admin/ADMIN_ROADMAP.md modulex-store/STORE_ROADMAP.md
git commit -m "docs: record US date format verification"
```

- [ ] **Step 7: Open a non-draft PR to `main`**

PR body must state:

- user-facing standard is `MM.DD.YYYY`;
- DB/RPC/storage date/timestamp contracts are unchanged;
- no schema/RLS/grant migration exists;
- date-only values are timezone-safe;
- timestamps retain time and existing timezone behavior;
- Admin + Store/Customer/Dealer verification commands and results;
- production acceptance remains required after merge/deploy before roadmap `[x]` closeout.

---

### Task 8: Post-merge deployed acceptance and roadmap closeout

**Files:**
- Modify after acceptance: `modulex-admin/ADMIN_ROADMAP.md`
- Modify after acceptance: `modulex-store/STORE_ROADMAP.md`
- Optional acceptance note: `docs/acceptance/us-date-format-production.md`

**Interfaces:**
- This task begins only after owner merge/deploy.
- Read-only/safe UI acceptance is sufficient; no production business-data mutation is required just to verify date presentation.

- [ ] **Step 1: Verify representative Admin date input/display**

Use a signed-in Admin route containing an editable date-only field such as Project target date. Confirm visually:

- placeholder/value uses `MM.DD.YYYY`;
- existing canonical date renders with dots;
- calendar date does not shift by one day;
- nearby table/detail date display uses the same standard.

Do not persist a production mutation solely for acceptance unless the owner explicitly requests it; inspection plus safe rollback-only behavior is preferred.

- [ ] **Step 2: Verify representative Customer Portal date display**

Confirm an order/fulfillment date renders `MM.DD.YYYY`; if the row is timestamp-based, confirm the time remains visible.

- [ ] **Step 3: Verify representative Dealer Portal date display**

Confirm the same date/timestamp standard without changing dealer access isolation or commercial projection behavior.

- [ ] **Step 4: Close both roadmap entries only after deployed evidence**

Change `[~]` to `[x]` in both roadmaps and record the deployment/acceptance evidence. If any representative surface still exposes browser-locale date formatting, keep `[~]`, record the failing route, and fix it in the same workstream before closeout.

- [ ] **Step 5: Commit closeout documentation**

```bash
git add modulex-admin/ADMIN_ROADMAP.md modulex-store/STORE_ROADMAP.md docs/acceptance/us-date-format-production.md
git commit -m "docs: close US date format standardization"
```

## Self-review results

- Spec coverage: all seven acceptance criteria are mapped to Tasks 1–8; Admin input, cross-surface displays, date-only timezone safety, timestamp preservation, regression prevention, full builds and post-deploy acceptance are explicit.
- Placeholder scan: no implementation step contains `TBD`, `TODO`, or an unspecified "handle appropriately" instruction. The manifest is an intentional generated interface from Task 1, not an unresolved placeholder; it is the source of exact feature paths for Tasks 4–5.
- Type consistency: Admin and Store date modules expose identical `formatDateOnly`, `formatDateInput`, `parseDateInput`, and `formatDateTime` signatures. `DateInput` consumes canonical `YYYY-MM-DD` and emits the same canonical type expected by existing mutations.
- Scope: no DB migration, localization framework, timezone product setting, business-rule refactor, or new CI workflow is introduced.