# Modulex US Date Format Standardization Design

Date: 2026-09-07
Status: Approved direction; implementation pending
Scope: `modulex-admin` + `modulex-store` public/Customer Portal/Dealer Portal surfaces

## Goal

Standardize every user-facing calendar date in Modulex to the explicit U.S. presentation format `MM.DD.YYYY` without changing the canonical database/RPC/storage representation of dates or timestamps.

The user-facing contract is deterministic and does not depend on browser locale. The data contract remains ISO-compatible and timezone-safe.

## Chosen architecture

Modulex separates **presentation format** from **canonical data format**:

- User-facing date-only display: `MM.DD.YYYY`.
- User-entered date-only values: `MM.DD.YYYY`.
- Canonical `date` values sent to Supabase/RPCs: `YYYY-MM-DD`.
- Canonical `timestamp` / `timestamptz` values remain ISO timestamps and preserve their existing timezone semantics.
- User-facing date-time values use `MM.DD.YYYY` for the date portion and retain an explicit time portion where the product already shows time.
- No database migration is required solely for display formatting.

This design deliberately avoids relying on native `<input type="date">` presentation because browsers/operating systems control that visual format and cannot guarantee the dotted `MM.DD.YYYY` contract.

## Approaches considered

### 1. Keep native date inputs and set `lang="en-US"`

Rejected. This may influence browser presentation but does not guarantee `MM.DD.YYYY`, does not guarantee dot separators, and still varies by browser/OS.

### 2. Route-local formatting/parsing

Rejected. Ad-hoc `Intl.DateTimeFormat`, `toLocaleDateString`, `new Date("YYYY-MM-DD")`, or string replacement would create inconsistent timezone and parsing behavior.

### 3. Shared deterministic date contract

Chosen. Each application surface consumes reviewed shared date utilities and a shared date input primitive. Feature routes do not own date parsing or date appearance.

## Date-only semantics

A database `date` value is a calendar date, not a moment in time. Date-only code must therefore avoid implicit UTC conversion.

Required rules:

1. `2026-09-07` displays as `09.07.2026` in every timezone.
2. `09.07.2026` parses to canonical `2026-09-07`.
3. Invalid dates such as `02.30.2026`, `13.01.2026`, incomplete values, or ambiguous free-form text fail validation rather than being normalized by JavaScript date parsing.
4. Empty optional date fields normalize to `null`/empty canonical state according to the existing mutation contract.
5. Existing DB relational date constraints remain authoritative.

## Timestamp semantics

Timestamp and `timestamptz` fields remain moments in time and must not be converted using date-only helpers.

- Preserve existing product timezone behavior unless a surface already has an explicit business/user timezone setting.
- Standardize only the rendered date pattern to `MM.DD.YYYY`.
- Preserve existing time information for audit logs, activity feeds, order history, shipments, installations, finance events, notifications, and similar timestamped records.
- Do not hard-code a new U.S. timezone as part of this formatting package.
- Do not parse a timestamp by slicing it into a date-only string unless the underlying domain intentionally treats it as a calendar date.

## Shared input behavior

All editable date-only fields that currently rely on native date formatting move to a reviewed shared date input contract.

The shared date input must:

- visibly use `MM.DD.YYYY`;
- support controlled `value`, `onChange`, required/optional, disabled, error and hint states consistent with existing Modulex form primitives;
- accept only a strict calendar date;
- expose validation feedback without submitting ambiguous text;
- serialize accepted values to canonical `YYYY-MM-DD` before existing mutations/RPCs;
- hydrate canonical `YYYY-MM-DD` values back to `MM.DD.YYYY` without timezone conversion;
- remain keyboard accessible;
- not create route-specific visual styling;
- preserve existing business validation and mutation ownership.

A calendar popover may exist only through the shared primitive. The textual value shown to the user remains `MM.DD.YYYY` regardless of browser locale.

## Shared display behavior

Feature routes must not hand-roll date display. Shared formatters cover these semantic cases:

- `formatDate` — date-only/database `date` → `MM.DD.YYYY`.
- `formatDateTime` — timestamp → `MM.DD.YYYY` plus the existing required time representation.
- `parseDateInput` — strict `MM.DD.YYYY` → `YYYY-MM-DD` or validation failure.
- `formatDateInput` — canonical `YYYY-MM-DD` → `MM.DD.YYYY`.

Names may follow established repository naming discovered during implementation, but this semantic separation is mandatory.

## Scope of repository audit

Implementation audits both applications for human-facing date handling, including:

- native date inputs;
- placeholders/help text such as `dd.mm.yyyy`, `yyyy-mm-dd`, or locale-dependent examples;
- `Intl.DateTimeFormat` calls;
- `toLocaleDateString` / `toLocaleString` calls;
- direct `new Date(...)` formatting paths;
- substring/split-based date formatting;
- tables, cards, detail pages, dashboards, filters and reports;
- Customer Portal and Dealer Portal order/fulfillment views;
- Admin Project, Customer, Order, Shipment, Installation, Inventory, Product, Vendor, HR/Personnel, Calendar, Finance, CMS and settings surfaces where dates are visible or editable.

Machine-readable payloads, DB migrations, SQL literals, API contracts, machine logs, filenames, migration timestamps, and test fixtures are not changed merely for visual consistency.

## Admin UI integration

`modulex-admin` follows `ADMIN_UI_GUIDE.md` and `ADMIN_VALIDATION_GUIDE.md`:

- extend/reuse the shared form layer rather than creating feature-local date controls;
- keep DB/RPC validation authoritative;
- explicitly normalize date input before mutation;
- avoid implicit browser date parsing;
- pass the strict changed-file Admin UI gate for every touched feature file.

## Store and portal integration

`modulex-store` uses the same presentation/data semantics for public, Customer Portal and Dealer Portal surfaces. Public content dates, if rendered, follow `MM.DD.YYYY`. Portal business dates and timestamped fulfillment/history data retain the date-only versus moment-in-time distinction. Access-control and projection boundaries are unchanged.

## Compatibility and data safety

This package is presentation/normalization work, not a data migration. It must not:

- rewrite stored business dates solely to change display;
- change PostgreSQL column types;
- change existing timezone semantics;
- broaden RPC/table projections;
- weaken RLS/grants/RBAC;
- bypass existing mutation RPCs;
- change order, fulfillment, finance, HR, pricing, inventory, or project lifecycle rules.

Existing canonical values remain backward-compatible with server/database consumers.

## Testing strategy

Testing is contract-first and covers utility behavior and affected UI surfaces.

Required cases:

- `2026-01-05` → `01.05.2026`;
- `12.31.2026` → `2026-12-31`;
- leap day `02.29.2028` accepted;
- `02.29.2027` rejected;
- `02.30.2026` rejected;
- `13.01.2026` rejected;
- incomplete and malformed input rejected;
- date-only round trip does not change across timezone boundaries;
- timestamp formatter preserves the time-bearing nature of the value.

Repository-level regression guards against newly introduced locale-dependent date rendering and newly introduced native date inputs outside the reviewed shared primitive.

Final verification includes affected Admin/Store targeted contracts, Admin strict UI checks, TypeScript, lint and production builds for both applications. Browser/live acceptance samples representative Admin, Customer Portal and Dealer Portal date-entry/display paths after deployment.

## Rollout strategy

1. Establish shared parser/formatter/date-input contracts and RED tests.
2. Convert Admin date-only input fields and shared date display paths.
3. Convert Store/Customer Portal/Dealer Portal date display/input paths.
4. Audit the repository for remaining locale-dependent or native date handling and classify intentional machine/internal exceptions.
5. Run full cross-surface regression/build gates.
6. After merge/deploy, perform representative signed-in production acceptance before marking roadmap work complete.

## Roadmap ownership

This is a cross-roadmap consistency package. During implementation:

- add/update an active standardization item in `modulex-admin/ADMIN_ROADMAP.md`;
- add/update the corresponding cross-surface item in `modulex-store/STORE_ROADMAP.md`;
- keep both `[~]` until required regression and deployed acceptance criteria are complete;
- mark `[x]` only after post-deploy verification.

## Non-goals

- No localization framework.
- No user-selectable date-format setting.
- No new timezone-setting product feature.
- No database date/timestamp type conversion solely for presentation.
- No unrelated UI restyling or business-rule refactoring.

## Acceptance criteria

The package is complete when:

1. Every reviewed human-facing calendar date in Admin, Store, Customer Portal and Dealer Portal renders with a `MM.DD.YYYY` date portion.
2. Every reviewed editable date-only field visibly accepts `MM.DD.YYYY` and sends the existing canonical date contract to its mutation boundary.
3. Date-only values are not shifted by timezone conversion.
4. Timestamp values retain their meaningful time component and existing timezone semantics.
5. No feature route depends on browser locale to decide its date format.
6. Cross-surface automated regressions, typecheck, lint and production builds pass.
7. Representative deployed Admin and portal acceptance confirms the standard in production.
